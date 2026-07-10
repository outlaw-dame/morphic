import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { readFileSync } from 'node:fs'
import postgres from 'postgres'

import * as relations from './relations'
import * as repairStateSchema from './repair-state-schema'
import * as schema from './schema'

// For server-side usage only
// Use restricted user for application if available, otherwise fall back to regular user
const isDevelopment = process.env.NODE_ENV === 'development'
const isTest = process.env.NODE_ENV === 'test'
type AppDb = ReturnType<
  typeof drizzle<typeof schema & typeof repairStateSchema & typeof relations>
>

const globalForDb = globalThis as typeof globalThis & {
  __gistDb?: AppDb
}

/**
 * Resolve database connection string.
 * Returns undefined if no connection is available (e.g., during static build phases).
 */
function getConnectionString(): string | undefined {
  if (process.env.DATABASE_RESTRICTED_URL) {
    return process.env.DATABASE_RESTRICTED_URL
  }
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL
  }
  if (isTest) {
    return 'postgres://user:pass@localhost:5432/testdb'
  }
  return undefined
}

// SSL configuration: Use environment variables to control SSL.
// DATABASE_SSL_DISABLED=true disables SSL completely for local/Docker PostgreSQL.
// DATABASE_SSL_CA_PATH points to a CA bundle for cloud databases with custom CAs.
function getSslConfig() {
  if (process.env.DATABASE_SSL_DISABLED === 'true') {
    return false
  }

  const caPath = process.env.DATABASE_SSL_CA_PATH
  if (caPath) {
    return {
      rejectUnauthorized: true,
      ca: readFileSync(caPath, 'utf8')
    }
  }

  return { rejectUnauthorized: true }
}

/**
 * Lazy-initialized database client.
 *
 * During `next build`, API route modules are evaluated for static analysis.
 * If DATABASE_URL is not set, we defer the error until the database is actually
 * used at runtime — this allows the build to succeed without a live database.
 */
let _db: AppDb | null = isDevelopment ? (globalForDb.__gistDb ?? null) : null

function createDb() {
  const connectionString = getConnectionString()

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL or DATABASE_RESTRICTED_URL environment variable is not set. ' +
        'This is required at runtime but not during build.'
    )
  }

  // Log which connection is being used (for debugging)
  if (isDevelopment) {
    console.log(
      '[DB] Using connection:',
      process.env.DATABASE_RESTRICTED_URL
        ? 'Restricted User (RLS Active)'
        : 'Owner User (RLS Bypassed)'
    )
  }

  const maxConnections = Number.parseInt(
    process.env.DATABASE_POOL_MAX ?? (isDevelopment || isTest ? '3' : '10'),
    10
  )

  const client = postgres(connectionString, {
    ssl: getSslConfig(),
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    max:
      Number.isFinite(maxConnections) && maxConnections > 0 ? maxConnections : 3
  })

  const instance = drizzle(client, {
    schema: { ...schema, ...repairStateSchema, ...relations }
  })

  if (isDevelopment) {
    globalForDb.__gistDb = instance
  }

  return instance
}

export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop) {
    if (!_db) {
      _db = createDb()
    }
    const value = (_db as any)[prop]
    // Bind functions to the actual db instance to avoid `this` context issues
    if (typeof value === 'function') {
      return value.bind(_db)
    }
    return value
  }
})

// Helper type for all tables
export type Schema = typeof schema & typeof repairStateSchema

// Verify restricted user permissions on startup (only at runtime, not during build)
if (
  process.env.DATABASE_RESTRICTED_URL &&
  !isTest &&
  getConnectionString() !== undefined
) {
  // Only run verification in server environments, not during build
  if (typeof window === 'undefined' && process.env.NODE_ENV !== 'production') {
    ;(async () => {
      try {
        const result = await db.execute<{ current_user: string }>(
          sql`SELECT current_user`
        )
        const currentUser = result[0]?.current_user

        if (isDevelopment) {
          console.log('[DB] ✓ Connection verified as user:', currentUser)
        }

        // Verify it's the restricted user (app_user)
        if (
          currentUser &&
          !currentUser.includes('app_user') &&
          !currentUser.includes('neondb_owner')
        ) {
          console.warn(
            '[DB] ⚠️ Warning: Expected app_user but connected as:',
            currentUser
          )
        }
      } catch (error) {
        console.error('[DB] ✗ Failed to verify database connection:', error)
        // Log the error but don't terminate the application
        // This allows development to continue even with connection issues
      }
    })()
  }
}
