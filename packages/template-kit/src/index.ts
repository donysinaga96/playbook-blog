// Kontrak template (ADR-005). Paket ini tidak boleh bergantung pada core,
// db, atau driver database (dijaga eslint.config.js).
//
// `z` diekspor ulang supaya template menulis skema token/opsi tanpa
// dependency zod sendiri, dan memakai versi Zod yang sama dengan validasinya.
export { z } from 'zod'
export * from './manifest'
export { isPlainObject, mergeDeep } from './objects'
export * from './theme'
export * from './tokens'
export * from './view-models'
