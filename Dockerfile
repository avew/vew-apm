# syntax=docker/dockerfile:1

FROM node:26-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production

# ---- builder: full deps + Next standalone build ----
FROM base AS builder
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# NODE_ENV=production (from base) would drop devDeps; force-include for the build
RUN npm ci --include=dev
COPY . .
# placeholders so the build never touches real secrets/db (routes are dynamic)
ENV SESSION_SECRET="build-time-placeholder-build-time-placeholder"
ENV DATABASE_URL="/tmp/build.db"
RUN npm run build

# ---- runner: standalone (traced minimal node_modules) ----
FROM base AS runner
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL="/data/apm.db"

# Next standalone server + assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# native addon (kept external) + runtime migrator + migrations + entrypoint
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts/migrate.cjs ./scripts/migrate.cjs
COPY --from=builder /app/docker/entrypoint.sh ./docker/entrypoint.sh

RUN mkdir -p /data && chmod +x docker/entrypoint.sh
VOLUME ["/data"]
EXPOSE 3000

# Container health = the app's own /api/health (DB reachable + scheduler ticking).
# Node 22 has global fetch; exit non-zero on non-2xx or connection failure.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# entrypoint auto-generates secrets (persisted to /data), migrates, starts server.
CMD ["sh", "docker/entrypoint.sh"]
