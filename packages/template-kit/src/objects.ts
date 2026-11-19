/** Object biasa ({...}), bukan array, null, Date, atau instance kelas. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Gabung `override` di atas `base` per key, rekursif untuk object biasa.
 * Array dan nilai lain diganti utuh. Tidak mengubah argumen.
 */
export function mergeDeep(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    const current = out[key]
    out[key] = isPlainObject(current) && isPlainObject(value) ? mergeDeep(current, value) : value
  }
  return out
}
