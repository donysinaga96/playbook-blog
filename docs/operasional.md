# Runbook operasional produksi

Keputusan di balik susunan ini: [ADR-012](adr/012-infrastruktur-produksi.md).
Semua perintah dijalankan di VPS sebagai root (`ssh root@<ip>`), kecuali
disebut lain. Folder kerja: `/srv/blog`.

| Berkas di VPS | Isi |
| --- | --- |
| `/srv/blog/.env` | Rahasia + setelan (mode 600). Dibuat `bootstrap.sh`; jangan disalin ke chat atau Git |
| `/srv/blog/app.env` | Opsional: kredensial sumber pendapatan (`REVENUE_*`), dibaca app dan tools |
| `/srv/blog/compose.yml`, `Caddyfile`, `bin/` | Diperbarui otomatis setiap deploy dari image versi itu |
| `/srv/blog/current-tag`, `previous-tag` | Versi (commit SHA) terpasang dan sebelumnya |
| `/srv/blog/media/` | File media (upload admin) |
| `/srv/blog/backups/` | Backup lokal (7 set terakhir) + `offsite-status` |

## Deploy

1. Push ke `main`. Pipeline menjalankan `check`, `build`, `db`, lalu `image`
   (build + uji image + push ke registry).
2. Di GitLab, buka pipeline commit itu, klik ▶ pada job `deploy`.
3. Job login ke VPS sebagai `deploy` (key yang hanya bisa menjalankan
   deploy), lalu `bin/deploy <sha>`: pull, backup, migrate, start, cek health.
   Bila versi baru tidak sehat, versi sebelumnya otomatis dijalankan lagi dan
   job gagal.

Cek: `/srv/blog/bin/deploy status`, log aplikasi `cd /srv/blog && docker compose logs --tail 100 app`.

## Rollback

```sh
/srv/blog/bin/deploy rollback
```

Kembali ke versi di `previous-tag`. Migration tidak dibalik, jadi migration
harus kompatibel dengan versi sebelumnya (tambah, jangan hapus, dalam satu rilis).
Bila schema benar-benar harus kembali: restore backup sebelum migrate (dibuat
otomatis setiap deploy) mengikuti bagian Restore.

## Perintah tools

```sh
/srv/blog/bin/tools help
/srv/blog/bin/tools admin:create --email <email> --name "<nama>" --superadmin
/srv/blog/bin/tools admin:create --email <email> --reset-password
/srv/blog/bin/tools site:create --code <kode> --name "<nama>" --template news --domain <domain>
/srv/blog/bin/tools site:domain --site <kode>                       # daftar domain
/srv/blog/bin/tools site:domain --site <kode> --add <domain> --primary
/srv/blog/bin/tools size                                            # ukuran database
/srv/blog/bin/tools psql                                            # konsol (hati-hati)
```

## Domain baru untuk site

1. DNS: record A domain (dan `www`) ke IP VPS. Bila memakai Cloudflare, proxy
   **mati** (awan abu-abu) agar Caddy bisa menerbitkan sertifikat.
2. `bin/tools site:domain --site <kode> --add <domain> --primary`, lalu
   `--add www.<domain>` sebagai alias. Domain lama tetap alias dan diarahkan 301.
3. Buka `https://<domain>`: permintaan pertama memicu penerbitan sertifikat
   (beberapa detik).

Host admin pindah ke domain asli: ubah `ADMIN_HOST` di `.env`, lalu
`cd /srv/blog && APP_TAG=$(cat current-tag) docker compose up -d app`. Sesi
admin yang sedang login ikut berakhir.

## Backup

- Otomatis 03:00 WIB (`systemctl list-timers blog-backup.timer`), ke
  `/srv/blog/backups` lalu Cloudflare R2. Hasil terakhir:
  `cat /srv/blog/backups/offsite-status`.
- Manual: `/srv/blog/bin/backup-offsite` (atau lokal saja: `bin/tools backup`).
- Log: `journalctl -u blog-backup.service -n 50`.

## Restore

Restore selalu ke database BARU; database yang sedang dipakai tidak pernah ditimpa.

```sh
cd /srv/blog
# 1. Bila set hanya ada di R2, salin dulu (lihat backup-offsite.sh untuk env rclone):
#    rclone copy r2:<bucket>/backups/<set>.* backups/
# 2. Pulihkan + periksa (checksum, jumlah baris per tabel, file media):
bin/tools restore <set> blog_restore_YYYYMMDD
# 3. Pakai database itu: ubah DB_NAME di .env, lalu
APP_TAG=$(cat current-tag) docker compose up -d app
```

Media hasil restore ada di dalam container tools dan ikut terbuang; untuk
memulihkan media juga: `docker compose run --rm -e MEDIA_RESTORE=/media tools restore ...`
dengan folder `media/` dikosongkan dulu (pindahkan isinya, jangan dihapus
sebelum restore terbukti).

## Rotasi secret

- `ADMIN_SESSION_SECRET`: ganti nilai di `.env` (`openssl rand -hex 48`), lalu
  `docker compose up -d app`. Semua admin harus login ulang.
- Password database `blog_app`: ganti `APP_DB_PASSWORD` di `.env`, jalankan
  `bin/tools migrate` (memasang ulang password role), lalu `docker compose up -d app`.
- Key CI deploy: buat key baru, ganti baris di `/home/deploy/.ssh/authorized_keys`
  (pertahankan awalan `command=...,restrict`) dan variabel `DEPLOY_SSH_KEY` di GitLab.
- Kunci R2: buat token baru di Cloudflare, ganti `R2_*` di `.env`, hapus token lama.

## Bila ada masalah

| Gejala | Periksa |
| --- | --- |
| Situs tidak bisa dibuka | `bin/deploy status`; `docker compose logs --tail 100 app caddy` |
| Sertifikat tidak terbit | Domain sudah ada di `site:domain`? DNS sudah ke IP VPS dan proxy Cloudflare mati? `docker compose logs caddy` |
| Semua POST admin 403 | Request tidak lewat Caddy (X-Forwarded-Proto hilang) atau `ADMIN_HOST` tidak sama dengan host yang dibuka |
| Login admin terkunci untuk semua orang | `TRUST_PROXY` harus `true` di compose (sudah bawaan) |
| Disk penuh | `df -h`; `docker system df`; backup lokal dibatasi `BACKUP_KEEP` |
