# Vew APM — Features

Full catalogue of what Vew APM does. For a quick overview see the
[README](README.md); for deployment see [DOCKER.md](DOCKER.md).

---

## Monitoring & checks

- **Per-monitor polling** at a configurable interval; each check captures latency,
  HTTP status, and the response state.
- **Check types**
  - `actuator` — parse the Spring Boot health tree (default).
  - `http` — UP on a 2xx / expected status, with an optional body keyword.
  - `json` — UP from a value at a JSON path you pick (dot/bracket paths).
  - `prometheus` — scrape a Prometheus text endpoint; UP when reachable + 2xx.
  - **"Fetch sample"** previews any endpoint in the form so you can see its shape
    before choosing a path / metric.
- **Request auth** per monitor — None, Basic, Header (custom name/value), or
  Bearer/JWT — sent with every check and the sample fetch. Secrets kept server-side.
- **Actuator parser** — recursive walk of `components` into dot-paths, plus disk
  (`total/free/used%`), Eureka apps, discovery services, health probes, and config
  property sources.
- **Service registry** — auto-seeds every discovered service on first sight; marks a
  tracked service `DOWN` when it vanishes, `STALE` when the endpoint is unreachable.
  Names canonicalised across discovery sources.
- **Monitor groups** — an optional label per monitor; the dashboard and status page
  section monitors by group (named groups first, ungrouped last).
- **Health probes** panel — plain-language liveness/readiness with the K8s consequence.
- **Clone** — duplicate a monitor (carries its config, auth, thresholds, and
  Prometheus sources/rules).

## Prometheus metrics

- Attach metrics to **any** monitor (not just the `prometheus` type) alongside its
  health check.
- **Metric sources** — one or more Prometheus endpoints per monitor (e.g. a Spring
  microservice's gateway / billing / pph `/actuator/prometheus`).
- **Metric rules** — metric name + label matchers + operator (`>` `≥` `<` `≤`) +
  warn/critical thresholds, each targeting a source.
- Each check scrapes the endpoints (deduped), **charts** every watched metric over
  time on the monitor page, and opens a `metric` incident on a breach
  (critical-before-warning). A metric breach does **not** flip the monitor's own
  UP/DOWN — health still drives that.
- Hand-written, dependency-free text-exposition parser (gauges / raw counters;
  `rate()` and histogram `p95` are out of scope for now).

## Alerting

- **Threshold rule engine** with warning / critical severities:
  - **Disk usage %** — warn / critical.
  - **Availability** — DOWN sustained ≥ N minutes (debounced against flaps).
  - **Latency** — p95 over the last N checks (a spike an average would hide); the
    monitor page also shows p50 / p95 / p99.
  - **Component** `DOWN` (critical) / `OUT_OF_SERVICE` (warning), grace-debounced.
  - **Service registry** — a service seen before but now missing past a grace window.
  - **TLS certificate expiry** — warn / critical days before (or after) `notAfter`,
    for https monitors.
  - **Metric** — per-rule Prometheus thresholds (see above).
- **Global defaults** in **Settings → Alerts**, with optional **per-monitor overrides**.
- **Incidents** — global page + per-monitor log, ongoing-count badge, auto-resolve on
  recovery, severity + reason + measured value/threshold recorded.
- **Re-notify & escalate** — a still-open **critical** incident re-notifies every
  `renotifyMinutes`; a warning that escalates to critical re-alerts immediately.
  Warnings notify once. Suppressed (maintenance) incidents never re-notify.

## Notifications

- **Global channels** — webhook / email (via Resend) / Telegram / Slack / Discord /
  Microsoft Teams. Every enabled channel fires for every monitor (per-monitor
  silencing is via maintenance / pause).
- **Chat channels** — Slack, Discord, and Teams via incoming webhooks; severity rides
  on the card color (green resolved · red critical · amber warning). Slack/Discord
  take an optional display name; Slack also an icon emoji.
- **Webhook request auth** — None / Basic / Header / Bearer.
- **Routing rules** (per channel) — scope a channel to a single monitor, a group,
  or all; set a minimum severity (warning-and-up / critical-only) and restrict to
  specific alert kinds. A channel with no rules fires for everything (default).
- Per-channel config (incl. Resend API key) — no env var needed.
- **Secrets encrypted at rest** (AES-256-GCM); never shipped to the client. Masked on
  edit (blank = keep).
- **Delivery retries** with backoff (network / 429 / 5xx retry; permanent 4xx stops).
- **Acknowledge / snooze** — every down alert carries a signed, session-free link;
  clicking it (Acknowledge / Snooze 1h / Snooze 4h) stops reminder notifications
  until the incident recovers or the snooze ends. Escalation to critical clears an
  ack and re-alerts. Requires `APP_BASE_URL` for the link to be included.
- **Escalation policies** — an ordered, time-delayed ladder of steps; each step
  pages a channel (or the current on-call responder) N minutes after a critical
  incident opens if it is still unacknowledged. One policy is active at a time;
  ack / snooze pauses it. Managed under Settings › Escalation.
- **On-call schedules** — responders map a person to a contact channel; a schedule
  rotates over them every N days. An escalation step targeting a schedule pages
  whoever is on call at fire time. Managed under Settings › On-call.
- **Alert dependencies** — a monitor can depend on a parent; while the parent has an
  open availability incident, the child's incidents are suppressed (no alert flood
  for everything behind a downed gateway). Transitive across a chain. Set on the
  create-monitor form.
- Create / edit / test each channel from the UI.

## Status page & reporting

- **Public status page** — opt-in per monitor, no-login `/status` (off by default).
  Overall banner → per-service 90-day uptime bar + uptime % → a separate "Past
  incidents" feed. Selectable 24h / 7d / 90d window. Active/upcoming
  **scheduled-maintenance** banners. Leaks nothing internal — no URLs, components,
  disk, service names, or raw reasons; private monitors' maintenance windows are hidden.
- **Announcements** — operator-posted incidents with an update timeline
  (Investigating → Identified → Monitoring → Resolved), shown on the status page
  alongside the auto-detected ones.
- **SLO report** — per-monitor uptime vs a target (global default + per-monitor
  override) over 7 / 30 / 90 days, with error-budget consumption.
- **Maintenance windows** — global or per-monitor, one-off or recurring (rrule-aware),
  with a timezone selector; suppress alerts without affecting uptime %.

## Operations

- **Data & storage** (Settings → Data) — data retention (prune checks + their
  snapshots older than N days, hourly), database size readout, and an on-demand
  **Reclaim space (VACUUM)** action.
- **Own health endpoint** — public `GET /api/health` reports DB reachability +
  scheduler liveness as `200` / `503`; wired into the Docker `HEALTHCHECK`.
- **In-process scheduler** — ticks on an interval and runs due monitors; overlap-guarded
  so a slow tick can't double-run. Production can drive checks via `GET /api/cron/tick`.
- **Encrypted secrets at rest** — channel secrets (and the encryption key handling) as
  above.

## UI & access

- **Dashboard** — Uptime-Kuma-style grid: per-monitor uptime bar, latency, status,
  disk, active-alert accents, grouped by monitor group.
- **Appearance** — light / dark / auto theme, heartbeat-bar style, language
  (EN / ID / ZH / MS), staged behind Save / Cancel.
- **Basic auth** — single admin, bcrypt, signed JWT cookie; first-run `/setup`.

## Quality & delivery

- **Tests** — Vitest units (parser, rules, crypto, retry, status, Prometheus parser)
  + checker & API-route integration; **Playwright E2E** for the core flows.
- **CI** — GitHub Actions (lint · typecheck · test · build, plus a Docker image build)
  and a dependency-audit job.
- **Self-hostable** — single Docker container + one SQLite volume; secrets
  auto-generated on first start. See [DOCKER.md](DOCKER.md).
