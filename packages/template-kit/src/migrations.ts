// migrateConfig (ADR-005, ADR-008): mengubah config theme yang disimpan untuk
// versi template lama menjadi bentuk versi terpasang, sebelum divalidasi.
//
//   migrateConfig: {
//     '1.1.0': (cfg) => ({ ...cfg, options: withoutKey(cfg.options, 'adSlots') }),
//   }
//
// Kunci = versi TUJUAN migrasi. Config tersimpan untuk versi S dengan
// template terpasang versi T menjalankan semua migrasi dengan kunci K,
// S < K <= T, urut naik. Jadi versi tersimpan yang tidak punya kunci
// sendiri (mis. 1.0.3) tetap tertangani.
//
// Aturan:
//  - Versi mayor wajib punya migrasi ke X.0.0 (dicek defineManifest).
//  - Migrasi menerima salinan config, jadi boleh mengubah argumennya.
//  - Versi tersimpan lebih baru dari terpasang, versi tersimpan bukan
//    semver, atau migrasi yang melempar error -> config diabaikan (default),
//    dicatat sebagai issue. Theme tetap tampil.
//  - Migrasi milik template itu sendiri, tidak diwariskan ke turunan.
//  - Baris database tidak ditulis ulang di sini; config ditulis dalam versi
//    terpasang saat disimpan dari admin (M4).

/** Config theme seperti disimpan di site_themes (JSON mentah). */
export interface StoredConfig {
  tokens: unknown
  options: unknown
  layouts: unknown
}

export type ConfigMigration = (config: StoredConfig) => StoredConfig

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

type Version = [number, number, number]

export function parseVersion(version: string): Version | null {
  const m = SEMVER.exec(version)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** <0 bila a < b, 0 bila sama, >0 bila a > b. Keduanya harus semver valid. */
export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  if (!va || !vb) throw new Error(`bukan semver: ${va ? b : a}`)
  for (let i = 0; i < 3; i++) {
    const diff = (va[i] as number) - (vb[i] as number)
    if (diff !== 0) return diff
  }
  return 0
}

/** Masalah pada migrateConfig sebuah manifest; kosong bila benar. */
export function migrationProblems(version: string, migrations: Readonly<Record<string, ConfigMigration>>): string[] {
  const problems: string[] = []
  for (const [key, fn] of Object.entries(migrations)) {
    if (!parseVersion(key)) problems.push(`migrateConfig "${key}" bukan semver`)
    else if (compareVersions(key, version) > 0) problems.push(`migrateConfig "${key}" lebih baru dari versi template ${version}`)
    if (typeof fn !== 'function') problems.push(`migrateConfig "${key}" bukan fungsi`)
  }
  const current = parseVersion(version)
  if (current) {
    for (let major = 2; major <= current[0]; major++) {
      if (!Object.hasOwn(migrations, `${major}.0.0`)) problems.push(`versi mayor ${major} wajib punya migrateConfig "${major}.0.0"`)
    }
  }
  return problems
}

export type MigrationResult =
  | { ok: true; config: StoredConfig; applied: string[] }
  | { ok: false; reason: string }

/** Jalankan rantai migrasi dari versi tersimpan ke versi terpasang. */
export function migrateConfig(
  stored: StoredConfig & { version: string },
  installed: string,
  migrations: Readonly<Record<string, ConfigMigration>>,
): MigrationResult {
  if (!parseVersion(stored.version)) return { ok: false, reason: `versi tersimpan "${stored.version}" bukan semver` }
  const order = compareVersions(stored.version, installed)
  if (order > 0) return { ok: false, reason: `config disimpan untuk versi ${stored.version}, lebih baru dari versi terpasang ${installed}` }

  const steps = Object.keys(migrations)
    .filter((key) => compareVersions(key, stored.version) > 0 && compareVersions(key, installed) <= 0)
    .sort(compareVersions)

  let config: StoredConfig = structuredClone({ tokens: stored.tokens, options: stored.options, layouts: stored.layouts })
  for (const step of steps) {
    try {
      const next = (migrations[step] as ConfigMigration)(config)
      if (typeof next !== 'object' || next === null) throw new Error('hasil bukan object { tokens, options, layouts }')
      config = next
    } catch (error) {
      return { ok: false, reason: `migrateConfig ${step} gagal: ${error instanceof Error ? error.message : String(error)}` }
    }
  }
  return { ok: true, config, applied: steps }
}
