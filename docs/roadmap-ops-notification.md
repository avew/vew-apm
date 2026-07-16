# Vew APM — Ops-Notification Roadmap

Phased plan to grow notifications from *global fire-everything* into routed,
acknowledgeable, escalating on-call. For what exists today see
[FEATURES.md](../FEATURES.md); for architecture see [AGENTS.md](../AGENTS.md).

---

## Where we are today

- **Channels are global** — `dispatch()` loads every enabled channel and fires it
  for every monitor. No per-monitor / per-group routing (`lib/notifier.ts`).
- **Surfaces**: webhook, email, Telegram only (`lib/notifiers/{webhook,email,telegram}.ts`).
- **Already built** (reuse, don't rebuild):
  - Renotify of still-open **critical** incidents + immediate warning→critical
    escalation, tracked via `incidents.lastNotifiedAt` / `notifyCount`
    (`reconcileIncidents`).
  - Retry with backoff — senders throw `NotifyError{retryable}`, `withRetry`
    stops on permanent 4xx (`lib/retry.ts`).
  - Test-before-save (`sendTestConfig`), secrets encrypted at rest (`lib/crypto.ts`).
  - Maintenance windows already **suppress** incidents (pattern to reuse for P6),
    and drive schedules via `rrule` (pattern to reuse for P5).

## Decide first: build native vs. integrate

Everything from **P4** onward depends on this call — make it before P2.

- **Already on PagerDuty / Opsgenie** → skip native on-call (P4–P5); ship **P7**
  early as a channel that posts to their Events API. Escalation + rotation come
  free from them.
- **Fully self-hosted, no vendor** → build escalation and on-call in-house
  (P4, P5); P7 becomes optional. *This roadmap assumes this path.*

## Sequence (dependencies)

```
P1 native channels  ──►  no schema churn, ship first
      │
P2 routing          ──►  team foundation
      │
P3 ack / snooze  ◄───────  parallel to P2; kills the noise
      │
P4 escalation policies
      │
P5 on-call schedules ──►  track complete
P6 alert deps / dedup ─►  independent; slot in anytime
P7 PagerDuty/Opsgenie ─►  early if adopted, else skip
```

---

## P1 — Native channels (Slack / Discord / Teams)

**Effort: S (~½ day per channel) · Depends on: — · Quick win**

An incoming webhook is a webhook with a service-specific JSON shape, not new
machinery. Each surface is one sender file plus a form.

- **Schema**: none — `notification_channels.kind` is already `text`. Widen the
  zod enum + the picker UI.
- **Code**: add `lib/notifiers/{slack,discord,teams}.ts`; new branches in
  `dispatch()` and `sendTestConfig()` (`lib/notifier.ts`); a form under
  `app/(dashboard)/settings/notifications`.

## P2 — Notification routing (per-monitor / group / severity)

**Effort: L · Depends on: — · Foundation for P3–P5**

Today delivery loads every enabled channel. Routing lets one team hear only
their services and keeps low-severity noise off the pager. A default `all` route
preserves today's behavior, so upgrades don't break.

- **Schema**: new `channel_routes` — `channelId`, `scope (all|group|monitor)`,
  `targetId`, `minSeverity`, `alertKinds[]`.
- **Code**: in `dispatch()`, match routes to the event's monitor / group /
  severity / alertKind instead of loading all channels; routes CRUD under each
  channel (`/api/notifications/[id]/routes`).

## P3 — Acknowledge & snooze (inbound)

**Effort: M · Depends on: P1 · Quick win**

Silence an alert from Slack, Telegram, or an email link. An acknowledged
incident stops renotifying — removes the biggest source of alert fatigue on its
own.

- **Schema**: add `ackedAt`, `ackedBy`, `snoozedUntil` to `incidents`.
- **Code**: signed tokenless route `/api/incidents/[id]/ack?token=…` (HMAC,
  reuse `lib/webhook-auth.ts`, pattern like `/api/cron`); Telegram inline
  callbacks + Slack interaction endpoint; ack links in payloads;
  `reconcileIncidents` halts renotify once acked.

## P4 — Escalation policies (multi-step)

**Effort: M–L · Depends on: P2, P3 · Reuses the reconcile timer**

Notify tier 1; if unacked, move to tier 2. Half of this exists —
`reconcileIncidents` already re-notifies on a timer and escalates
warning→critical. Extend it to walk ordered steps; the scheduler tick is the
timer, so no new infrastructure.

- **Schema**: `escalation_policies` with ordered steps `{order, delayMinutes,
  target}`; `escalationStep` on `incidents`.
- **Code**: in reconciliation, advance to the next step when unacked past
  `delayMinutes`; ack (P3) stops the chain.

## P5 — On-call schedules + responders

**Effort: L · Depends on: P4 · Reuses rrule from maintenance**

Rotation of who's paged, when — the top of the track.

- **Schema**: `responders` (name + contact: Telegram id / email — lightweight,
  no full multi-user auth) and `oncall_schedules` (`rrule`-based rotation).
- **Code**: resolve "who's on call now"; an escalation step targets a schedule
  rather than a fixed channel. Next-occurrence logic mirrors `lib/maintenance.ts`.

## P6 — Alert dependencies & dedup

**Effort: M · Depends on: — · Slot in anytime**

Gateway down → don't page for every service behind it.

- **Schema**: `monitors.dependsOn` (self-reference).
- **Code**: `reconcileIncidents` suppresses a child incident while its parent is
  down (mirrors the existing maintenance `suppressed` path); group alerts across
  monitors into one page.

## P7 — PagerDuty / Opsgenie (optional)

**Effort: S–M · Depends on: P1 pattern**

A channel kind that posts to the Events API v2 — another specialized webhook.
Adopt early and you can defer P4–P5 entirely (see the fork above).

- **Schema**: none beyond a channel config entry.
- **Code**: a sender mapping events to Events API v2 payloads; trigger /
  acknowledge / resolve mapped to the incident lifecycle.

---

## Recommendation

Ship the two cheapest pain-killers first: **P1 + P3** (Week 1). More channels
people already use, plus the ability to stop a known alert from re-paging —
both small, both immediate, neither blocked on the routing rework.

Then:

- **P2 (routing)** — the foundation that makes team adoption possible.
- **P4 → P5** complete the native on-call story (self-hosted path only).
- **P6** is independent — schedule it when alert-storm noise becomes the top
  complaint.
