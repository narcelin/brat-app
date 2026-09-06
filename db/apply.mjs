#!/usr/bin/env node
// Applies one or more SQL files to the database at DATABASE_URL, statement by
// statement, with each FILE wrapped in its own transaction (BEGIN ... COMMIT,
// or ROLLBACK on the first failing statement). This uses the websocket-based
// `Client` export from @neondatabase/serverless rather than its neon-http
// `sql.query` helper: the HTTP client makes a separate implicit transaction
// per call, so it cannot express a multi-statement transaction across
// several `sql.query()` calls. `Client` holds a real session, so BEGIN/
// COMMIT/ROLLBACK span every statement in the file as intended.
//
// Usage: node --env-file=.env.development.local db/apply.mjs db/schema.sql db/seed.sql

import { readFileSync } from 'node:fs'
import { Client } from '@neondatabase/serverless'

function fail(message) {
  console.error(`db/apply.mjs: ${message}`)
  process.exit(1)
}

const files = process.argv.slice(2)
if (files.length === 0) {
  fail('no SQL file paths given. Usage: node db/apply.mjs <file.sql> [more.sql ...]')
}

if (!process.env.DATABASE_URL) {
  fail('DATABASE_URL is not set. Run: vercel env pull .env.development.local')
}

// Splitting on ";\n" is fragile: it would mis-split a semicolon that appears
// inside a string literal, or inside a DO $$ ... $$ block that itself
// contains semicolons. The current schema/seed files contain neither, but to
// avoid silently corrupting a future file that does, refuse to run on any
// input containing a dollar-quoted block rather than guess how to split it.
function splitStatements(text, file) {
  if (text.includes('$$')) {
    fail(
      `${file} contains "$$" (a dollar-quoted block, e.g. DO $$ ... $$). ` +
        'This script splits statements on ";\\n" and cannot safely split ' +
        'dollar-quoted blocks without risking corruption. Extend ' +
        'splitStatements() to handle dollar-quoting before applying this file.'
    )
  }

  return text
    .split(';\n')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
}

const client = new Client(process.env.DATABASE_URL)
await client.connect()

let failureMessage = null

try {
  for (const file of files) {
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch (err) {
      failureMessage = `could not read ${file}: ${err.message}`
      break
    }

    const statements = splitStatements(text, file)

    await client.query('BEGIN')

    let appliedCount = 0
    try {
      for (const statement of statements) {
        await client.query(statement)
        appliedCount += 1
      }
    } catch (err) {
      // Statement text is never printed - it may contain data (e.g. seed
      // rows) - only the file and the 1-based index of the statement that
      // failed within it.
      try {
        await client.query('ROLLBACK')
      } catch {
        // The connection may already be unusable after the original
        // error; the ROLLBACK is best-effort and its failure doesn't
        // change the outcome below.
      }
      failureMessage =
        `${file}: statement ${appliedCount + 1} of ${statements.length} failed, ` +
        `rolled back the whole file. Error: ${err.message}`
      break
    }

    await client.query('COMMIT')
    console.log(`applied ${file}: ${statements.length} statement(s)`)
  }
} finally {
  await client.end()
}

if (failureMessage) {
  fail(failureMessage)
}
