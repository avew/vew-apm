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
- `notifier.ts` + `notifiers/{webhook,email,telegram}.ts` — channels are **global**: every enabled channel fires for every monitor (no per-monitor linking). `dispatch` wraps each send in `withRetry` (`retry.ts`); senders throw `NotifyError{retryable}` — network/timeout/429/5xx retry with backoff, other 4xx stop. Test-send is single-attempt.
- `maintenance.ts` — `isMonitorMuted`; muted incidents get `suppressed=true`, no notify, uptime unaffected.
- `i18n.ts` (dict) + `i18n-server.ts` (`getT` from `apm_lang` cookie, server components) + `i18n-client.tsx` (`LangProvider`/`useT`, client). Missing keys fall back to English.

## Conventions
- Design tokens + `.card`/`.btn-*`/`.badge`/`.field-input` in `app/globals.css`; use CSS vars (`var(--foreground)` etc.), not hardcoded colors. Theme is light/dark/auto via `data-theme`.
- Secrets (Telegram bot token, Resend API key) live in `notification_channels.config` (jsonb), not env.
- API routes validate with `zod` and gate with `requireUser()` (except `/api/cron/*`).

## Gotchas
- **Dev scheduler is bound at server boot** (`instrumentation.ts` → `setInterval`); HMR does NOT reload it. After editing `checker.ts`/`rules.ts`/`parser.ts`, **restart `npm run dev`** or checks keep running old code.
- **SQLite specifics**: no Postgres casts (`::int`), no composite-PK helpers unused; after schema edits run `db:push`. `data/` and `.env` are gitignored (DB holds password hash + secrets) — never commit them.
- Service names arrive in mixed case across discovery sources; the registry canonicalizes to UPPERCASE — keep that when touching `syncServiceRegistry`.
- When a fetch fails entirely (no services parsed) the registry is NOT flipped to down (avoids false mass-alerts); services render `STALE`.
