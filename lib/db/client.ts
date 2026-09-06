import { neon } from '@neondatabase/serverless'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Run: vercel env pull .env.development.local')
}

export const sql = neon(process.env.DATABASE_URL)
