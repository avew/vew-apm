# Ops-Notification Track — Tracking

Status for the ops-notification roadmap. Plan detail lives in
[docs/roadmap-ops-notification.md](docs/roadmap-ops-notification.md).

**Legend:** 🚀 shipped · ✅ done · 🚧 in progress · ⬜ not started · ⏸️ blocked

## 🚀 SHIPPED — all 7 phases + polish (A1–A3)

- **PR [#51](https://github.com/avew/vew-apm/pull/51)** (P1–P7) merged 2026-07-16 (merge commit `1dd5a6f`). CI green.
- **Polish follow-up (A1–A3)** on branch `feat/notify-polish`:
  - **A1** — per-monitor escalation policy override (`monitors.escalationPolicyId`).
  - **A2** — group simultaneous opens on one monitor into a single digest (chat/webhook/email; PD/Opsgenie stay per-incident).
  - **A3** — interactive Slack/Telegram "Acknowledge" buttons (`/api/slack/interactions`, `/api/telegram/webhook`; provider-signature auth; opt-in via `SLACK_SIGNING_SECRET` / `TELEGRAM_WEBHOOK_SECRET`).
- 218 tests green · typecheck + lint + build clean.

**Still deferred (non-blocking):** on-call schedule manual overrides · true cross-service
alert grouping (P6 dependency suppression covers the correlated case) · edit an existing
monitor's parent/policy via the UI (API + clone already support it) · `monitors.dependsOn`
ON-DELETE-SET-NULL correction (migration 0016 quirk — needs a table rebuild).

_Last updated: 2026-07-16 · A1–A3 on `feat/notify-polish`_

## Phase status

| Phase | Title | Effort | Depends on | Status |
|-------|-------|--------|-----------|--------|
| P1 | Native channels (Slack / Discord / Teams) | S | — | 🚀 shipped |
| P2 | Notification routing (monitor / group / severity) | L | — | 🚀 shipped |
| P3 | Acknowledge & snooze (inbound) | M | P1 | 🚀 shipped |
| P4 | Escalation policies (multi-step) | M–L | P2, P3 | 🚀 shipped |
| P5 | On-call schedules + responders | L | P4 | 🚀 shipped |
| P6 | Alert dependencies & dedup | M | — | 🚀 shipped |
| P7 | PagerDuty / Opsgenie | S–M | P1 pattern | 🚀 shipped |

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

## P5 — On-call schedules ✅
- [x] Schema: `responders`, `oncall_schedules`, `oncall_members`; `escalation_steps.channelId` now nullable + `scheduleId`; migration `drizzle/0015_curved_lilandra.sql` (hand-fixed the table-rebuild INSERT to not select the new column from the old table)
- [x] Pure rotation `currentOnCallIndex()` — `lib/oncall.ts` (+ 7 tests, negative-safe)
- [x] Escalation step targets a channel **or** a schedule; `resolveStepChannel()` resolves the on-call responder at fire time — `lib/checker.ts`
- [x] CRUD API: `/api/responders`, `/api/oncall-schedules` (+ `/[id]`, `/members`, `/members/[memberId]`); step POST accepts channelId xor scheduleId
- [x] Settings UI: `Settings › On-call` (responders + schedules + rotation, shows who's on call now); escalation step form gained a channel/schedule target toggle
- [x] Tests: rotation (7) + reconcile integration (escalates via schedule to the on-call responder's channel)

> **Decision:** simple modulo rotation (rotationDays + anchor + ordered members),
> not rrule — round-robin isn't a calendar recurrence. Per-schedule overrides
> (manual "who's on call right now" override, per-shift handoff) are a future refinement.

## P6 — Alert dependencies & dedup ✅
- [x] Schema: `monitors.dependsOn` self-reference (`onDelete: set null`); migration `drizzle/0016_eager_typhoid_mary.sql`
- [x] `isDependencyDown()` — parent has an open availability incident → suppress; wired into `reconcileIncidents` (open path + renotify + escalation gates) — `lib/checker.ts`
- [x] Transitive by construction (a suppressed parent keeps its own incident open, so grandchildren see it down)
- [x] API: `dependsOn` on monitor create + edit (self-dependency rejected on PATCH)
- [x] UI: "Depends on" select on the create-monitor form
- [x] Test: child incidents suppressed + no notify while parent down

> **Deferred:** editing an existing monitor's parent via the UI (API/clone already
> support it); cross-monitor alert **grouping/dedup** into a single digest (the
> suppression half of P6 is the higher-value piece and is done).

## P7 — PagerDuty / Opsgenie ✅
- [x] `sendPagerDuty` (Events API v2) + `sendOpsgenie` (Alert API, US/EU) — `lib/notifiers/{pagerduty,opsgenie}.ts`
- [x] Down → trigger, recovery → resolve, deduped by incident id (`incidentDedupKey`); `resolved` event now carries `incidentId` — `lib/notifier.ts` + `lib/checker.ts`
- [x] Dispatch + `sendTestConfig` (test does a trigger+resolve round-trip so no alert is left open)
- [x] API validation + test enum; `routingKey` marked secret (Opsgenie reuses `apiKey`)
- [x] Preview + form fields (PD routing key; Opsgenie API key + region)
- [x] Tests: 8 sender cases (payload shape, trigger/resolve, retry classification)
