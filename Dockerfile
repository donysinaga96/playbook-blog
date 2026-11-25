# syntax=docker/dockerfile:1.7
# =====================================================================
# Image produksi (ADR-012, M5 5.1). Dua target dari satu build:
#
#   runtime : hanya apps/web/.output (Nitro node-server), user non-root,
#             healthcheck /api/health. Ini yang melayani request.
#   tools   : source workspace + node_modules + klien PostgreSQL 18, untuk
#             perintah sekali jalan: migrate, backup, restore, admin:create,
#             site:create, site:domain, revenue:sync (deploy/tools.sh).
#
#   docker build --target runtime -t blog-app .
#   docker build --target tools   -t blog-tools .
# =====================================================================

ARG NODE_IMAGE=node:24-slim
ARG PG_IMAGE=postgres:18.7

FROM ${NODE_IMAGE} AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable pnpm
WORKDIR /repo

# --- Dependensi + build ---------------------------------------------------
FROM base AS build
# Lockfile dulu: lapisan unduhan paket di-cache selama lockfile tidak berubah.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && pnpm fetch --frozen-lockfile
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile --offline
RUN pnpm build

# --- runtime ---------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.output ./.output
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", ".output/server/index.mjs"]

# --- tools -----------------------------------------------------------------
# Berbasis image PostgreSQL agar pg_dump/pg_restore/psql sama versinya dengan
# server (klien Debian bawaan image node terlalu lama untuk server 18).
FROM ${PG_IMAGE} AS tools
COPY --from=base /usr/local/bin/node /usr/local/bin/node
COPY --from=build /repo /repo
COPY deploy/tools.sh /usr/local/bin/tools
RUN chmod 0755 /usr/local/bin/tools
WORKDIR /repo
# uid 1000 = user node di image runtime: media dan backup dimiliki user yang sama.
USER 1000:1000
ENV HOME=/tmp
ENTRYPOINT ["tools"]
CMD ["help"]
