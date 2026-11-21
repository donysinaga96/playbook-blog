import type { SectionView } from '@framework/template-kit'

/** Props teks section (sudah divalidasi skema di definitions.ts); null bila kosong. */
export function textProp(section: SectionView, key: string): string | null {
  const value = section.props[key]
  return typeof value === 'string' && value !== '' ? value : null
}
