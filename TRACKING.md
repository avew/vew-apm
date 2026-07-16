# Ops-Notification Track — Tracking

Live status for the ops-notification roadmap. Plan detail lives in
[docs/roadmap-ops-notification.md](docs/roadmap-ops-notification.md).

**Legend:** ✅ done · 🚧 in progress · ⬜ not started · ⏸️ blocked

_Last updated: 2026-07-16 · branch `feat/notify-native-channels`_

## Phase status

| Phase | Title | Effort | Depends on | Status |
|-------|-------|--------|-----------|--------|
| P1 | Native channels (Slack / Discord / Teams) | S | — | ✅ |
| P2 | Notification routing (monitor / group / severity) | L | — | ✅ |
| P3 | Acknowledge & snooze (inbound) | M | P1 | ✅ |
| P4 | Escalation policies (multi-step) | M–L | P2, P3 | ✅ |
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

## P2 — Notification routing ✅
- [x] Schema: `channel_routes` (`channelId`, `scope`, `targetId`, `minSeverity`, `alertKinds[]`); migration `drizzle/0012_cynical_killmonger.sql`
- [x] Pure matcher `channelShouldFire()` — `lib/routing.ts` (+ 9 tests)
- [x] `dispatch()` filters channels by event (monitor / group / severity / kind) — `lib/notifier.ts`
- [x] No-routes channel fires for everything (back-compat; verified by checker.test)
- [x] Routes CRUD: `/api/notifications/[id]/routes` (+ `/[routeId]` DELETE)
- [x] Form UI: per-row routing editor — `routes-editor.tsx`, wired in `channels-client.tsx` + `page.tsx`
- [x] `db:generate` migration committed (dev DB used `db:push` equivalent)

## P3 — Acknowledge & snooze ✅
- [x] Schema: `incidents.ackedAt` / `ackedBy` / `snoozedUntil`; migration `drizzle/0013_overrated_justice.sql`
- [x] HMAC sign/verify in `lib/crypto.ts` (`signToken`/`verifyToken`, reuses instance key)
- [x] Signed link helpers — `lib/ack.ts` (`ackToken`/`verifyAckToken`/`ackUrl`) + tests
- [x] Public route `/api/ack/[id]` — GET confirm page + POST apply (guards against email link-scanner auto-ack); added to `middleware.ts` public paths
- [x] Ack link in message body + `ackUrl` in webhook payload — `lib/notifier.ts`
- [x] `reconcileIncidents` halts renotify when acked/snoozed; escalation clears the ack — `lib/checker.ts`
- [x] Tests: ack helpers + 3 reconcile integration cases (ack silent, snooze silent, escalation clears ack)

> **Decision:** ack is delivered as a **signed link** (works in every channel with
> no per-platform setup). Native Slack buttons / Telegram inline callbacks need a
> Slack app + public signed request handling — deferred as a follow-up.
> **UI:** an "Acknowledged" badge in the incidents view is a nice-to-have, not done.

## P4 — Escalation policies ✅
- [x] Schema: `escalation_policies` (+ `active`), `escalation_steps`, `incidents.escalationStep`; migration `drizzle/0014_productive_texas_twister.sql`
- [x] Pure engine `dueEscalationSteps()` — `lib/escalation.ts` (+ 7 tests)
- [x] `dispatchToChannel()` targeted delivery (bypasses routing) — refactored `lib/notifier.ts` (`buildMessage`/`deliver`)
- [x] `reconcileIncidents` fires due steps for open, unacked, unsuppressed **critical** incidents — `lib/checker.ts`
- [x] Ack / snooze pause escalation; escalation counts from incident open time
- [x] CRUD API: `/api/escalation-policies` (+ `/[id]`, `/[id]/steps`, `/[id]/steps/[stepId]`)
- [x] Settings UI: `Settings › Escalation` (create policy, set active, add/remove timed steps)
- [x] Tests: engine (7) + reconcile integration (fires step, no double-fire)

> **Scope decision:** escalation policy is **global** (one `active` at a time), gated
> to **critical** incidents. Per-monitor policy + warning-level escalation are future
> refinements (the alerts.ts override pattern supports adding `monitors.escalationPolicyId` later).

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
