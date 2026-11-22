#!/bin/sh
# setup.sh  -  Entry point service db-migrate di docker-compose:
#   1. migration   2. role aplikasi   3. role AI agent   4. seed dev (bila SEED_DEV_DATA=true)
set -eu

DIR=$(cd "$(dirname "$0")" && pwd)

sh "$DIR/migrate.sh"
sh "$DIR/app_role.sh"
sh "$DIR/agent_role.sh"

if [ "${SEED_DEV_DATA:-false}" = "true" ]; then
  sh "$DIR/seed.sh"
else
  echo "seed dilewati (SEED_DEV_DATA bukan true)"
fi

echo "database $PGDATABASE siap"
