import type { EffectiveThresholds } from "./alerts";

export type Severity = "warning" | "critical";

export type AlertKind =
  | "availability"
  | "disk"
  | "latency"
  | "component_down"
  | "eureka"
  | "service_missing";

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

  // Dedup by key (keep first, which for disk is the critical branch).
  const seen = new Set<string>();
  return out.filter((a) => {
    const k = alertKey(a);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
