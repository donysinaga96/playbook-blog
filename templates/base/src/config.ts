// Skema token dan opsi template base. Template turunan mewarisinya, jadi
// semua komponen base boleh mengandalkan variabel CSS dan opsi di sini.
import { z } from '@framework/template-kit'

/** Font yang file-nya di-self-host (styles/fonts.css). Menambah font = tambah di sini dan di fonts.css. */
export const FONTS = ['Inter', 'Merriweather', 'Source Sans 3'] as const

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'warna hex 6 digit, mis. #0f62fe')

export const baseTokenSchema = z.object({
  color: z.object({
    /** Aksen: tautan, tombol, label kategori. */
    primary: hexColor,
    /** Latar halaman. */
    surface: hexColor,
    /** Teks utama. Warna sekunder diturunkan dari text dan surface di CSS. */
    text: hexColor,
  }),
  font: z.object({
    heading: z.enum(FONTS),
    body: z.enum(FONTS),
  }),
  radius: z.object({
    card: z.enum(['0px', '2px', '4px', '8px', '16px']),
  }),
})

export const baseOptionsSchema = z.object({
  header: z.object({
    style: z.enum(['left', 'centered']),
    /** Tampilkan tanggal hari ini (zona waktu site) di header. */
    showDate: z.boolean(),
  }),
})

export type BaseTokens = z.output<typeof baseTokenSchema>
export type BaseOptions = z.output<typeof baseOptionsSchema>

export const baseTokenDefaults: BaseTokens = {
  color: { primary: '#1f4b99', surface: '#ffffff', text: '#1a1a1a' },
  font: { heading: 'Source Sans 3', body: 'Source Sans 3' },
  radius: { card: '4px' },
}

export const baseOptionDefaults: BaseOptions = {
  header: { style: 'left', showDate: false },
}
