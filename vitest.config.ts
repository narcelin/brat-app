import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // The integration suite writes to a real database and runs only through
    // vitest.integration.config.ts, which gates it behind a test-branch check.
    // Without this exclusion `npm test` would pick those files up and run them
    // ungated against whatever DATABASE_URL happened to be exported in the
    // shell — the exact accident the guard exists to prevent. They are skipped
    // today only because the unit suite normally has no env at all, which is a
    // coincidence, not a safeguard.
    exclude: ['node_modules/**', 'tests/integration/**'],
    environment: 'node',
    passWithNoTests: true,
  },
})
