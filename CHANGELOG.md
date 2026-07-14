# Changelog

All notable changes to Vew APM are documented here. This project follows
[Semantic Versioning](https://semver.org) and the spirit of
[Keep a Changelog](https://keepachangelog.com).

## 1.0.0 — 2026-07-11

First stable release. Vew APM polls Spring Boot `/actuator/health` endpoints,
parses the nested actuator JSON, stores history in SQLite, evaluates threshold
rules, raises incidents, fans out notifications, and renders an Uptime-Kuma-style
dashboard plus a public status page.

### Monitoring
- Per-monitor polling at a configurable interval; latency, HTTP status, and
  errors captured each check by an in-process scheduler (overlap-guarded).
- Actuator parser: recursive `components` walk into dot-paths, disk usage,
  Eureka apps, discovery services, health probes, config property sources.
- Service registry: auto-seeds services, marks `DOWN` when a tracked one
  vanishes and `STALE` when the endpoint is unreachable.
- Health-response body capped at 2 MB to bound memory.
- Optional per-monitor **groups** on the dashboard and status page.

### Alerting
- Threshold rule engine with warning/critical severities: disk %, availability
  (DOWN sustained ≥ N min), latency **p95**, component `DOWN`/`OUT_OF_SERVICE`,
  Eureka/service disappearance — global defaults with per-monitor overrides.
- Incidents with grace/debounce; ongoing count; auto-resolve.
- **Renotify** on a cadence for still-open criticals, and immediate re-alert on
  warning→critical escalation.

### Notifications
- Global channels: webhook, email (Resend), Telegram. Every enabled channel
  fires for every monitor.
- Delivery retries with exponential backoff; permanent 4xx stop.
- Channel secrets **encrypted at rest** (AES-256-GCM).

### Status page
- Opt-in public `/status` (off by default): overall banner, selectable
  24h/7d/90d uptime bars, generic incident timeline, scheduled-maintenance
  banners, and operator-posted **announcements** with an update timeline.
- Never leaks URLs, components, disk, service names, raw reasons, or private
  monitors' maintenance windows.

### Maintenance & retention
- Maintenance windows (global or per-monitor, one-off or recurring) suppress
  alerts without affecting uptime %.
- Hourly retention prunes old checks and resolved incidents.

### Security & ops
- Single-admin auth (bcrypt + signed JWT cookie), login rate-limiting, security
  headers (CSP, HSTS, …); session cookie `Secure` only over real HTTPS.
- `GET /api/health` liveness + Docker `HEALTHCHECK`.
- SQLite in WAL with `busy_timeout`; transactional check persistence.
- Docker: Next standalone image (~450 MB), runtime migrations, auto-generated
  secrets; CI (lint/typecheck/test/build) + image publish to GHCR + Dependabot.
- i18n: English, Indonesian, Chinese, Malay.
