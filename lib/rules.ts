import type { EffectiveThresholds } from "./alerts";

export type Severity = "warning" | "critical";

export type AlertKind =
  | "availability"
  | "disk"
  | "latency"
  | "component_down"
  | "eureka"
  | "service_missing"
  | "cert_expiry"
  | "metric";

export type MetricOp = "gt" | "gte" | "lt" | "lte";

/**
 * How a metric rule reads its series before comparing to the threshold:
 * `instant` = current value; `sustained` = breached across the whole window;
 * `delta` = change over the window; `rate` = per-second change over the window.
 * Trend math lives in `metric-trend.ts`; this type is shared so the rule engine
 * can label the reason correctly.
 */
export type TrendMode = "instant" | "sustained" | "delta" | "rate";

/**
 * A metric reading fed to the rule engine + its per-rule warn/crit thresholds.
 * For trend rules the checker sets `value` to the already-derived scalar and
 * passes `mode`/`windowSeconds` for the reason string only.
 */
export interface MetricInput {
  key: string; // dedup + incident scope (the rule's friendly label)
  label: string;
  value: number;
  operator: MetricOp;
  warnValue: number | null;
  critValue: number | null;
  mode?: TrendMode; // defaults to "instant"
  windowSeconds?: number | null;
}

/** "5m", "90s", "2h" — compact window label for reason strings. */
function fmtWindow(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "";
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

/** Human reason for a breached metric rule, worded for its trend mode. */
function metricReason(m: MetricInput, threshold: number): string {
  const sym = OP_SYMBOL[m.operator];
  const win = fmtWindow(m.windowSeconds);
  switch (m.mode) {
    case "sustained":
      return `${m.label} ${sym} ${threshold} sustained ${win}`;
    case "delta":
      return `${m.label} changed ${m.value} over ${win} (${sym} ${threshold})`;
    case "rate":
      return `${m.label} rate ${m.value}/s ${sym} ${threshold} over ${win}`;
    default:
      return `${m.label} = ${m.value} ${sym} ${threshold}`;
  }
}

const OP_SYMBOL: Record<MetricOp, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤" };

/** Whether `value` breaches `threshold` under `op`. */
export function breaches(value: number, op: MetricOp, threshold: number): boolean {
  switch (op) {
    case "gt":
      return value > threshold;
    case "gte":
      return value >= threshold;
    case "lt":
      return value < threshold;
    case "lte":
      return value <= threshold;
  }
}

export interface DesiredAlert {
  kind: AlertKind;
  componentPath: string | null;
  severity: Severity;
  metricValue: number | null;
  threshold: number | null;
  reason: string;
}

export interface RuleContext {
  now: Date;
  thresholds: EffectiveThresholds;
  /** Recent checks, newest first. */
  recentChecks: {
    checkedAt: Date;
    overallStatus: string;
    responseMs: number | null;
  }[];
  /** Components that have been non-UP for >= componentGrace (computed upstream). */
  badComponents: { path: string; status: string }[];
  /** Current-check disk snapshots. */
  disks: { path: string; usedPct: number }[];
  /** Current-check eureka services. */
  eurekaServices: { serviceName: string; instanceCount: number }[];
  /** Services seen recently (within grace) but absent from the latest check. */
  eurekaMissing: string[];
  /** Days until the TLS cert expires (null = not an https monitor / unknown). */
  certDaysLeft: number | null;
  /** Current-check Prometheus metric readings (empty/absent for non-prometheus). */
  metrics?: MetricInput[];
}

export function alertKey(a: {
  kind: AlertKind;
  componentPath: string | null;
}): string {
  return `${a.kind}::${a.componentPath ?? ""}`;
}

/** Nearest-rank percentile (p in 0..100). Returns 0 for an empty set. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

export function evaluateRules(ctx: RuleContext): DesiredAlert[] {
  const out: DesiredAlert[] = [];
  const t = ctx.thresholds;

  // 1. Availability — overall DOWN sustained for >= downForMinutes.
  const run: Date[] = [];
  for (const c of ctx.recentChecks) {
    if (c.overallStatus === "DOWN") run.push(c.checkedAt);
    else break;
  }
  if (run.length > 0) {
    const oldestDown = run[run.length - 1];
    const downMs = ctx.now.getTime() - oldestDown.getTime();
    if (downMs >= t.downForMinutes * 60_000) {
      const mins = Math.max(1, Math.round(downMs / 60_000));
      out.push({
        kind: "availability",
        componentPath: null,
        severity: "critical",
        metricValue: mins,
        threshold: t.downForMinutes,
        reason: `down ${mins}m (≥ ${t.downForMinutes}m)`,
      });
    }
  }

  // 2. Disk usage % (critical > warning, one alert per disk path).
  for (const d of ctx.disks) {
    if (d.usedPct >= t.diskCritPct) {
      out.push({
        kind: "disk",
        componentPath: d.path,
        severity: "critical",
        metricValue: d.usedPct,
        threshold: t.diskCritPct,
        reason: `disk ${d.usedPct.toFixed(1)}% ≥ ${t.diskCritPct}%`,
      });
    } else if (d.usedPct >= t.diskWarnPct) {
      out.push({
        kind: "disk",
        componentPath: d.path,
        severity: "warning",
        metricValue: d.usedPct,
        threshold: t.diskWarnPct,
        reason: `disk ${d.usedPct.toFixed(1)}% ≥ ${t.diskWarnPct}%`,
      });
    }
  }

  // 3. Latency — p95 over last `latencyWindow` checks. p95 (not avg) so a burst
  //    of slow responses trips the alert instead of being averaged away.
  const samples = ctx.recentChecks
    .slice(0, Math.max(1, t.latencyWindow))
    .map((c) => c.responseMs)
    .filter((v): v is number => typeof v === "number");
  if (samples.length >= 1) {
    const p95 = percentile(samples, 95);
    if (p95 >= t.latencyWarnMs) {
      out.push({
        kind: "latency",
        componentPath: null,
        severity: "warning",
        metricValue: p95,
        threshold: t.latencyWarnMs,
        reason: `p95 ${Math.round(p95)}ms ≥ ${t.latencyWarnMs}ms`,
      });
    }
  }

  // 4. Component non-UP (Spring's own health flip), grace-filtered upstream.
  //    DOWN → critical; OUT_OF_SERVICE (or other non-UP) → warning.
  for (const c of ctx.badComponents) {
    out.push({
      kind: "component_down",
      componentPath: c.path,
      severity: c.status === "DOWN" ? "critical" : "warning",
      metricValue: null,
      threshold: null,
      reason: `${c.path} is ${c.status}`,
    });
  }

  // 5. Eureka instance drop to zero.
  if (t.eurekaDropAlert) {
    for (const s of ctx.eurekaServices) {
      if (s.instanceCount === 0) {
        out.push({
          kind: "eureka",
          componentPath: `eureka:${s.serviceName}`,
          severity: "warning",
          metricValue: 0,
          threshold: 1,
          reason: `${s.serviceName} has 0 instances`,
        });
      }
    }
    // 6. Service disappeared from the registry (was seen recently, now gone).
    for (const name of ctx.eurekaMissing) {
      out.push({
        kind: "service_missing",
        componentPath: `service:${name}`,
        severity: "warning",
        metricValue: null,
        threshold: null,
        reason: `${name} is down — was registered but missing from the health check`,
      });
    }
  }

  // 7. TLS certificate expiry.
  if (ctx.certDaysLeft !== null) {
    const days = ctx.certDaysLeft;
    if (days <= t.certCritDays) {
      out.push({
        kind: "cert_expiry",
        componentPath: null,
        severity: "critical",
        metricValue: days,
        threshold: t.certCritDays,
        reason:
          days < 0
            ? `TLS certificate expired ${Math.abs(Math.round(days))}d ago`
            : `TLS certificate expires in ${Math.round(days)}d (≤ ${t.certCritDays}d)`,
      });
    } else if (days <= t.certWarnDays) {
      out.push({
        kind: "cert_expiry",
        componentPath: null,
        severity: "warning",
        metricValue: days,
        threshold: t.certWarnDays,
        reason: `TLS certificate expires in ${Math.round(days)}d (≤ ${t.certWarnDays}d)`,
      });
    }
  }

  // 8. Prometheus metric thresholds (per-rule; crit before warn, one per rule).
  for (const m of ctx.metrics ?? []) {
    if (m.critValue !== null && breaches(m.value, m.operator, m.critValue)) {
      out.push({
        kind: "metric",
        componentPath: m.key,
        severity: "critical",
        metricValue: m.value,
        threshold: m.critValue,
        reason: metricReason(m, m.critValue),
      });
    } else if (m.warnValue !== null && breaches(m.value, m.operator, m.warnValue)) {
      out.push({
        kind: "metric",
        componentPath: m.key,
        severity: "warning",
        metricValue: m.value,
        threshold: m.warnValue,
        reason: metricReason(m, m.warnValue),
      });
    }
  }

  // Dedup by key (keep first, which for disk is the critical branch).
  const seen = new Set<string>();
  return out.filter((a) => {
    const k = alertKey(a);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
