// File: lib/db/client.ts
import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

let client: NeonQueryFunction<false, false> | null = null

/** Resolved on first query, not at import. Importing this module must never
 *  require a database to exist — otherwise any unit test that transitively
 *  imports it fails on a fresh clone or in CI, even when it touches no I/O. */
function client_(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL
    if (!url) {
      throw new Error('DATABASE_URL is not set. Run: vercel env pull .env.development.local')
    }
    client = neon(url)
  }
  return client
}

export const sql: NeonQueryFunction<false, false> = new Proxy(
  (() => {}) as unknown as NeonQueryFunction<false, false>,
  {
    apply: (_t, _this, args) =>
      (client_() as unknown as (...a: unknown[]) => unknown)(...args),
    get: (_t, prop) => (client_() as unknown as Record<string | symbol, unknown>)[prop],
  },
)
