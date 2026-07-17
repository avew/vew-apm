# Vew APM — Ops-Notification Roadmap

Phased plan to grow notifications from *global fire-everything* into routed,
acknowledgeable, escalating on-call. For what exists today see
[FEATURES.md](../FEATURES.md); for architecture see [AGENTS.md](../AGENTS.md).

> **Status: ✅ COMPLETE — all phases shipped.** This roadmap has been fully
> implemented; the sections below are kept as a design record. Each phase is
> tagged with its status and the commit that landed it.
>
> | Phase | Status | Landed in |
> |-------|--------|-----------|
> | P1 — Native channels (Slack/Discord/Teams) | ✅ Shipped | `cfdf6f0` |
> | P2 — Notification routing | ✅ Shipped | `ba14ba4` |
> | P3 — Acknowledge & snooze | ✅ Shipped | `a980836` |
> | P4 — Escalation policies | ✅ Shipped | `77e2dab` |
> | P5 — On-call schedules + responders | ✅ Shipped | `9dae9e1` |
> | P6 — Alert dependencies & dedup | ✅ Shipped | `b84a895` |
> | P7 — PagerDuty / Opsgenie | ✅ Shipped | `0db3499` |
>
> The self-hosted path was taken: native escalation and on-call (P4–P5) were
> built, and P7 shipped as an optional incident channel.

---

## Where we started

*(Historical — the state before this track began. All bullets below are now
superseded by the shipped phases.)*

- **Channels were global** — `dispatch()` loaded every enabled channel and fired
  it for every monitor. No per-monitor / per-group routing. *(Now routed — P2.)*
- **Surfaces**: webhook, email, Telegram only. *(Now also Slack, Discord, Teams,
  PagerDuty, Opsgenie — P1, P7.)*
- **Already built at the time** (reused, not rebuilt):
  - Renotify of still-open **critical** incidents + immediate warning→critical
    escalation, tracked via `incidents.lastNotifiedAt` / `notifyCount`
    (`reconcileIncidents`).
  - Retry with backoff — senders throw `NotifyError{retryable}`, `withRetry`
    stops on permanent 4xx (`lib/retry.ts`).
  - Test-before-save (`sendTestConfig`), secrets encrypted at rest (`lib/crypto.ts`).
  - Maintenance windows already **suppress** incidents (reused for P6), and
    drive schedules via `rrule` (reused for P5).

## Decision (resolved): build native vs. integrate

Everything from **P4** onward depended on this call.

- **Already on PagerDuty / Opsgenie** → skip native on-call (P4–P5); ship **P7**
  early as a channel that posts to their Events API. Escalation + rotation come
  free from them.
- **Fully self-hosted, no vendor** → build escalation and on-call in-house
  (P4, P5); P7 becomes optional. **← chosen path.** P4 and P5 were built
  natively, and P7 shipped anyway as an optional incident channel.

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

## P1 — Native channels (Slack / Discord / Teams) ✅ Shipped (`cfdf6f0`)

**Effort: S (~½ day per channel) · Depends on: — · Quick win**

> Delivered: `lib/notifiers/{slack,discord,teams}.ts` (+ unit tests each), zod
> enum + picker widened, forms under `settings/notifications`, and `dispatch()`
> / `sendTestConfig()` branches (`lib/notifier.ts`).

An incoming webhook is a webhook with a service-specific JSON shape, not new
machinery. Each surface is one sender file plus a form.

- **Schema**: none — `notification_channels.kind` is already `text`. Widen the
  zod enum + the picker UI.
- **Code**: add `lib/notifiers/{slack,discord,teams}.ts`; new branches in
  `dispatch()` and `sendTestConfig()` (`lib/notifier.ts`); a form under
  `app/(dashboard)/settings/notifications`.

## P2 — Notification routing (per-monitor / group / severity) ✅ Shipped (`ba14ba4`)

**Effort: L · Depends on: — · Foundation for P3–P5**

> Delivered: `channel_routes` table, `lib/routing.ts` (`channelShouldFire`),
> route matching in `dispatch()`, routes CRUD at
> `/api/notifications/[id]/routes`. Channel with no rules still fires for
> everything (preserves old behavior).

Today delivery loads every enabled channel. Routing lets one team hear only
their services and keeps low-severity noise off the pager. A default `all` route
preserves today's behavior, so upgrades don't break.

- **Schema**: new `channel_routes` — `channelId`, `scope (all|group|monitor)`,
  `targetId`, `minSeverity`, `alertKinds[]`.
- **Code**: in `dispatch()`, match routes to the event's monitor / group /
  severity / alertKind instead of loading all channels; routes CRUD under each
  channel (`/api/notifications/[id]/routes`).

## P3 — Acknowledge & snooze (inbound) ✅ Shipped (`a980836`)

**Effort: M · Depends on: P1 · Quick win**

> Delivered: `incidents.ackedAt` / `ackedBy` / `snoozedUntil` (`lib/db/schema.ts`),
> HMAC ack links (`lib/ack.ts` → `/api/ack/[id]`), Telegram inline callbacks
> (`/api/telegram/webhook`) + Slack interactions (`/api/slack/interactions`),
> ack lines in payloads; `reconcileIncidents` halts renotify once acked.

Silence an alert from Slack, Telegram, or an email link. An acknowledged
incident stops renotifying — removes the biggest source of alert fatigue on its
own.

- **Schema**: add `ackedAt`, `ackedBy`, `snoozedUntil` to `incidents`.
- **Code**: signed tokenless route `/api/incidents/[id]/ack?token=…` (HMAC,
  reuse `lib/webhook-auth.ts`, pattern like `/api/cron`); Telegram inline
  callbacks + Slack interaction endpoint; ack links in payloads;
  `reconcileIncidents` halts renotify once acked.

## P4 — Escalation policies (multi-step) ✅ Shipped (`77e2dab`)

**Effort: M–L · Depends on: P2, P3 · Reuses the reconcile timer**

> Delivered: `escalation_steps` table + `incidents.escalationStep`;
> `reconcileIncidents` advances to the next step when unacked past
> `delayMinutes`; ack (P3) stops the chain. Per-monitor policy override (A1).

Notify tier 1; if unacked, move to tier 2. Half of this exists —
`reconcileIncidents` already re-notifies on a timer and escalates
warning→critical. Extend it to walk ordered steps; the scheduler tick is the
timer, so no new infrastructure.

- **Schema**: `escalation_policies` with ordered steps `{order, delayMinutes,
  target}`; `escalationStep` on `incidents`.
- **Code**: in reconciliation, advance to the next step when unacked past
  `delayMinutes`; ack (P3) stops the chain.

## P5 — On-call schedules + responders ✅ Shipped (`9dae9e1`)

**Effort: L · Depends on: P4 · Reuses rrule from maintenance**

> Delivered: `responders` + `oncall_schedules` (`rrule`-based rotation);
> "who's on call now" resolution; an escalation step can target a schedule
> rather than a fixed channel. Next-occurrence logic mirrors `lib/maintenance.ts`.

Rotation of who's paged, when — the top of the track.

- **Schema**: `responders` (name + contact: Telegram id / email — lightweight,
  no full multi-user auth) and `oncall_schedules` (`rrule`-based rotation).
- **Code**: resolve "who's on call now"; an escalation step targets a schedule
  rather than a fixed channel. Next-occurrence logic mirrors `lib/maintenance.ts`.

## P6 — Alert dependencies & dedup ✅ Shipped (`b84a895`)

**Effort: M · Depends on: — · Slot in anytime**

> Delivered: `monitors.dependsOn` (self-reference); `reconcileIncidents`
> suppresses a child incident while its parent is down (mirrors the maintenance
> `suppressed` path).

Gateway down → don't page for every service behind it.

- **Schema**: `monitors.dependsOn` (self-reference).
- **Code**: `reconcileIncidents` suppresses a child incident while its parent is
  down (mirrors the existing maintenance `suppressed` path); group alerts across
  monitors into one page.

## P7 — PagerDuty / Opsgenie (optional) ✅ Shipped (`0db3499`)

**Effort: S–M · Depends on: P1 pattern**

> Delivered: `lib/notifiers/{pagerduty,opsgenie}.ts` (+ tests) posting to Events
> API v2 / Alert API; trigger/resolve mapped to the incident lifecycle via a
> stable dedup key (`incidentDedupKey`, `lib/notifier.ts`).

A channel kind that posts to the Events API v2 — another specialized webhook.
Adopt early and you can defer P4–P5 entirely (see the fork above).

- **Schema**: none beyond a channel config entry.
- **Code**: a sender mapping events to Events API v2 payloads; trigger /
  acknowledge / resolve mapped to the incident lifecycle.

---

## Recommendation (as executed)

The plan called for shipping the two cheapest pain-killers first — **P1 + P3** —
then routing, then the on-call story. In practice the whole track landed:

- **P1 + P3** — native channels + acknowledge, the immediate wins.
- **P2 (routing)** — the foundation that made team adoption possible.
- **P4 → P5** — completed the native on-call story (self-hosted path).
- **P6** — alert dependencies, suppressing the flood behind an outage.
- **P7** — PagerDuty / Opsgenie shipped as optional incident channels.

All phases are merged to `main`. This document is now a design record; future
notification work should start from the current code (see [AGENTS.md](../AGENTS.md)
`notifier.ts` / `reconcileIncidents` notes) rather than this plan.
