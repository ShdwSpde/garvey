export function cleanEntry(input: { first?: unknown; last?: unknown; code?: unknown; stamps?: unknown }):
  { ok: true; name: string; code: string; stamps: number } | { ok: false; error: string; name?: undefined; stamps?: undefined }
export function cityFrom(headers: Record<string, string | string[] | undefined>): string
