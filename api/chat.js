// POST /api/chat — Gemini chat proxy with model fallback chain.
// Body: { prompt: string }
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on the server' })
  }

  const { prompt } = req.body || {}
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' })

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
