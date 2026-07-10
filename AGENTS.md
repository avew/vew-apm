<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Vew APM — agent guide

APM for Spring Boot microservices: polls `/actuator/health`, parses the nested
actuator JSON, stores history in SQLite, evaluates alert rules, raises incidents,
fans out notifications, renders an Uptime-Kuma-style dashboard.

## Stack
Next.js 16 App Router · TypeScript · Tailwind v4 · **SQLite via better-sqlite3 +
Drizzle** · Recharts · Vitest. Single-tenant, self-hostable.

## Commands
- `npm run dev` — dev + in-process scheduler
- `npm test` — Vitest (`lib/*.test.ts`); `npm run typecheck` — `tsc --noEmit`
- `npm run db:push` — apply `lib/db/schema.ts` to SQLite (needed after any schema edit)
- `npm run mock` — standalone mock actuator on :4100 (edit `example/health-check.json` live)
- Always run `npm run typecheck` + `npm run build` before declaring done.

## Architecture (data flow)
`scheduler` → `checker.runCheck` → `fetchHealth` → `parser.parseHealth` →
persist (`checks` + child rows) → `rules.evaluateRules` (pure) →
`reconcileIncidents` (open/resolve, respects maintenance) → `notifier.dispatch`.

Key files in `lib/`:
- `parser.ts` — pure; recursive `components` walk → dot-path statuses, disks, services, propertySources. Unit-tested.
- `rules.ts` — **pure** rule engine → `DesiredAlert[]` keyed by `(kind, componentPath)`. Unit-tested. Keep it pure (no DB); the checker feeds it DB-derived inputs (`badComponents`, `eurekaMissing`, history).
- `alerts.ts` — `EffectiveThresholds` = global `alert_settings` merged with per-monitor overrides (`monitor.x ?? global.x`). Add a new threshold in ALL of: `EffectiveThresholds`, `ALERT_DEFAULTS`, `mergeThresholds`, `getEffectiveThresholds`, schema (`alert_settings` + `monitors` nullable), the two API zod schemas, and both forms.
- `checker.ts` — orchestration + all DB history queries (service registry sync, sustained-bad components).
- `scheduler.ts` — in-process tick loop; each tick is wrapped in `guardOverlap` (`overlap-guard.ts`) so a slow tick can't overlap and double-run a due monitor. Liveness state (`started`/`lastTickAt`) kept on `globalThis` behind `Symbol.for` because Next bundles instrumentation and route handlers separately (a module-level `let` would be duplicated per bundle and invisible to `/api/health`). `GET /api/health` (public in `middleware.ts`) reads it: DB `SELECT 1` + tick freshness → 200/503; drives the Docker `HEALTHCHECK`.
- `notifier.ts` + `notifiers/{webhook,email,telegram}.ts` — channels are **global**: every enabled channel fires for every monitor (no per-monitor linking). `dispatch` retries each send via `withRetry` (`retry.ts`); senders throw `NotifyError{retryable}` (network/429/5xx retry, other 4xx stop). **Renotify**: `reconcileIncidents` re-`dispatch`es a still-open **critical** incident every `renotifyMinutes` (`down` event, `repeat:true`) and re-alerts immediately on warning→critical escalation (`escalated:true`); tracked via `incidents.lastNotifiedAt`/`notifyCount`. Suppressed incidents never renotify; `renotifyMinutes=0` = notify once.
- `maintenance.ts` — `isMonitorMuted`; muted incidents get `suppressed=true`, no notify, uptime unaffected.
- `i18n.ts` (dict) + `i18n-server.ts` (`getT` from `apm_lang` cookie, server components) + `i18n-client.tsx` (`LangProvider`/`useT`, client). Missing keys fall back to English.

## Conventions
- Design tokens + `.card`/`.btn-*`/`.badge`/`.field-input` in `app/globals.css`; use CSS vars (`var(--foreground)` etc.), not hardcoded colors. Theme is light/dark/auto via `data-theme`.
- Secrets (Telegram bot token, Resend API key) live in `notification_channels.config` (jsonb), not env — and are **encrypted at rest** (`crypto.ts`, AES-256-GCM, `enc:v1:` prefix). Encrypt on write (both notifications API routes), `decryptSecret` on read (`notifier.ts` dispatch + `sendTest`; `notifications/page.tsx` decrypts only to build a secret-free row preview — never ship `config` to the client). `decryptSecret` passes plaintext through, so legacy rows still read; `instrumentation.ts` runs `encryptPlaintextChannels()` at boot (idempotent). Key: `ENCRYPTION_KEY` env or generated `<data-dir>/.secret_key` — never `SESSION_SECRET` (rotating it would orphan every secret).
- API routes validate with `zod` and gate with `requireUser()` (except `/api/cron/*`).
- Security headers (CSP, X-Frame-Options, HSTS, etc.) are set for all routes in `next.config.ts` `headers()`. CSP uses `'unsafe-inline'` (Next inline scripts / Tailwind) + `'unsafe-eval'` in dev only; if you add a browser call to a new external origin, widen `connect-src`. Session cookie is `httpOnly + sameSite:lax + secure(prod)`.

## Gotchas
- **Dev scheduler is bound at server boot** (`instrumentation.ts` → `setInterval`); HMR does NOT reload it. After editing `checker.ts`/`rules.ts`/`parser.ts`, **restart `npm run dev`** or checks keep running old code.
- **SQLite specifics**: no Postgres casts (`::int`), no composite-PK helpers unused; after schema edits run `db:push`. `data/` and `.env` are gitignored (DB holds password hash + secrets) — never commit them.
- Service names arrive in mixed case across discovery sources; the registry canonicalizes to UPPERCASE — keep that when touching `syncServiceRegistry`.
- When a fetch fails entirely (no services parsed) the registry is NOT flipped to down (avoids false mass-alerts); services render `STALE`.
