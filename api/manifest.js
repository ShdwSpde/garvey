// GET  /api/manifest → { ready: true, count, recent: [{ no, name, from, stamps, date }] }, or { ready: false } before the database exists
// POST /api/manifest  { first, last, code, stamps } → { no }
// The public passenger manifest for Harlem, On Foot. Opt-in only: first name + last initial,
// city from Vercel's location headers. Hide a row from the Neon console:
//   UPDATE voyage_manifest SET hidden = true WHERE id = <no>;
import { cleanEntry, cityFrom } from '../lib/manifest-rules.js'

let ready = null
async function db() {
  const url = process.env.DATABASE_URL
  if (!url) return null
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(url)
  ready ??= sql`CREATE TABLE IF NOT EXISTS voyage_manifest (
    id serial PRIMARY KEY, name text NOT NULL, place text NOT NULL, stamps int NOT NULL DEFAULT 0,
    code text UNIQUE NOT NULL, hidden boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now())`
  await ready
  return sql
}

export default async function handler(req, res) {
  let sql
  // Not ready answers 200 so visitors' consoles stay clean; the page simply hides the manifest.
  try { sql = await db() } catch { return res.status(200).json({ ready: false }) }
  if (!sql) return res.status(200).json({ ready: false })

  if (req.method === 'GET') {
    const [{ count }] = await sql`SELECT count(*)::int AS count FROM voyage_manifest`
    const recent = await sql`SELECT id AS no, name, place AS "from", stamps, to_char(created_at, 'YYYY-MM-DD') AS date
      FROM voyage_manifest WHERE hidden = false ORDER BY id DESC LIMIT 12`
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120')
    return res.status(200).json({ ready: true, count, recent })
  }
  if (req.method === 'POST') {
    const e = cleanEntry(req.body || {})
    if (!e.ok) return res.status(400).json({ error: e.error })
    const rows = await sql`INSERT INTO voyage_manifest (name, place, stamps, code) VALUES (${e.name}, ${cityFrom(req.headers)}, ${e.stamps}, ${e.code})
      ON CONFLICT (code) DO UPDATE SET stamps = GREATEST(voyage_manifest.stamps, EXCLUDED.stamps) RETURNING id`
    return res.status(200).json({ no: rows[0].id })
  }
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
}
