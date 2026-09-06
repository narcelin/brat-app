#!/usr/bin/env node
// Applies one or more SQL files to the database at DATABASE_URL, statement by
// statement. Exists because @neondatabase/serverless's neon-http `sql.query`
// rejects multi-statement strings ("cannot insert multiple commands into a
// prepared statement"), so each file has to be split and executed one
// statement at a time.
//
// Usage: node --env-file=.env.development.local db/apply.mjs db/schema.sql db/seed.sql

import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

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

const sql = neon(process.env.DATABASE_URL)

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

for (const file of files) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (err) {
    fail(`could not read ${file}: ${err.message}`)
  }

  const statements = splitStatements(text, file)

  for (const statement of statements) {
    await sql.query(statement)
  }

  console.log(`applied ${file}: ${statements.length} statement(s)`)
}
