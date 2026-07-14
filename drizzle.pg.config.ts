import type { Config } from 'drizzle-kit'

export default {
  schema: './db/pg/schema.ts',
  out: './db/pg/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config
