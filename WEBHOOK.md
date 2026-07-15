# Webhook payload

Vew APM posts a JSON body to every **enabled webhook channel** (Settings →
Notifications) whenever an incident is opened, re-notified, escalated, or
resolved. Notifications are global — one enabled channel fires for every
monitor.

- **Method**: `POST`
- **Header**: `content-type: application/json` (plus any request auth you
  configured on the channel: None / Basic / Header / Bearer)
- **Body**: a single JSON object (schema below)
- **Delivery**: retried with backoff on network errors / `429` / `5xx`;
  a permanent `4xx` stops immediately.

---

## Schema

Every alert (`down` / `resolved`) carries the same 12 fields:

```jsonc
{
  "kind":          "down" | "resolved",     // lifecycle event, NOT the alert type
  "alertKind":     "availability" | "disk" | "latency" | "component_down"
                   | "eureka" | "service_missing" | "cert_expiry",
  "severity":      "critical" | "warning",  // distinguishes the two tiers
  "reason":        "string | null",         // human-readable detail
  "metricValue":   0,                        // measured value (see table); may be null
  "threshold":     0,                        // threshold crossed (see table); may be null
  "monitor": {
    "id":          0,
    "name":        "string",
    "url":         "string"
  },
  "componentPath": "string | null",          // component / disk path; null = overall
  "repeat":        false,                     // true = renotification of a still-open incident
  "escalated":     false,                     // true = severity just rose (warning → critical)
  "startedAt":     "2026-07-15T08:03:00.000Z",// ISO-8601 UTC, incident open time
  "endedAt":       null                       // ISO-8601 UTC on resolved, else null
}
```

### Field reference

| Field | Type | Notes |
|---|---|---|
| `kind` | string | `down` (open / renotify / escalate) or `resolved`. See also the [test payload](#test-payload). |
| `alertKind` | string | What tripped the alert — one of the seven values above. |
| `severity` | string | `critical` (red) or `warning` (amber). |
| `reason` | string \| null | Pre-formatted detail, e.g. `disk 90.1% ≥ 85%`. Can be null on `resolved`. |
| `metricValue` | number \| null | The measured number. Null for `component_down` and `service_missing`. |
| `threshold` | number \| null | The limit that was crossed. Null for `component_down` and `service_missing`. |
| `monitor.id` | number | Monitor id. |
| `monitor.name` | string | Monitor display name. |
| `monitor.url` | string | The monitored endpoint. |
| `componentPath` | string \| null | Scope. Null for `availability`, `latency`, `cert_expiry`, and overall down. |
| `repeat` | boolean | `true` when this is a reminder for an incident that is still open (critical only). |
| `escalated` | boolean | `true` when the incident just went warning → critical. |
| `startedAt` | string | ISO-8601 UTC — when the incident opened. |
| `endedAt` | string \| null | ISO-8601 UTC on `resolved`; `null` while open. |

> **Time zone**: all timestamps are UTC (`Z` suffix). Convert to WIB by adding
> 7 hours (WIB = UTC+7, no DST).

---

## Alert kinds

Field values depend on `alertKind`:

| `alertKind` | `severity` | `componentPath` | `metricValue` | `threshold` | `reason` example |
|---|---|---|---|---|---|
| `availability` | critical | `null` | minutes down | `downForMinutes` | `down 5m (≥ 3m)` |
| `disk` | critical / warning | disk path (`diskSpace`) | used % (float) | crit / warn % | `disk 90.1% ≥ 85%` |
| `latency` | warning | `null` | p95 ms | `latencyWarnMs` | `p95 5066ms ≥ 2000ms` |
| `component_down` | critical / warning | component (`redis`) | `null` | `null` | `redis is DOWN` |
| `eureka` | warning | `eureka:<SERVICE>` | `0` | `1` | `IMPORT-SVC has 0 instances` |
| `service_missing` | warning | `service:<NAME>` | `null` | `null` | `IMPORT-SVC is down — was registered but missing from the health check` |
| `cert_expiry` | critical / warning | `null` | days left (may be **negative** if expired) | crit / warn days | `TLS certificate expires in 5d (≤ 14d)` |

`component_down` is `critical` when the Spring component is `DOWN`, `warning`
for any other non-UP state (e.g. `OUT_OF_SERVICE`). Global default thresholds:
disk warn `60%` / crit `85%`, down-for `3m`, latency `2000ms`, cert warn `14d` /
crit `3d`, renotify `30m` — all overridable per monitor.

---

## Examples

### Critical — service down

```json
{
  "kind": "down",
  "alertKind": "availability",
  "severity": "critical",
  "reason": "down 5m (≥ 3m)",
  "metricValue": 5,
  "threshold": 3,
  "monitor": { "id": 12, "name": "billing-svc", "url": "https://billing.internal/actuator/health" },
  "componentPath": null,
  "repeat": false,
  "escalated": false,
  "startedAt": "2026-07-15T08:03:00.000Z",
  "endedAt": null
}
```

### Warning — disk usage

```json
{
  "kind": "down",
  "alertKind": "disk",
  "severity": "warning",
  "reason": "disk 72.3% ≥ 60%",
  "metricValue": 72.3,
  "threshold": 60,
  "monitor": { "id": 12, "name": "billing-svc", "url": "https://billing.internal/actuator/health" },
  "componentPath": "diskSpace",
  "repeat": false,
  "escalated": false,
  "startedAt": "2026-07-15T08:15:00.000Z",
  "endedAt": null
}
```

### Renotification — still-open critical

`repeat: true` marks a reminder (fires every `renotifyMinutes`); `severity`
stays `critical`.

```json
{
  "kind": "down",
  "alertKind": "availability",
  "severity": "critical",
  "reason": "down 33m (≥ 3m)",
  "metricValue": 33,
  "threshold": 3,
  "monitor": { "id": 12, "name": "billing-svc", "url": "https://billing.internal/actuator/health" },
  "componentPath": null,
  "repeat": true,
  "escalated": false,
  "startedAt": "2026-07-15T08:03:00.000Z",
  "endedAt": null
}
```

### Escalation — warning rose to critical

`escalated: true` fires immediately, regardless of the renotify cadence.

```json
{
  "kind": "down",
  "alertKind": "disk",
  "severity": "critical",
  "reason": "disk 90.1% ≥ 85%",
  "metricValue": 90.1,
  "threshold": 85,
  "monitor": { "id": 12, "name": "billing-svc", "url": "https://billing.internal/actuator/health" },
  "componentPath": "diskSpace",
  "repeat": false,
  "escalated": true,
  "startedAt": "2026-07-15T08:15:00.000Z",
  "endedAt": null
}
```

### Resolved

`endedAt` is set; `metricValue` / `reason` reflect the last observed value.

```json
{
  "kind": "resolved",
  "alertKind": "disk",
  "severity": "warning",
  "reason": "disk 72.3% ≥ 60%",
  "metricValue": 72.3,
  "threshold": 60,
  "monitor": { "id": 12, "name": "billing-svc", "url": "https://billing.internal/actuator/health" },
  "componentPath": "diskSpace",
  "repeat": false,
  "escalated": false,
  "startedAt": "2026-07-15T08:15:00.000Z",
  "endedAt": "2026-07-15T08:41:00.000Z"
}
```

### Service missing from the registry

```json
{
  "kind": "down",
  "alertKind": "service_missing",
  "severity": "warning",
  "reason": "IMPORT-SVC is down — was registered but missing from the health check",
  "metricValue": null,
  "threshold": null,
  "monitor": { "id": 2, "name": "PSIAP STAGING", "url": "https://etax.staging.pajakku.com/actuator/health" },
  "componentPath": "service:IMPORT-SVC",
  "repeat": false,
  "escalated": false,
  "startedAt": "2026-07-15T07:26:30.000Z",
  "endedAt": null
}
```

---

## Test payload

The **Test** button (and the pre-save test) sends a *different* shape — no
`monitor`, `severity`, or `alertKind`. Guard for it before reading other fields:

```json
{
  "kind": "test",
  "message": "This is a test message from your Vew APM instance."
}
```

---

## Consuming the payload

Read `severity` (critical / warning) and `kind` (down / resolved) — that is all
most integrations need. Watch out for:

- **`kind: "test"`** — different shape; handle it first.
- **`componentPath: null`** — `availability`, `latency`, `cert_expiry`, overall down.
- **`metricValue` / `threshold: null`** — `component_down`, `service_missing`.
- **`reason: null`** — possible on `resolved`.
- **`endedAt: null`** — everything except `resolved`.

### Example — n8n Code node → Discord embed

Maps every variant (including the test payload) to a colour-coded Discord embed.
Set the Discord node body to `{{ $json }}`.

```js
const src = $input.first().json;
const b = src.body ?? src;              // handles wrapper .body or raw payload

// (A) Test button sends a different shape — handle it first
if (b.kind === 'test') {
  return [{ json: { embeds: [{
    title: '🧪 Test — Vew APM',
    description: b.message ?? 'Test notification',
    color: 0x5865F2,
  }] } }];
}

const resolved = b.kind === 'resolved';
const mon = b.monitor ?? { name: 'unknown', url: '' };

let color, label, emoji;
if (resolved)                       { color = 0x57F287; label = 'RESOLVED'; emoji = '✅'; }
else if (b.severity === 'critical') { color = 0xED4245; label = 'CRITICAL'; emoji = '🔴'; }
else if (b.severity === 'warning')  { color = 0xFEE75C; label = 'WARNING';  emoji = '⚠️'; }
else                                { color = 0x95A5A6; label = 'ALERT';    emoji = '🚨'; }

let tag = '';
if (!resolved && b.escalated)   tag = ' ⏫ ESCALATED';
else if (!resolved && b.repeat) tag = ' 🔁 STILL OPEN';

const scope = b.componentPath || 'overall';
// WIB = UTC+7 (no DST)
const fmt = (t) => t
  ? new Date(new Date(t).getTime() + 7 * 3600_000).toISOString().replace('T', ' ').split('.')[0] + ' WIB'
  : '-';

const fields = [
  { name: 'Type',     value: b.alertKind ?? '-', inline: true },
  { name: 'Severity', value: b.severity ?? '-',  inline: true },
  { name: 'Scope',    value: scope,              inline: true },
];
if (b.reason) fields.push({ name: 'Detail', value: String(b.reason) });
if (b.metricValue != null && b.threshold != null)
  fields.push({ name: 'Value', value: `${b.metricValue} (threshold ${b.threshold})`, inline: true });
fields.push({ name: 'Started', value: fmt(b.startedAt), inline: true });
if (resolved) fields.push({ name: 'Ended', value: fmt(b.endedAt), inline: true });

return [{ json: {
  embeds: [{
    title: `${emoji} ${label}${tag} — ${mon.name}`,
    url: mon.url || undefined,
    color,
    fields,
    footer: { text: 'Vew APM' },
    timestamp: (resolved ? b.endedAt : b.startedAt) || undefined,
  }],
} }];
```
