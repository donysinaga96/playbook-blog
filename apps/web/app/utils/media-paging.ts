// "Muat lagi" di galeri media. Daftar di layar ikut berubah saat unggah
// (item baru di depan) dan hapus, sehingga nomor halaman terakhir tidak lagi
// cocok dengan offset server. Halaman berikutnya dihitung dari jumlah item
// yang tampil (offset <= jumlah itu, jadi tidak ada yang terlewat), dan item
// yang sudah tampil dibuang dari hasilnya (tidak ada yang dobel).
export const MEDIA_PAGE_SIZE = 30

export function nextMediaPage(shown: number, pageSize = MEDIA_PAGE_SIZE): number {
  return Math.floor(shown / pageSize) + 1
}

export function appendUnique<T extends { id: string }>(list: T[], more: T[]): T[] {
  const seen = new Set(list.map((x) => x.id))
  return [...list, ...more.filter((x) => !seen.has(x.id))]
}
