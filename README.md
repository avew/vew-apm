# Vew APM — Trust ur monitor

[![CI](https://github.com/avew/vew-apm/actions/workflows/ci.yml/badge.svg)](https://github.com/avew/vew-apm/actions/workflows/ci.yml)
[![Docker](https://github.com/avew/vew-apm/actions/workflows/docker.yml/badge.svg)](https://github.com/avew/vew-apm/actions/workflows/docker.yml)

Application Performance Monitor for Spring Boot microservices. It polls each
service's `/actuator/health` endpoint on a configurable interval, parses the
deeply-nested actuator JSON, stores history, and raises incidents on threshold
breaches — with an Uptime-Kuma-style dashboard that drills into components,
disk, and the Eureka service registry.

Built because Uptime Kuma can't parse a custom nested health tree, can't chart
disk usage as a time series, and can't track Eureka registry membership.

## Features

Highlights — see **[FEATURES.md](FEATURES.md)** for the full catalogue.

- **Check types** — `actuator` (Spring health tree), `http`, `json` (value at a
  path), or `prometheus` (scrape a metrics endpoint); optional per-monitor request
  auth (Basic / Header / Bearer).
- **Prometheus metrics on any monitor** — add one or more endpoints (metric sources)
  + threshold rules; each metric is charted over time and a breach raises a `metric`
  incident (health/UP-DOWN stays independent).
- **Threshold rule engine** (warn / critical) — disk %, availability, latency p95,
  component down, service-registry drop, TLS-cert expiry, and metric rules; global
  defaults + per-monitor overrides.
- **Incidents** with re-notify + escalation; **notifications** to global channels
  (webhook / email / Telegram) with request auth and encrypted secrets.
- **Status page** (opt-in, no-login), **announcements**, **SLO report**,
  **maintenance windows**, **monitor groups**, **service registry**, health probes.
- **Operations** — data retention + on-demand VACUUM, own `GET /api/health` liveness
  (Docker `HEALTHCHECK`), in-process scheduler.
- **Appearance** — light/dark/auto, language (EN/ID/ZH/MS); single-admin auth.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · SQLite (better-sqlite3) +
Drizzle ORM · Recharts · Vitest.

## Quick start

```bash
npm install

# 1. env
cp .env.example .env
#   set SESSION_SECRET (>= 32 chars): openssl rand -hex 32
#   DATABASE_URL defaults to ./data/apm.db (dir auto-created)

# 2. create tables
mkdir -p data
npm run db:push

# 3. run
npm run dev            # http://localhost:3000 → /setup to create the admin
```

First visit redirects to `/setup` to create the admin, then `/login`.

### Add a monitor

New monitor → point at any `/actuator/health` URL. No live backend? Use the
built-in mock:

```bash
npm run mock           # http://localhost:4100/health  (edit example/health-check.json live)
```

Add a monitor at `http://localhost:4100/health`. Simulate conditions via query:
`?status=DOWN`, `?disk=95`, `?drop=admin-console-svc`, `?down=redis`,
`?delay=3000`, `?http=503` (combine freely).

## Deployment (Docker Compose)

The recommended way to self-host. One container, one volume, zero required config.

```bash
docker compose up -d --build     # → http://localhost:3000
```

On first start the container automatically:

1. **Generates `SESSION_SECRET` + `CRON_SECRET`** and persists them to the volume
   (`/data/.session_secret`, `/data/.cron_secret`) — stable across restarts, so
   logins don't drop. Set them in `.env` only if you want to pin your own.
2. Runs **`db:push`** to create/update the SQLite schema on the volume.
3. Starts the server; the **in-process scheduler runs the checks** — no external
   cron needed.

```bash
# change the published port
PORT=8080 docker compose up -d --build

# logs / restart / update / stop
docker compose logs -f
docker compose restart
git pull && docker compose up -d --build
docker compose down            # keep data
docker compose down -v         # wipe data volume
```

- **Persistence**: everything lives in the `apm-data` volume (`/data/apm.db`).
  Back up with `docker compose cp apm:/data/apm.db ./apm-backup.db`.
- **One replica only** — SQLite is single-writer. For horizontal scale, swap the
  Drizzle driver for a hosted DB.
- Behind a reverse proxy (Nginx/Caddy/Traefik) set `APP_BASE_URL` to the public URL.

Full build internals, `docker run` (without Compose), secret rotation, and
troubleshooting: **[DOCKER.md](DOCKER.md)**.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server + in-process scheduler |
| `npm run build` / `start` | Production build / serve |
| `npm test` | Vitest — units (parser, rules, crypto, retry, status) + checker & API-route integration |
| `npm run test:e2e` | Playwright E2E (`e2e/`) — boots the app on a throwaway DB, drives real browser flows |
| `npm run test:e2e:ui` | Playwright in UI mode |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Apply schema to SQLite |
| `npm run db:studio` | Drizzle Studio |
| `npm run seed` | Seed one monitor at the local fixture |
| `npm run seed:incidents` | Seed a demo monitor with 24h history + incidents |
| `npm run mock` / `mock:watch` | Standalone mock actuator service |

### End-to-end tests (Playwright)

```bash
npx playwright install chromium   # one-time: browser binary
npm run test:e2e                  # boots the app + runs e2e/
```

Playwright ([playwright.config.ts](playwright.config.ts)) starts the app on port
3100 against a **throwaway SQLite DB** (wiped + migrated each run) with the
scheduler disabled, so runs are deterministic and need no real secrets. A setup
project creates the admin and signs in once; the saved session is reused by the
specs in [e2e/](e2e/) (health, dashboard, login redirect, monitor creation). CI
runs the same suite on every PR.

## How checks run

- **Dev**: an in-process scheduler ([lib/scheduler.ts](lib/scheduler.ts), started
  from [instrumentation.ts](instrumentation.ts)) ticks every ~5s and runs any
  monitor whose `next_check_at` is due. Tunables: `APM_SCHEDULER_TICK_MS`,
  `APM_DISABLE_SCHEDULER=1`. Note: the dev scheduler is bound at server boot —
  after changing `lib/checker.ts` (or its deps), restart `npm run dev`.
- **Production / Vercel**: hit `GET /api/cron/tick` (Bearer `CRON_SECRET`) from an
  external scheduler / Vercel Cron. `vercel.json` registers `* * * * *`.
  > SQLite is local-disk; on serverless use a persistent host, or swap the
  > Drizzle driver for a hosted DB.
- **Retention**: the scheduler prunes checks (and their snapshots) older than
  `retentionDays` hourly — set it in **Settings → Alerts → Data retention**
  (default 30 days; 0 = keep forever). `raw_json` is not stored per check to keep
  the DB small; property sources come from the component records.
- **Health**: `GET /api/health` reports Vew APM's own liveness (DB reachable +
  scheduler ticking) as `200`/`503` — public, no auth. The Docker image wires it
  into a `HEALTHCHECK` so orchestrators see `healthy`/`unhealthy`.
- **Metrics**: `GET /api/metrics` exposes Prometheus gauges — per-monitor
  `apm_monitor_up` / `response_ms` / `disk_used_percent` / `cert_days_left` /
  `last_check_timestamp_seconds`, plus `apm_incidents_open{severity}` and
  scheduler liveness. Open by default; set `METRICS_TOKEN` to require
  `Authorization: Bearer <token>`. Example scrape config:

  ```yaml
  scrape_configs:
    - job_name: vew-apm
      metrics_path: /api/metrics
      static_configs: [{ targets: ["vew-apm:3000"] }]
      # authorization: { credentials: "<METRICS_TOKEN>" }   # if set
  ```

## Environment

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | SQLite path (default `./data/apm.db`; Compose sets `/data/apm.db`) |
| `SESSION_SECRET` | dev only | ≥ 32 chars, signs the session cookie. **Auto-generated under Docker.** |
| `CRON_SECRET` | optional | protects `/api/cron/tick`. **Auto-generated under Docker.** |
| `ENCRYPTION_KEY` | optional | encrypts channel secrets at rest. If unset, a random key is generated once at `<data-dir>/.secret_key`. Don't reuse `SESSION_SECRET`. |
| `METRICS_TOKEN` | optional | if set, `/api/metrics` requires `Authorization: Bearer <token>`. Unset = open. |
| `APP_BASE_URL` | no | used in notification links |

Running locally (`npm run dev`) you must set `SESSION_SECRET` yourself; under
Docker it (and `CRON_SECRET`) are generated on first start. Resend API keys and
Telegram tokens are stored **per channel** in the UI — not in env — and
**encrypted at rest** (AES-256-GCM) so a leaked `apm.db` doesn't spill them.
Keep the `.secret_key` file (or `ENCRYPTION_KEY`) — without it, stored secrets
can't be decrypted.

## Project layout

```
app/(dashboard)/   dashboard, monitors, incidents, settings pages
app/api/           monitors, notifications, maintenance, alert-settings, auth, cron
lib/               parser, checker, rules, alerts, notifier(+notifiers/),
                   maintenance, uptime, auth, scheduler, i18n(+server/client), db/
scripts/           seed, seed-incidents, mock-service, demo-service-down
```

Data model lives in [lib/db/schema.ts](lib/db/schema.ts).

## Contributing

`main` is protected — changes land via pull request with green CI. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the branch → PR → merge flow and the
checks to run locally first.

---

Crafted with ♥ in Bandung by [avew](https://saweria.co/asepthon) · 2026
