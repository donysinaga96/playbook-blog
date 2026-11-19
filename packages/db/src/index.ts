export { createDatabase, databaseUrlFromEnv } from './client'
export type { Database, DatabaseOptions } from './client'
export { relations } from './schema/relations'
export * from './schema/schema'

// Operator query diekspor ulang agar HANYA paket ini yang bergantung pada
// drizzle-orm. Paket lain (core) memakai operator dari sini; dengan begitu
// hanya ada satu salinan drizzle-orm di runtime.
export { and, asc, count, desc, eq, inArray, isNotNull, lte, or, sql } from 'drizzle-orm'
export type { SQL } from 'drizzle-orm'
export type { PgColumn } from 'drizzle-orm/pg-core'
