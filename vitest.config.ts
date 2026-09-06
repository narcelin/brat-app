import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
    // Load the same .env.development.local that `next dev` and `db:apply`
    // use, so modules that read process.env at import time (e.g. lib/db/client.ts)
    // work under `vitest run` too.
    env: loadEnv('development', process.cwd(), ''),
  },
})
