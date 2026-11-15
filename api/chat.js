// POST /api/chat — Gemini chat proxy with model fallback chain.
// Body: { question: string, chunk_ids: number[] }  (the prompt is built here, server-side;
// 2026-11-15: the old { prompt } body let anyone use RI's Gemini key as an open proxy)
// Returns: { answer: string, model: string }
// Falls through 2.5-flash → 2.0-flash → 2.0-flash-lite → 1.5-flash on 429/503.

const CHAT_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
]

const chatUrl = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

const SYSTEM_PROMPT = `You are a scholar-docent for the Marcus Garvey Living Archive — a conversational interface over the writings of Marcus Garvey (1887-1940), founder of the Universal Negro Improvement Association (UNIA) and the Black Star Line.

You speak with the care of a historian and the directness of a community member. Let Garvey's quoted words carry the oratory; your own sentences stay plain and careful.

STRICT RULES:
1. Answer using ONLY the provided excerpts from Garvey's own writings. Never invent quotes or claims.
2. If the excerpts don't answer the question, say so honestly. Do not fill gaps with speculation.
3. When you cite Garvey, use phrases like "Garvey wrote..." or "In Philosophy and Opinions, Garvey argued..." Quote sparingly but precisely.
4. The excerpts are from the Journal of Pan African Studies 2009 edition of the 1923 book. Quote them exactly; never change Garvey's words. Some excerpts include the editor Amy Jacques Garvey's preface: never present her sentences as Marcus Garvey's. When Garvey quotes or voices someone else (opponents, critics, a senator), or argues against a view, never present that view as his.
5. Keep responses to 2-4 paragraphs. Ground every claim. Honor the archive.
7. Some excerpts carry a content warning in square brackets. If you quote or rely on such a passage, say the warning plainly in your answer, and never present the stereotype as true.
6. You are an AI model (not Garvey and not a human scholar). If asked, say so plainly. Never speak in Garvey's voice or in the first person as him.`

let corpusCache = null
async function loadCorpus(req) {
  if (corpusCache) return corpusCache
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const r = await fetch(`${proto}://${req.headers.host}/public/embeddings.json`)
  if (!r.ok) throw new Error('corpus ' + r.status)
  const data = await r.json()
  corpusCache = new Map(data.chunks.map((c) => [Number(c.chunk_index), c]))
  return corpusCache
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on the server' })
  }

  const { question, chunk_ids } = req.body || {}
  if (typeof question !== 'string' || !question.trim()) return res.status(400).json({ error: 'Missing question' })
  if (question.length > 600) return res.status(400).json({ error: 'Question too long' })
  if (!Array.isArray(chunk_ids) || chunk_ids.length === 0 || chunk_ids.length > 8) return res.status(400).json({ error: 'Bad chunk_ids' })

  let corpus
  try { corpus = await loadCorpus(req) } catch (e) { return res.status(500).json({ error: 'Could not load the archive' }) }
  const sources = chunk_ids.map((id) => corpus.get(Number(id))).filter(Boolean)
  if (!sources.length) return res.status(400).json({ error: 'Unknown passages' })
  const context = sources
    .map((s, i) => `[Source ${i + 1}: ${s.source_title}]${s.speaker_note ? ' (' + s.speaker_note + ')' : ''}${s.warning ? '\n[' + s.warning + ']' : ''}\n${s.content}`)
    .join('\n\n---\n\n')
  const prompt = `${SYSTEM_PROMPT}\n\n=== PROVIDED EXCERPTS ===\n${context}\n\n=== USER QUESTION ===\n${question.trim()}\n\n=== YOUR ANSWER (grounded in the excerpts above) ===`

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
  })

  let lastError = null

  for (const model of CHAT_MODELS) {
    try {
      const upstream = await fetch(`${chatUrl(model)}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (upstream.ok) {
        const data = await upstream.json()
        const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
        return res.status(200).json({ answer, model })
      }
      const errText = await upstream.text()
      lastError = { status: upstream.status, model, body: errText }
      // 429 rate-limited, 503 overloaded → fall through to next model
      if (upstream.status === 429 || upstream.status === 503) continue
      // Other errors — surface immediately
      return res.status(upstream.status).json({ error: errText, model })
    } catch (err) {
      lastError = { status: 0, model, body: err.message }
    }
  }

  return res.status(503).json({
    error: `All models rate-limited or failed. Last: ${lastError?.model} (${lastError?.status}). Wait ~60s and retry.`,
  })
}
