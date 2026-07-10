# Deploying Vew APM with Docker

Self-host Vew APM as a single container. SQLite lives on a named volume, and the
built-in scheduler runs the checks inside the container (no external cron needed).

## Prerequisites

- Docker + Docker Compose v2 (`docker compose version`)

## 1. Configure — nothing required

**Secrets are auto-generated.** On first start the container creates
`SESSION_SECRET` and `CRON_SECRET`, stores them on the data volume
(`/data/.session_secret`, `/data/.cron_secret`), and reuses them on every
restart — so sessions stay valid. No manual setup needed.

Optional overrides (only if you want to pin your own, e.g. from a K8s/CI secret):

```bash
cp .env.example .env      # then optionally set SESSION_SECRET / CRON_SECRET
```

> If you set `SESSION_SECRET`/`CRON_SECRET` (env or `.env`), that value wins and
> the container won't generate one.
> `DATABASE_URL` is set by Compose to `/data/apm.db` — don't override it.
> Notification secrets (Resend key, Telegram token) are entered in the UI.

## 2. Build & run

```bash
docker compose up -d --build
```

On start the entrypoint provisions the secrets (if absent), applies DB
migrations, then starts the standalone server.

Open **http://localhost:3000** → you'll be sent to `/setup` to create the admin,
then `/login`.

Change the published port with `PORT` (host side):

```bash
PORT=8080 docker compose up -d --build   # → http://localhost:8080
```

## 3. Verify

```bash
docker compose ps
docker compose logs -f          # look for: "[✓] Changes applied", "✓ Ready", "[scheduler] started"
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/setup   # 200
```

Add a monitor pointing at any reachable `/actuator/health`. To reach a service
on the **host** from inside the container, use `http://host.docker.internal:PORT/...`.

## Build the image only (without Compose)

```bash
docker build -t vew-apm:latest .

# secrets auto-generate on the volume; no -e needed
docker run -d --name vew-apm -p 3000:3000 \
  -v vew-apm-data:/data \
  vew-apm:latest
```

## Operations

| Task | Command |
|---|---|
| Logs | `docker compose logs -f` |
| Restart | `docker compose restart` |
| Stop (keep data) | `docker compose down` |
| Stop + wipe data | `docker compose down -v` |
| Update to new code | `git pull && docker compose up -d --build` |
| Shell into container | `docker compose exec apm sh` |

### Back up / restore the database

The DB is the `apm-data` volume (`/data/apm.db` + WAL files).

```bash
# backup → ./apm-backup.db
docker compose cp apm:/data/apm.db ./apm-backup.db

# restore (stop first)
docker compose stop
docker compose cp ./apm-backup.db apm:/data/apm.db
docker compose start
```

## How it works

- **Multi-stage build** ([Dockerfile](Dockerfile)): the builder compiles
  `better-sqlite3` and runs a **Next standalone** build (`output: "standalone"`);
  the runner carries only the traced server + the native addon → ~450 MB image
  (no dev deps, no build toolchain).
- **Migrations**: [scripts/migrate.cjs](scripts/migrate.cjs) applies the
  drizzle-generated SQL in `drizzle/` at container start using better-sqlite3
  only (no drizzle-kit at runtime), tracked in a `_migrations` table.
- **Checks**: the in-process scheduler ([lib/scheduler.ts](lib/scheduler.ts)) ticks
  every `APM_SCHEDULER_TICK_MS` (default 5000) — no cron/webhook needed.
- **Persistence**: everything is in the `apm-data` volume; the container is
  otherwise stateless.

> Schema changes: run `npm run db:generate` (commits a new file to `drizzle/`) so
> the migrator picks it up on the next container start.

## Notes & troubleshooting

- **Secrets**: `.env` and `data/` are gitignored and excluded from the image via
  `.dockerignore` — they never bake into a layer.
- **Rotating secrets**: delete `/data/.session_secret` (invalidates all sessions)
  and restart — a new one is generated. Or set `SESSION_SECRET` explicitly.
- **Reverse proxy / TLS**: put Nginx/Caddy/Traefik in front and set `APP_BASE_URL`
  to the public URL. The app speaks plain HTTP on port 3000.
- **Multi-instance**: SQLite is single-writer; run **one** replica. For horizontal
  scale, swap the Drizzle driver for a hosted DB.
