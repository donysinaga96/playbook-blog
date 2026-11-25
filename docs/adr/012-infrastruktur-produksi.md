# ADR-012: Infrastruktur produksi pertama: satu VPS, Docker Compose, Caddy, image dari CI, backup ke R2

Status: Diterima (25 Nov 2026)

## Konteks

M5 menargetkan satu site nyata live (Berita Konoha) dan restore backup yang
terbukti. Pemilik proyek belum punya VPS dan domain pada hari deploy, memilih
image yang dibangun CI (usulan M5-B), dan Cloudflare R2 sebagai tujuan backup
(usulan M5-C). Batasan dari kode yang sudah ada:

- Site dipilih dari header Host (ADR-001), jadi proxy wajib meneruskan Host asli
  dan setiap domain site butuh sertifikat TLS. Site dan domain baru dibuat
  lewat CLI (`site:create`, `site:domain`), bukan dengan mengubah konfigurasi.
- Admin multi-site punya host sendiri, `ADMIN_HOST` (ADR-009). Cek Origin dan
  cookie `Secure` memakai `X-Forwarded-Proto`; pembatas login memakai entri
  paling kanan `X-Forwarded-For` bila `TRUST_PROXY=true`.
- Pembatas login dan draf pratinjau tema disimpan di memori proses.
- Image hanya berisi `.output`, padahal migrate, `admin:create`, dan
  `site:create` membutuhkan source workspace.

## Keputusan

1. **Satu VPS, Docker Compose** (`deploy/compose.prod.yml`): `caddy`, `app`,
   `db` (PostgreSQL 18, tanpa port ke luar), dan `tools` (profil, sekali jalan).
   Spesifikasi awal 2 vCPU / 4 GB RAM / Ubuntu 24.04, lokasi Singapura.
2. **Satu replika aplikasi** (usulan M5-I) selama pembatas login dan draf
   pratinjau ada di memori. Penyimpanan bersama baru dibahas bila trafik
   menuntut lebih dari satu replika.
3. **Caddy dengan TLS on-demand** (usulan M5-A). Sebelum menerbitkan
   sertifikat, Caddy bertanya ke `GET /api/internal/tls-ask?domain=`; aplikasi
   menjawab 200 hanya untuk domain di `site_domains` (primary dan alias, site
   aktif) dan `ADMIN_HOST`. `/api/internal/*` diblokir di Caddy untuk request
   dari internet. Caddy meneruskan Host asli, mengisi `X-Forwarded-Proto` dan
   `X-Forwarded-For` (mengganti nilai dari klien karena `trusted_proxies` tidak
   diatur); aplikasi memakai `TRUST_PROXY=true` (usulan M5-H).
4. **Domain sementara sslip.io.** Sebelum domain asli aktif, site dan admin
   memakai `<nama>.<ip-dengan-tanda-hubung>.sslip.io`, yang diarahkan ke IP
   VPS oleh layanan DNS sslip.io, dengan sertifikat Let's Encrypt sungguhan.
   Domain asli ditambahkan dengan `site:domain --primary` tanpa deploy ulang.
5. **Image dari CI** (usulan M5-B). Dockerfile multi-stage menghasilkan
   `runtime` (`.output`, user non-root, healthcheck) dan `tools` (berbasis image
   `postgres:18.7` agar pg_dump sama versinya dengan server, ditambah Node dan
   source workspace). Job `image` di `main` membangun keduanya, mengujinya
   tanpa source repo (`deploy/ci-image-check.sh`), lalu push ke GitLab
   Container Registry dengan tag commit SHA.
6. **Deploy manual dari CI lewat SSH dengan forced command.** Key CI di VPS
   hanya bisa menjalankan `deploy-ssh` (`deploy <sha>`), yang login ke
   registry dengan token job (berlaku selama job), lalu `deploy.sh`: pull,
   salin compose/Caddyfile/skrip dari image versi itu, backup, migrate, start,
   cek health, kembali otomatis ke versi sebelumnya bila tidak sehat. Host key
   VPS disimpan di `deploy/known_hosts` (tidak percaya-saat-pertama di CI).
7. **Rahasia dibuat di VPS** oleh `deploy/bootstrap.sh` (`/srv/blog/.env`,
   mode 600): password database, `ADMIN_SESSION_SECRET`. Tidak pernah lewat
   chat, CI, atau Git. Kunci R2 diisi pemilik proyek langsung di VPS.
8. **Backup harian ke Cloudflare R2** (usulan M5-C): systemd timer 03:00 WIB
   menjalankan `tools backup` (dump + media + jumlah baris + checksum, retensi
   lokal 7 set), `rclone copy --immutable` ke bucket, objek lebih tua dari 30
   hari dihapus. Hasil terakhir ditulis ke `backups/offsite-status`. Setiap
   deploy juga membuat backup sebelum migrate.

## Alternatif yang ditolak

- **nginx/Traefik**: TLS per domain butuh konfigurasi atau label per domain;
  Caddy on-demand dengan endpoint ask membuat site baru cukup lewat CLI.
- **Build di VPS** (`git pull` + `docker build`): lebih sederhana, tetapi image
  produksi tidak pernah diuji CI dan VPS butuh RAM untuk build.
- **Kubernetes / beberapa replika**: berlebihan untuk satu site awal, dan
  bertentangan dengan state di memori (keputusan 2).
- **Menunggu domain asli**: menunda deploy berhari-hari (verifikasi registrar
  .id); sslip.io memberi URL HTTPS sungguhan hari ini.

## Konsekuensi

- Migration harus tetap kompatibel dengan versi aplikasi sebelumnya, karena
  rollback tidak membalik migration.
- User `deploy` ada di grup docker (setara root di VPS); karena itu key CI
  dibatasi forced command, dan login root hanya dengan key.
- Cache di Caddy belum dipasang; TTL 60 detik di header aplikasi siap untuk
  cache bersama nanti (usulan M5-D).
- Notifikasi galat, uptime check eksternal, dan uji kontrak proxy di CI masih
  task 5.5/5.2 lanjutan; kontrak proxy pertama kali diuji langsung di VPS.
- Penomoran: ADR untuk Menu Agent AI menjadi ADR-013.
