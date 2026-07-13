import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { attachDatabasePool } from '@vercel/functions'
import * as schema from './schema'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
attachDatabasePool(pool)

export const pgDb = drizzle(pool, { schema })
