# File contoh impor pendapatan

File fiktif untuk mencoba wizard **Impor file** di dashboard pendapatan
(`/admin/revenue/import`). Bukan format resmi platform mana pun; kolom
dipetakan di langkah 2 wizard.

| File | Untuk sumber | Isi |
|---|---|---|
| `whop-payments-contoh.csv` | Whop | Pembayaran Oktober 2026: `paid` (final), `refunded` (refund, nominal jadi negatif), `failed` (dilewati), kolom `Site` dipetakan ke situs |

Mengimpor file yang sama dua kali aman: baris dengan `Payment ID` yang sama
menjadi "sama (tidak berubah)", bukan duplikat.
