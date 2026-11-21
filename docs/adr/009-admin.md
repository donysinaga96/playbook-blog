# ADR-009: Admin: host, render, sesi, dan login

- Status: Diterima
- Tanggal: 2026-11-21

## Konteks

M4 menambah admin untuk satu pemilik proyek: login, CRUD konten, media, pengaturan tema. Yang
harus diputuskan sebelum kode:

- Di host mana admin dilayani. Middleware `site.ts` memetakan setiap Host ke site dan menjawab
  404 untuk host yang tidak dikenal, padahal mode multi butuh satu admin untuk semua site.
- Cara render. ADR-007 (render penuh di server) hanya mengatur halaman publik.
- Sesi, hash password, dan cara membuat admin pertama tanpa menyentuh database manual (gate M4).
- Pengamanan dasar, karena admin adalah permukaan tulis pertama dan di M5 terbuka ke internet.

## Keputusan

1. **Host.** Admin ada di `/admin` dengan API di `/api/admin/*`.
   - Mode `multi`: hanya di host `ADMIN_HOST` (dev: `admin.localhost`), mengelola semua site
     milik user. Path admin di domain site dijawab 404; path lain di `ADMIN_HOST` diarahkan ke
     `/admin`.
   - Mode `single`: di domain site itu sendiri, hanya untuk site `SITE_CODE`. Di domain alias,
     halaman `/admin` diarahkan (301) ke domain primary, tetapi API admin non-GET dijawab 404
     (301 mengubah POST menjadi GET).
   - Pemeriksaan path memakai pathname yang sudah di-decode, sama dengan yang dicocokkan router
     (`/api/%61dmin` = `/api/admin`), dan aturan host serta Origin diulang di handler.
   - Segmen `admin` dicadangkan (`RESERVED_SEGMENTS`): konten tidak boleh memakai path `/admin`.
   - `ADMIN_SESSION_SECRET` (minimal 32 karakter) wajib agar admin aktif. Tanpa itu, semua
     path admin dijawab 404 dan dicatat sekali saat start. Nilai yang salah (terlalu pendek,
     `ADMIN_HOST` tidak valid) membuat server gagal start.
2. **Render.** Admin adalah SPA (`routeRules: { '/admin/**': { ssr: false } }`). Admin tidak
   butuh SEO, sehingga masalah hidrasi tidak muncul dan ADR-007 tidak berubah. Aplikasi Nuxt
   mulai memakai `app/pages/`: halaman publik pindah ke route catch-all yang merender view
   model yang sama seperti sebelumnya.
3. **Sesi.** Cookie terenkripsi dari `useSession` (h3), nama `blog_admin`, berlaku 8 jam,
   `HttpOnly`, `SameSite=Lax`, `Secure` bila request HTTPS. Isinya hanya `userId`. User dimuat
   ulang dari database di setiap request admin, jadi user yang di-`DISABLED` langsung kehilangan
   akses. Tanpa tabel sesi.
4. **Password.** Argon2id lewat `@node-rs/argon2` (binary prebuilt, tanpa kompilasi native),
   parameter bawaan library: memori 19 MiB, 2 iterasi, paralelisme 1 (minimum OWASP). Password
   minimal 12 karakter, maksimal 256. Login gagal memberi pesan yang sama untuk email tidak ada,
   password salah, user `DISABLED`, dan user tanpa password; email yang tidak ada tetap
   menjalankan verifikasi terhadap hash palsu agar waktunya mirip.
5. **Hak akses.** Superadmin (`users.is_superadmin`) mengakses semua site `ACTIVE`; user lain
   hanya site di `site_members`. Mode `single` membatasi ke site `SITE_CODE`. Di M4 semua role
   anggota (`OWNER`, `EDITOR`, `AUTHOR`) boleh semua aksi admin; permission per aksi ada di
   backlog ("Banyak user + permission granular"). Site yang bukan milik user dijawab 404, bukan
   403, agar keberadaannya tidak terbaca.
6. **Admin pertama.** `pnpm admin:create --email <email> --name <nama> [--superadmin]
   [--site <kode>]...` (dijalankan lewat `tsx`). Password dibaca dari prompt tersembunyi, atau
   dari `ADMIN_PASSWORD` bila stdin bukan terminal (otomasi, CI); tidak pernah dari argumen
   (terlihat di riwayat shell dan daftar proses). Di terminal, `ADMIN_PASSWORD` diabaikan agar
   nilai di `.env` tidak diam-diam menjadi password user baru. User yang sudah ada hanya diubah password-nya dengan `--reset-password`.
7. **Pengamanan dasar.**
   - Rate limit login di memori proses: 5 percobaan gagal per IP + email dan 30 per IP dalam
     15 menit, lalu 429 dengan `Retry-After`. Percobaan dicatat sebelum verifikasi password,
     agar request paralel tidak lolos semua. IP diambil dari `X-Forwarded-For` hanya bila
     `TRUST_PROXY=true` (di belakang reverse proxy, M5); IP yang tidak diketahui hanya dibatasi
     per email. Cukup untuk satu proses (ADR-001); banyak proses butuh penyimpanan bersama
     (backlog bersama Redis).
   - Request non-GET ke `/api/admin/*` wajib membawa header `Origin` yang sama dengan origin
     request; selain itu 403. Bersama `SameSite=Lax`, ini menutup CSRF tanpa token.
   - Respons API admin `Cache-Control: no-store`.
   - `/security-review` setelah 4.0, 4.3 (upload), dan seluruh M4.

## Alternatif yang ditolak

- **Admin di setiap domain site** (mode multi). Cookie sesi terpisah per domain, jadi admin
  multi-site harus login berkali-kali, dan path admin terbuka di semua domain publik.
- **Aplikasi admin terpisah.** Menambah satu deploy di M5 dan menggandakan konfigurasi.
- **Admin SSR.** Tidak ada manfaat SEO, dan menambah risiko hidrasi serta state per request.
- **Tabel sesi di database.** Belum dibutuhkan untuk satu admin; cookie terenkripsi berumur
  pendek + user dimuat ulang setiap request sudah memberi pencabutan akses lewat status user.
- **`argon2` (node-gyp).** Butuh kompilasi native saat install; pnpm memblokir build script
  secara bawaan.

## Konsekuensi

- Env baru: `ADMIN_HOST` (mode multi), `ADMIN_SESSION_SECRET`, `ADMIN_PASSWORD` (opsional, CLI).
  CI dan produksi wajib mengisi secret.
- `tsx` jadi devDependency root untuk menjalankan CLI dari source TypeScript. Image produksi
  (M5) harus menyediakan cara menjalankan CLI yang sama.
- Rate limit dan sesi bergantung pada satu proses; dicatat untuk M5 bila jumlah proses bertambah.
- Logout menghapus cookie di browser, tetapi cookie yang sudah tersalin (mis. dicuri) tetap
  berlaku sampai kedaluwarsa (paling lama 8 jam), karena server tidak menyimpan sesi.
  Hal yang sama berlaku untuk `--reset-password`: sesi lama tetap berlaku. Pencabutan yang
  tersedia: ubah status user menjadi `DISABLED`, atau ganti `ADMIN_SESSION_SECRET` (semua
  sesi berakhir); reset password karena bocor harus disertai salah satunya. Pencabutan per sesi butuh penyimpanan sesi
  di server; diputuskan ulang bila admin lebih dari satu orang.
