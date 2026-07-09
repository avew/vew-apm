# Deploying Vew APM with Docker

Self-host Vew APM as a single container. SQLite lives on a named volume, and the
built-in scheduler runs the checks inside the container (no external cron needed).

## Prerequisites

- Docker + Docker Compose v2 (`docker compose version`)
- A `SESSION_SECRET` (≥ 32 chars): `openssl rand -hex 32`

## 1. Configure

Compose reads `.env` from the project root for variable substitution. Create it:

```bash
cp .env.example .env
```

Edit `.env` — the only value Compose needs is `SESSION_SECRET`:

```dotenv
SESSION_SECRET="<paste 32+ char random string>"
# optional
APP_BASE_URL="http://localhost:3000"
# APM_SCHEDULER_TICK_MS=5000
```

> `DATABASE_URL` is set by Compose to `/data/apm.db` (the volume) — don't override it.
> Notification secrets (Resend key, Telegram token) are entered in the UI, not here.

## 2. Build & run

```bash
docker compose up -d --build
```

What happens on start: the container runs `db:push` (creates/updates the SQLite
schema on the volume), then `next start`. First run creates an empty DB.

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

docker run -d --name vew-apm -p 3000:3000 \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e DATABASE_URL=/data/apm.db \
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

- **Multi-stage build** ([Dockerfile](Dockerfile)): the builder compiles the
  `better-sqlite3` native addon and runs `next build`; the runner is the same
  Debian base (glibc match) without the build toolchain.
- **Schema**: `npm run db:push` runs at container start against the volume DB.
- **Checks**: the in-process scheduler ([lib/scheduler.ts](lib/scheduler.ts)) ticks
  every `APM_SCHEDULER_TICK_MS` (default 5000) — no cron/webhook needed.
- **Persistence**: everything is in the `apm-data` volume; the container is
  otherwise stateless.

## Notes & troubleshooting

- **Secrets**: `.env` and `data/` are gitignored and excluded from the image via
  `.dockerignore` — they never bake into a layer.
- **`SESSION_SECRET not set`** on boot → you didn't set it in `.env`.
- **Reverse proxy / TLS**: put Nginx/Caddy/Traefik in front and set `APP_BASE_URL`
  to the public URL. The app speaks plain HTTP on port 3000.
- **Multi-instance**: SQLite is single-writer; run **one** replica. For horizontal
  scale, swap the Drizzle driver for a hosted DB.
