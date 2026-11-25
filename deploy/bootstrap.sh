#!/usr/bin/env bash
# =====================================================================
# bootstrap.sh  -  Menyiapkan VPS Ubuntu 24.04 baru, SEKALI, sebagai root
# (ADR-012). Aman diulang: langkah yang sudah selesai dilewati, .env yang
# sudah ada tidak ditimpa.
#
#   scp -r deploy root@<ip>:/root/blog-deploy
#   ssh root@<ip> bash /root/blog-deploy/bootstrap.sh \
#       --registry registry.gitlab.com/<grup>/<proyek> \
#       --ci-key /root/blog-deploy/ci-deploy.pub
#
# Hasil:
#   - SSH hanya dengan key (root: key saja), firewall 22/80/443, update
#     keamanan otomatis, swap 2 GB, rotasi log Docker
#   - Docker + compose plugin, rclone
#   - user `deploy` (grup docker); key CI hanya bisa menjalankan deploy-ssh
#   - /srv/blog: .env (password acak dibuat DI SINI, tidak lewat chat/Git),
#     compose.yml, Caddyfile, bin/, media/, backups/
#   - timer backup harian 03:00 WIB ke R2 (aktif setelah kunci R2 diisi)
# =====================================================================
set -euo pipefail

registry=""
ci_key=""
while [ $# -gt 0 ]; do
  case "$1" in
    --registry) registry=$2; shift 2 ;;
    --ci-key) ci_key=$2; shift 2 ;;
    *) echo "argumen tidak dikenal: $1" >&2; exit 1 ;;
  esac
done
[ -n "$registry" ] && [ -f "$ci_key" ] || { echo "pemakaian: bootstrap.sh --registry <image-registry> --ci-key <file .pub>" >&2; exit 1; }
[ "$(id -u)" = 0 ] || { echo "jalankan sebagai root" >&2; exit 1; }
SRC=$(cd "$(dirname "$0")" && pwd)
ROOT=/srv/blog
export DEBIAN_FRONTEND=noninteractive

step() { printf '\n== %s\n' "$*"; }

step "1. Paket dasar, Docker, rclone"
apt-get update -qq
apt-get install -y -qq ca-certificates curl ufw unattended-upgrades rclone docker.io docker-compose-v2 > /dev/null
systemctl enable --now docker > /dev/null

step "2. Update keamanan otomatis"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

step "3. SSH hanya dengan key"
cat > /etc/ssh/sshd_config.d/10-blog.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
sshd -t
systemctl reload ssh

step "4. Firewall: 22, 80, 443"
ufw allow OpenSSH > /dev/null
ufw allow 80/tcp > /dev/null
ufw allow 443/tcp > /dev/null
ufw allow 443/udp > /dev/null
ufw --force enable > /dev/null
ufw status | sed -n '1,12p'

step "5. Swap 2 GB dan rotasi log Docker"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile > /dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
if [ ! -f /etc/docker/daemon.json ]; then
  echo '{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }' > /etc/docker/daemon.json
  systemctl restart docker
fi

step "6. User deploy (key CI hanya untuk deploy-ssh)"
id deploy > /dev/null 2>&1 || useradd -m -s /bin/bash deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
printf 'command="%s/bin/deploy-ssh",restrict %s\n' "$ROOT" "$(cat "$ci_key")" > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

step "7. /srv/blog"
install -d -m 750 -o deploy -g deploy "$ROOT" "$ROOT/bin"
# uid 1000 = user node di container app dan user container tools.
install -d -m 750 -o 1000 -g 1000 "$ROOT/media" "$ROOT/backups"
install -m 0644 -o deploy -g deploy "$SRC/compose.prod.yml" "$ROOT/compose.yml"
install -m 0644 -o deploy -g deploy "$SRC/Caddyfile" "$ROOT/Caddyfile"
install -m 0755 -o deploy -g deploy "$SRC/deploy.sh" "$ROOT/bin/deploy"
install -m 0755 -o deploy -g deploy "$SRC/deploy-ssh.sh" "$ROOT/bin/deploy-ssh"
install -m 0755 -o deploy -g deploy "$SRC/bin-tools.sh" "$ROOT/bin/tools"
install -m 0755 -o deploy -g deploy "$SRC/backup-offsite.sh" "$ROOT/bin/backup-offsite"

if [ ! -f "$ROOT/.env" ]; then
  ip=$(curl -fsS4 https://api.ipify.org || hostname -I | awk '{print $1}')
  dashed=${ip//./-}
  cat > "$ROOT/.env" <<EOF
# Dibuat bootstrap.sh $(date -u +%Y-%m-%d). Rahasia: jangan disalin ke chat atau Git.
REGISTRY_IMAGE=$registry
DB_NAME=blog
POSTGRES_USER=blog
POSTGRES_PASSWORD=$(openssl rand -hex 24)
APP_DB_USER=blog_app
APP_DB_PASSWORD=$(openssl rand -hex 24)
AGENT_DB_USER=blog_agent
# Kosong = role agent NOLOGIN (isi bila agent produksi mulai menulis).
AGENT_DB_PASSWORD=
# Host admin (ADR-009). Sementara di sslip.io sampai domain asli aktif.
ADMIN_HOST=admin.$dashed.sslip.io
ADMIN_SESSION_SECRET=$(openssl rand -hex 48)
PUBLIC_CACHE_TTL=60
BACKUP_KEEP=7
# Cloudflare R2 (backup harian). Diisi pemilik proyek.
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ENDPOINT=
R2_BUCKET=beritakonoha-backup
R2_KEEP_DAYS=30
EOF
  echo ".env dibuat (domain sementara: *.$dashed.sslip.io)"
else
  echo ".env sudah ada: tidak diubah"
fi
chown deploy:deploy "$ROOT/.env"
chmod 600 "$ROOT/.env"

step "8. Timer backup harian 03:00 WIB (20:00 UTC)"
cat > /etc/systemd/system/blog-backup.service <<EOF
[Unit]
Description=Backup database + media blog ke Cloudflare R2
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=$ROOT/bin/backup-offsite
EOF
cat > /etc/systemd/system/blog-backup.timer <<'EOF'
[Unit]
Description=Backup harian blog (03:00 WIB)

[Timer]
OnCalendar=*-*-* 20:00:00 UTC
Persistent=true
RandomizedDelaySec=10m

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now blog-backup.timer > /dev/null

step "Selesai"
echo "Berikutnya: isi R2_* di $ROOT/.env, lalu jalankan job deploy di GitLab."
echo "Host key server ini (untuk deploy/known_hosts di repo):"
for f in /etc/ssh/ssh_host_ed25519_key.pub; do
  printf '%s %s\n' "$(curl -fsS4 https://api.ipify.org || hostname -I | awk '{print $1}')" "$(cut -d' ' -f1,2 "$f")"
done
