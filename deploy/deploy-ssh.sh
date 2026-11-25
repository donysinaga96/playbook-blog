#!/usr/bin/env bash
# =====================================================================
# deploy-ssh.sh  -  Forced command untuk key SSH job CI `deploy`
# (authorized_keys user deploy: command="/srv/blog/bin/deploy-ssh",restrict).
# Key CI hanya bisa melakukan ini, bukan membuka shell.
#
#   SSH_ORIGINAL_COMMAND = "deploy <commit-sha>"
#   stdin                = baris 1: user registry, baris 2: token job CI
#
# Token job hanya berlaku selama job berjalan dan langsung di-logout lagi.
# =====================================================================
set -euo pipefail

read -r -a args <<< "${SSH_ORIGINAL_COMMAND:-}"
if [ "${#args[@]}" -ne 2 ] || [ "${args[0]}" != deploy ] || ! [[ "${args[1]}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ditolak: hanya 'deploy <commit-sha>'" >&2
  exit 1
fi

registry_image=$(sed -n 's/^REGISTRY_IMAGE=//p' /srv/blog/.env)
registry=${registry_image%%/*}
IFS= read -r user
IFS= read -r token
printf '%s' "$token" | docker login "$registry" -u "$user" --password-stdin > /dev/null
trap 'docker logout "$registry" > /dev/null 2>&1 || true' EXIT

/srv/blog/bin/deploy "${args[1]}"
