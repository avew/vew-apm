# syntax=docker/dockerfile:1

# ---- builder: install deps (compiles better-sqlite3 native) + build Next ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# build toolchain for native modules (better-sqlite3)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# placeholders so the build never touches real secrets/db (routes are dynamic;
# these are NOT carried into the runtime image)
ENV NODE_ENV=production
ENV SESSION_SECRET="build-time-placeholder-build-time-placeholder"
ENV DATABASE_URL="/tmp/build.db"
RUN npm run build

# ---- runner: same base (glibc match for the native module), no build tools ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL="/data/apm.db"

# carry the fully-built app (node_modules already has the compiled .node)
COPY --from=builder /app ./

# sqlite lives on a mounted volume
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 3000

# ensure schema exists, then start (in-process scheduler runs the checks)
CMD ["sh", "-c", "npm run db:push && npm run start -- -H 0.0.0.0 -p 3000"]
