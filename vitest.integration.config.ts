import { defineConfig } from 'vitest/config'

/** Separate from vitest.config.ts because the integration suite has a
 *  precondition the unit suite must never inherit: it writes to a real
 *  database, so it runs only against a branch marked disposable. The unit
 *  suite must keep passing with no env file at all. */
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['tests/integration/guard.ts'],
    // These suites share tables. Running files in parallel lets one suite's
    // teardown delete rows another is still asserting on.
    fileParallelism: false,
  },
})
