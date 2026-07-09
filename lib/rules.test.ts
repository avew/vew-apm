import { describe, it, expect } from "vitest";
import { evaluateRules, alertKey, type RuleContext } from "./rules";
import { ALERT_DEFAULTS } from "./alerts";

const NOW = new Date("2026-07-09T12:00:00.000Z");

function ctx(partial: Partial<RuleContext>): RuleContext {
  return {
    now: NOW,
    thresholds: { ...ALERT_DEFAULTS },
    recentChecks: [],
    badComponents: [],
    disks: [],
    eurekaServices: [],
    eurekaMissing: [],
    ...partial,
  };
}

function checksAllDown(count: number, stepSec: number) {
  return Array.from({ length: count }, (_, i) => ({
    checkedAt: new Date(NOW.getTime() - i * stepSec * 1000),
    overallStatus: "DOWN",
    responseMs: 100,
  }));
}

describe("evaluateRules — disk", () => {
  it("warns at >= 60%", () => {
    const alerts = evaluateRules(ctx({ disks: [{ path: "diskSpace", usedPct: 72 }] }));
    const disk = alerts.find((a) => a.kind === "disk");
    expect(disk?.severity).toBe("warning");
    expect(disk?.metricValue).toBe(72);
  });

  it("critical at >= 85%", () => {
    const alerts = evaluateRules(ctx({ disks: [{ path: "diskSpace", usedPct: 90 }] }));
    const disk = alerts.find((a) => a.kind === "disk");
    expect(disk?.severity).toBe("critical");
  });

  it("no alert below warn threshold", () => {
    const alerts = evaluateRules(ctx({ disks: [{ path: "diskSpace", usedPct: 40 }] }));
    expect(alerts.find((a) => a.kind === "disk")).toBeUndefined();
  });
});

describe("evaluateRules — availability duration gate", () => {
  it("opens when DOWN run spans >= downForMinutes", () => {
    // 4 checks over 4 minutes, all DOWN, threshold 3m
    const recentChecks = checksAllDown(5, 60);
    const alerts = evaluateRules(ctx({ recentChecks }));
    const avail = alerts.find((a) => a.kind === "availability");
    expect(avail?.severity).toBe("critical");
  });

  it("does NOT open on a single fresh DOWN (flap)", () => {
    const recentChecks = [
      { checkedAt: NOW, overallStatus: "DOWN", responseMs: 100 },
      { checkedAt: new Date(NOW.getTime() - 60_000), overallStatus: "UP", responseMs: 100 },
    ];
    const alerts = evaluateRules(ctx({ recentChecks }));
    expect(alerts.find((a) => a.kind === "availability")).toBeUndefined();
  });
});

describe("evaluateRules — latency", () => {
  it("warns when rolling avg >= threshold", () => {
    const recentChecks = Array.from({ length: 5 }, (_, i) => ({
      checkedAt: new Date(NOW.getTime() - i * 60_000),
      overallStatus: "UP",
      responseMs: 3000,
    }));
    const alerts = evaluateRules(ctx({ recentChecks }));
    const lat = alerts.find((a) => a.kind === "latency");
    expect(lat?.severity).toBe("warning");
    expect(lat?.metricValue).toBe(3000);
  });

  it("no alert when fast", () => {
    const recentChecks = [
      { checkedAt: NOW, overallStatus: "UP", responseMs: 120 },
    ];
    const alerts = evaluateRules(ctx({ recentChecks }));
    expect(alerts.find((a) => a.kind === "latency")).toBeUndefined();
  });
});

describe("evaluateRules — eureka drop", () => {
  it("warns when a service has 0 instances", () => {
    const alerts = evaluateRules(
      ctx({
        eurekaServices: [
          { serviceName: "BILLING-SVC", instanceCount: 0 },
          { serviceName: "PPH-SVC", instanceCount: 1 },
        ],
      }),
    );
    const eureka = alerts.filter((a) => a.kind === "eureka");
    expect(eureka).toHaveLength(1);
    expect(eureka[0].componentPath).toBe("eureka:BILLING-SVC");
  });

  it("respects eurekaDropAlert = false", () => {
    const alerts = evaluateRules(
      ctx({
        thresholds: { ...ALERT_DEFAULTS, eurekaDropAlert: false },
        eurekaServices: [{ serviceName: "BILLING-SVC", instanceCount: 0 }],
        eurekaMissing: ["ADMIN-CONSOLE-SVC"],
      }),
    );
    expect(alerts.find((a) => a.kind === "eureka")).toBeUndefined();
    expect(alerts.find((a) => a.kind === "service_missing")).toBeUndefined();
  });
});

describe("evaluateRules — service disappeared", () => {
  it("flags a service that deregistered from the registry", () => {
    const alerts = evaluateRules(
      ctx({
        eurekaServices: [{ serviceName: "BILLING-SVC", instanceCount: 1 }],
        eurekaMissing: ["ADMIN-CONSOLE-SVC"],
      }),
    );
    const missing = alerts.find((a) => a.kind === "service_missing");
    expect(missing?.severity).toBe("warning");
    expect(missing?.componentPath).toBe("service:ADMIN-CONSOLE-SVC");
  });
});

describe("evaluateRules — component down + keys", () => {
  it("flags DOWN components (critical) and produces unique keys", () => {
    const alerts = evaluateRules(
      ctx({
        badComponents: [{ path: "redis", status: "DOWN" }],
        disks: [{ path: "diskSpace", usedPct: 90 }],
      }),
    );
    const comp = alerts.find((a) => a.kind === "component_down");
    expect(comp?.componentPath).toBe("redis");
    expect(comp?.severity).toBe("critical");
    const keys = alerts.map(alertKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("flags OUT_OF_SERVICE components as warning", () => {
    const alerts = evaluateRules(
      ctx({ badComponents: [{ path: "redis", status: "OUT_OF_SERVICE" }] }),
    );
    const comp = alerts.find((a) => a.kind === "component_down");
    expect(comp?.severity).toBe("warning");
    expect(comp?.reason).toContain("OUT_OF_SERVICE");
  });
});
