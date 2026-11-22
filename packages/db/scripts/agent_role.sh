#!/bin/sh
# agent_role.sh  -  Membuat/memperbarui role AI agent (lihat agent_role.sql).
# AGENT_DB_USER kosong = dilewati. AGENT_DB_PASSWORD kosong = role NOLOGIN
# (hak tetap dipasang; agent belum bisa login).
set -eu

DIR=$(cd "$(dirname "$0")" && pwd)
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

if [ -z "${AGENT_DB_USER:-}" ]; then
  echo "agent_role dilewati (AGENT_DB_USER kosong)"
  exit 0
fi

psql -X -q -v ON_ERROR_STOP=1 \
     -v agent_user="$AGENT_DB_USER" -v agent_password="${AGENT_DB_PASSWORD:-}" \
     -f "$DIR/agent_role.sql"
if [ -n "${AGENT_DB_PASSWORD:-}" ]; then
  echo "agent_role $AGENT_DB_USER siap"
else
  echo "agent_role $AGENT_DB_USER siap (NOLOGIN: AGENT_DB_PASSWORD kosong)"
fi
