// POST /api/embed — Gemini embedding proxy.
// Body: { text: string }
// Returns: { embedding: number[768] }
// Keeps GEMINI_API_KEY on the server — never shipped to the client.

const GEMINI_EMBED_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on the server' })
  }

  const { text } = req.body || {}
  if (!text) return res.status(400).json({ error: 'Missing text' })

  try {
    const upstream = await fetch(`${GEMINI_EMBED_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text }] },
        outputDimensionality: 768,
      }),
    })
    if (!upstream.ok) {
      const errText = await upstream.text()
      return res.status(upstream.status).json({ error: errText })
    }
    const data = await upstream.json()
    return res.status(200).json({ embedding: data.embedding.values })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
