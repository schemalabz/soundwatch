FROM node:22-bookworm-slim AS base

# openssl must exist before `prisma generate` runs: Prisma detects the host
# openssl version to pick the "native" query engine, and without the binary
# it guesses openssl 1.1 — which then fails to load at runtime on bookworm
# (openssl 3). Affects arm64 local builds; amd64 prod was saved by the
# explicit debian-openssl-3.0.x binaryTarget.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Builder ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

# Bundle the TimescaleDB bootstrap to plain JS so the runner needs only node —
# shipping tsx into the runtime image drags in esbuild's platform binary and
# its resolver chain for one script.
RUN npx esbuild scripts/timescale-objects.ts \
      --bundle --platform=node --format=cjs --target=node22 \
      --external:@prisma/client --external:.prisma \
      --outfile=timescale-objects.cjs

# --- Runner ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma client and CLI (for migrations)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/prisma ./prisma

# The continuous aggregate is not a migration — Prisma wraps migrations in a
# transaction and CREATE MATERIALIZED VIEW ... WITH (timescaledb.continuous)
# cannot run inside one. It lived only in the ingester image, and nothing
# ordered the app behind the ingester, so the app could win the migration lock
# and start serving with no readings_hour_bins: /api/aggregate, /api/series and
# /api/status all 500, persisting for as long as the ingester crash-loops.
# The script is idempotent, so both images running it is fine.
COPY --from=builder --chown=nextjs:nodejs /app/timescale-objects.cjs ./timescale-objects.cjs
COPY scripts/start.sh ./start.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "start.sh"]
