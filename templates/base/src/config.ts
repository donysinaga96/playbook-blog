// Skema token dan opsi template base. Template turunan mewarisinya, jadi
// semua komponen base boleh mengandalkan variabel CSS dan opsi di sini.
// `title` dan `description` (meta) menjadi label form pengaturan tema di
// admin, yang dibangkitkan dari skema ini (M4 4.4).
import { z } from '@framework/template-kit'

/** Font yang file-nya di-self-host (styles/fonts.css). Menambah font = tambah di sini dan di fonts.css. */
export const FONTS = ['Inter', 'Merriweather', 'Source Sans 3'] as const

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'warna hex 6 digit, mis. #0f62fe')

export const baseTokenSchema = z.object({
  color: z.object({
    /** Aksen: tautan, tombol, label kategori. */
    primary: hexColor.meta({ title: 'Warna aksen', description: 'Tautan, tombol, dan label kategori' }),
    /** Latar halaman. */
    surface: hexColor.meta({ title: 'Warna latar' }),
    /** Teks utama. Warna sekunder diturunkan dari text dan surface di CSS. */
    text: hexColor.meta({ title: 'Warna teks', description: 'Warna sekunder diturunkan dari teks dan latar' }),
  }).meta({ title: 'Warna' }),
  font: z.object({
    heading: z.enum(FONTS).meta({ title: 'Huruf judul' }),
    body: z.enum(FONTS).meta({ title: 'Huruf isi' }),
  }).meta({ title: 'Huruf' }),
  radius: z.object({
    card: z.enum(['0px', '2px', '4px', '8px', '16px']).meta({ title: 'Sudut kartu dan gambar' }),
  }).meta({ title: 'Sudut' }),
})

export const baseOptionsSchema = z.object({
  header: z.object({
    style: z.enum(['left', 'centered']).meta({ title: 'Posisi nama site', description: 'left = rata kiri, centered = di tengah' }),
    /** Tampilkan tanggal hari ini (zona waktu site) di header. */
    showDate: z.boolean().meta({ title: 'Tampilkan tanggal hari ini' }),
  }).meta({ title: 'Kepala halaman' }),
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
