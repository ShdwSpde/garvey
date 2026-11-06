// Rules for the public passenger manifest (Harlem, On Foot). Pure functions: tested from projects/harlem-on-foot.
// Kept outside api/ so the legacy "api/*.js" build doesn't turn it into its own endpoint.

const BLOCK = ['fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fag', 'kike', 'spic', 'chink', 'whore', 'slut', 'dick', 'pussy', 'rape', 'nazi', 'hitler', 'kkk']
const NAME = /^[\p{L}][\p{L}'\- ]{0,19}$/u
const CODE = /^[A-HJKMNP-Z2-9]{6}$/

const titleCase = s => s.charAt(0).toLocaleUpperCase() + s.slice(1)

export function cleanEntry({ first, last, code, stamps }) {
  const f = String(first ?? '').trim().replace(/\s+/g, ' ')
  const l = String(last ?? '').trim()
  if (!NAME.test(f) || f.length > 20) return { ok: false, error: 'name' }
  if (BLOCK.some(w => f.toLowerCase().includes(w) || l.toLowerCase().includes(w))) return { ok: false, error: 'name' }
  if (!CODE.test(String(code ?? ''))) return { ok: false, error: 'code' }
  const initial = (l.match(/\p{L}/u) ?? [''])[0].toLocaleUpperCase()
  const n = Math.max(0, Math.min(10, Math.floor(Number(stamps) || 0)))
  return { ok: true, name: `${titleCase(f)}${initial ? ` ${initial}.` : ''}`, code: String(code), stamps: n }
}

// City from Vercel's edge location headers; nothing is asked of the visitor.
export function cityFrom(headers) {
  const h = k => { const v = headers[k]; return v ? decodeURIComponent(String(v)) : '' }
  const city = h('x-vercel-ip-city'), region = h('x-vercel-ip-country-region'), country = h('x-vercel-ip-country')
  if (!city) return 'Somewhere on the voyage'
  return country === 'US' && region ? `${city}, ${region}` : `${city}${country ? `, ${country}` : ''}`
}
