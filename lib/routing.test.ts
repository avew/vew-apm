import { describe, it, expect } from "vitest";
import { channelShouldFire, type RouteRule, type RouteEvent } from "./routing";

const ev = (over: Partial<RouteEvent> = {}): RouteEvent => ({
  monitorId: 1,
  group: "payments",
  severity: "critical",
  alertKind: "availability",
  ...over,
});

const rule = (over: Partial<RouteRule> = {}): RouteRule => ({
  scope: "all",
  targetId: null,
  minSeverity: "warning",
  alertKinds: null,
  ...over,
});

describe("channelShouldFire", () => {
  it("fires for everything when there are no routes (back-compat)", () => {
    expect(channelShouldFire([], ev())).toBe(true);
  });

  it("scope 'all' matches any monitor", () => {
    expect(channelShouldFire([rule({ scope: "all" })], ev({ monitorId: 99 }))).toBe(true);
  });

  it("scope 'group' matches only the named group", () => {
    const r = [rule({ scope: "group", targetId: "payments" })];
    expect(channelShouldFire(r, ev({ group: "payments" }))).toBe(true);
    expect(channelShouldFire(r, ev({ group: "billing" }))).toBe(false);
    expect(channelShouldFire(r, ev({ group: null }))).toBe(false);
  });

  it("scope 'monitor' matches only the target monitor id", () => {
    const r = [rule({ scope: "monitor", targetId: "42" })];
    expect(channelShouldFire(r, ev({ monitorId: 42 }))).toBe(true);
    expect(channelShouldFire(r, ev({ monitorId: 7 }))).toBe(false);
  });

  it("minSeverity 'critical' filters out warning events", () => {
    const r = [rule({ minSeverity: "critical" })];
    expect(channelShouldFire(r, ev({ severity: "critical" }))).toBe(true);
    expect(channelShouldFire(r, ev({ severity: "warning" }))).toBe(false);
  });

  it("minSeverity 'warning' passes both severities", () => {
    const r = [rule({ minSeverity: "warning" })];
    expect(channelShouldFire(r, ev({ severity: "warning" }))).toBe(true);
    expect(channelShouldFire(r, ev({ severity: "critical" }))).toBe(true);
  });

  it("alertKinds restricts to listed kinds; null/empty = all", () => {
    expect(
      channelShouldFire([rule({ alertKinds: ["disk", "latency"] })], ev({ alertKind: "disk" })),
    ).toBe(true);
    expect(
      channelShouldFire([rule({ alertKinds: ["disk"] })], ev({ alertKind: "availability" })),
    ).toBe(false);
    expect(
      channelShouldFire([rule({ alertKinds: [] })], ev({ alertKind: "availability" })),
    ).toBe(true);
  });

  it("multiple routes are OR-ed", () => {
    const r = [
      rule({ scope: "monitor", targetId: "42" }),
      rule({ scope: "group", targetId: "payments" }),
    ];
    // matches via group even though monitor id differs
    expect(channelShouldFire(r, ev({ monitorId: 7, group: "payments" }))).toBe(true);
    // matches neither
    expect(channelShouldFire(r, ev({ monitorId: 7, group: "other" }))).toBe(false);
  });

  it("combines scope + severity + kind on a single rule", () => {
    const r = [
      rule({
        scope: "group",
        targetId: "payments",
        minSeverity: "critical",
        alertKinds: ["availability"],
      }),
    ];
    expect(channelShouldFire(r, ev())).toBe(true);
    expect(channelShouldFire(r, ev({ severity: "warning" }))).toBe(false);
    expect(channelShouldFire(r, ev({ alertKind: "disk" }))).toBe(false);
    expect(channelShouldFire(r, ev({ group: "billing" }))).toBe(false);
  });
});
