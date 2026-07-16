import type { Severity, AlertKind } from "./rules";

/**
 * Notification routing (P2) — pure matcher. Kept DB-free so it can be unit
 * tested and reused; the dispatcher feeds it rows read from `channel_routes`.
 */

export type RouteScope = "all" | "group" | "monitor";

export interface RouteRule {
  scope: RouteScope;
  /** group name (scope "group") or monitor id as text (scope "monitor"); null for "all". */
  targetId: string | null;
  minSeverity: Severity;
  /** restrict to these alert kinds; null/empty = all kinds. */
  alertKinds: string[] | null;
}

export interface RouteEvent {
  monitorId: number;
  group: string | null;
  severity: Severity;
  alertKind: AlertKind;
}

const SEV_RANK: Record<Severity, number> = { warning: 1, critical: 2 };

function ruleMatches(rule: RouteRule, ev: RouteEvent): boolean {
  if (rule.scope === "group") {
    if (!rule.targetId || rule.targetId !== ev.group) return false;
  } else if (rule.scope === "monitor") {
    if (rule.targetId == null || Number(rule.targetId) !== ev.monitorId) return false;
  }
  // severity floor: a "critical" route ignores warning-level events
  if (SEV_RANK[ev.severity] < SEV_RANK[rule.minSeverity]) return false;
  if (
    rule.alertKinds &&
    rule.alertKinds.length > 0 &&
    !rule.alertKinds.includes(ev.alertKind)
  ) {
    return false;
  }
  return true;
}

/**
 * Does a channel with these routes fire for this event?
 * A channel with NO routes fires for everything (backward-compatible default,
 * so existing channels keep working after the routing table is added).
 */
export function channelShouldFire(routes: RouteRule[], ev: RouteEvent): boolean {
  if (routes.length === 0) return true;
  return routes.some((r) => ruleMatches(r, ev));
}
