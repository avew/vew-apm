# Vew APM — Trust ur monitor

Application Performance Monitor for Spring Boot microservices. It polls each
service's `/actuator/health` endpoint on a configurable interval, parses the
deeply-nested actuator JSON, stores history, and raises incidents on threshold
breaches — with an Uptime-Kuma-style dashboard that drills into components,
disk, and the Eureka service registry.

Built because Uptime Kuma can't parse a custom nested health tree, can't chart
disk usage as a time series, and can't track Eureka registry membership.

## Features

- **Per-monitor polling** at a configurable interval; latency, HTTP status, and
  raw body captured each check.
- **Actuator parser** — recursive walk of `components` into dot-paths, plus disk
  (`total/free/used%`), Eureka apps, discovery services, health probes, and
  config property sources.
- **Threshold rule engine** with warning/critical severities:
  - Disk usage % (warn / critical)
  - Availability — DOWN sustained ≥ N minutes (debounced)
  - Latency — rolling average over N checks
  - Component `DOWN` (critical) / `OUT_OF_SERVICE` (warning), grace-debounced
  - Service registry — a service that was seen but disappears past a grace window
  - Global defaults in **Settings → Alerts**, optional **per-monitor overrides**.
- **Service registry** — auto-seeds every service on first sight; marks `DOWN`
  when a tracked service vanishes, `STALE` when the endpoint is unreachable.
- **Health probes** panel — plain-language liveness/readiness with K8s consequence.
- **Incidents** — global page + per-monitor log, ongoing count badge, auto-resolve.
- **Notifications** — global channels (webhook / email via Resend / Telegram);
  every enabled channel fires for all monitors. Per-channel config (incl. Resend
  API key); no env var needed.
- **Maintenance windows** — global or per-monitor, one-off or recurring, with
  timezone selector; suppress alerts without affecting uptime %.
- **Appearance** — light/dark/auto theme, heartbeat-bar style, language
  (EN/ID/ZH/MS), staged behind Save/Cancel.
- **Basic auth** — single admin, bcrypt, signed JWT cookie.

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

### Docker

```bash
cp .env.example .env      # set SESSION_SECRET
docker compose up -d --build   # → http://localhost:3000
```

Full guide: [DOCKER.md](DOCKER.md).

### Add a monitor

New monitor → point at any `/actuator/health` URL. No live backend? Use the
built-in mock:

```bash
npm run mock           # http://localhost:4100/health  (edit example/health-check.json live)
```

Add a monitor at `http://localhost:4100/health`. Simulate conditions via query:
`?status=DOWN`, `?disk=95`, `?drop=admin-console-svc`, `?down=redis`,
`?delay=3000`, `?http=503` (combine freely).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server + in-process scheduler |
| `npm run build` / `start` | Production build / serve |
| `npm test` | Vitest (parser + rules) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Apply schema to SQLite |
| `npm run db:studio` | Drizzle Studio |
| `npm run seed` | Seed one monitor at the local fixture |
| `npm run seed:incidents` | Seed a demo monitor with 24h history + incidents |
| `npm run mock` / `mock:watch` | Standalone mock actuator service |

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

## Environment

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | SQLite path (default `./data/apm.db`) |
| `SESSION_SECRET` | yes | ≥ 32 chars, signs the session cookie |
| `CRON_SECRET` | prod | protects `/api/cron/tick` |
| `APP_BASE_URL` | no | used in notification links |

Resend API keys are stored **per email channel** in the UI — not in env.

## Project layout

```
app/(dashboard)/   dashboard, monitors, incidents, settings pages
app/api/           monitors, notifications, maintenance, alert-settings, auth, cron
lib/               parser, checker, rules, alerts, notifier(+notifiers/),
                   maintenance, uptime, auth, scheduler, i18n(+server/client), db/
scripts/           seed, seed-incidents, mock-service, demo-service-down
```

Data model lives in [lib/db/schema.ts](lib/db/schema.ts).

---

Crafted with ♥ in Bandung by [avew](https://saweria.co/asepthon) · 2026
