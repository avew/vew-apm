# Ops-Notification Track — Tracking

Live status for the ops-notification roadmap. Plan detail lives in
[docs/roadmap-ops-notification.md](docs/roadmap-ops-notification.md).

**Legend:** ✅ done · 🚧 in progress · ⬜ not started · ⏸️ blocked

_Last updated: 2026-07-16 · branch `feat/notify-native-channels`_

## Phase status

| Phase | Title | Effort | Depends on | Status |
|-------|-------|--------|-----------|--------|
| P1 | Native channels (Slack / Discord / Teams) | S | — | ✅ |
| P2 | Notification routing (monitor / group / severity) | L | — | ⬜ |
| P3 | Acknowledge & snooze (inbound) | M | P1 | ⬜ |
| P4 | Escalation policies (multi-step) | M–L | P2, P3 | ⬜ |
| P5 | On-call schedules + responders | L | P4 | ⬜ |
| P6 | Alert dependencies & dedup | M | — | ⬜ |
| P7 | PagerDuty / Opsgenie | S–M | P1 pattern | ⬜ |

## P1 — Native channels ✅

Shared: `severityColor()` in `lib/notifier.ts`; all three use a secret `webhookUrl`
(added to `SECRET_KEYS`, never shipped to the client); form state shared across the
three kinds. 175 tests green · typecheck + build clean.

### Slack ✅
- [x] `sendSlack` sender with severity-colored attachment — `lib/notifiers/slack.ts`
- [x] Unit tests — `lib/notifiers/slack.test.ts`
- [x] Dispatch + test-send branches — `lib/notifier.ts`
- [x] API validation + test-endpoint enum
- [x] Secret-free preview + form fields (URL, display name, icon emoji)

### Discord ✅
- [x] `sendDiscord` sender (embed, hex→int color) — `lib/notifiers/discord.ts`
- [x] Unit tests — `lib/notifiers/discord.test.ts`
- [x] Dispatch + test-send branches + API validation + test enum
- [x] Preview + form fields (URL, display name)

### Microsoft Teams ✅
- [x] `sendTeams` sender (MessageCard, themeColor) — `lib/notifiers/teams.ts`
- [x] Unit tests — `lib/notifiers/teams.test.ts`
- [x] Dispatch + test-send branches + API validation + test enum
- [x] Preview + form fields (URL)

### Wrap-up
- [x] Documented in `FEATURES.md`
- [ ] Manual smoke test against real webhooks (needs live URLs — deferred to reviewer)
- [ ] PR + review (opened at end of track)

> **Note (Teams):** uses the classic connector **MessageCard** format. O365
> connectors are being retired in favor of Power Automate Workflows (Adaptive
> Cards) — revisit if targeting new-style Workflow webhooks.

## P2 — Notification routing ⬜
- [ ] Schema: `channel_routes` (`channelId`, `scope`, `targetId`, `minSeverity`, `alertKinds[]`) + `db:push`
- [ ] `dispatch()` filters channels by event (monitor / group / severity / kind)
- [ ] Default `all` route preserves current behavior on upgrade
- [ ] Routes CRUD: `/api/notifications/[id]/routes`
- [ ] Form UI for routing
- [ ] Tests (routing match logic — keep pure)

## P3 — Acknowledge & snooze ⬜
- [ ] Schema: `incidents.ackedAt` / `ackedBy` / `snoozedUntil` + `db:push`
- [ ] Signed tokenless route `/api/incidents/[id]/ack` (HMAC via `lib/webhook-auth.ts`)
- [ ] Telegram inline callback + Slack interaction endpoint
- [ ] Ack links in notification payloads
- [ ] `reconcileIncidents` halts renotify once acked
- [ ] Tests

## P4 — Escalation policies ⬜
- [ ] Schema: `escalation_policies` + steps; `incidents.escalationStep` + `db:push`
- [ ] `reconcileIncidents` advances step when unacked past `delayMinutes`
- [ ] Ack (P3) stops the chain
- [ ] Tests

## P5 — On-call schedules ⬜
- [ ] Schema: `responders` + `oncall_schedules` (rrule) + `db:push`
- [ ] Resolve "who's on call now" (reuse maintenance next-occurrence)
- [ ] Escalation step targets a schedule
- [ ] Tests

## P6 — Alert dependencies & dedup ⬜
- [ ] Schema: `monitors.dependsOn` (self-reference) + `db:push`
- [ ] Suppress child incident while parent is down
- [ ] Cross-monitor alert grouping
- [ ] Tests

## P7 — PagerDuty / Opsgenie ⬜
- [ ] Sender mapping events → Events API v2
- [ ] trigger / acknowledge / resolve mapped to incident lifecycle
- [ ] API validation + test enum + form
- [ ] Tests
