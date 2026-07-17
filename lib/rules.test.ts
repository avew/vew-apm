import { describe, it, expect } from "vitest";
import { evaluateRules, alertKey, percentile, type RuleContext } from "./rules";
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
    certDaysLeft: null,
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

describe("evaluateRules — cert expiry", () => {
  it("warns within certWarnDays, critical within certCritDays", () => {
    const warn = evaluateRules(ctx({ certDaysLeft: 10 })).find((a) => a.kind === "cert_expiry");
    expect(warn?.severity).toBe("warning"); // 10 ≤ 14, > 3

    const crit = evaluateRules(ctx({ certDaysLeft: 2 })).find((a) => a.kind === "cert_expiry");
    expect(crit?.severity).toBe("critical"); // 2 ≤ 3

    const expired = evaluateRules(ctx({ certDaysLeft: -5 })).find((a) => a.kind === "cert_expiry");
    expect(expired?.severity).toBe("critical");
    expect(expired?.reason).toMatch(/expired/i);
  });

  it("no alert when plenty of time left or unknown", () => {
    expect(evaluateRules(ctx({ certDaysLeft: 60 })).find((a) => a.kind === "cert_expiry")).toBeUndefined();
    expect(evaluateRules(ctx({ certDaysLeft: null })).find((a) => a.kind === "cert_expiry")).toBeUndefined();
  });
});

describe("percentile", () => {
  it("computes nearest-rank percentiles", () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 95)).toBe(95);
    expect(percentile(v, 99)).toBe(99);
    expect(percentile(v, 100)).toBe(100);
  });
  it("is order-independent and handles empty", () => {
    expect(percentile([9, 1, 5, 3], 50)).toBe(3);
    expect(percentile([], 95)).toBe(0);
  });
});

describe("evaluateRules — latency (p95)", () => {
  it("warns when p95 >= threshold", () => {
    const recentChecks = Array.from({ length: 5 }, (_, i) => ({
      checkedAt: new Date(NOW.getTime() - i * 60_000),
      overallStatus: "UP",
      responseMs: 3000,
    }));
    const alerts = evaluateRules(ctx({ recentChecks }));
    const lat = alerts.find((a) => a.kind === "latency");
    expect(lat?.severity).toBe("warning");
    expect(lat?.metricValue).toBe(3000);
    expect(lat?.reason).toContain("p95");
  });

  it("fires on spikes that a rolling AVG would hide", () => {
    // 18 fast + 2 very slow over a 20-check window → avg 990ms (under 2000) but
    // p95 = 9000ms, so p95 alerts where avg wouldn't.
    const recentChecks = [
      { checkedAt: NOW, overallStatus: "UP", responseMs: 9000 },
      { checkedAt: new Date(NOW.getTime() - 60_000), overallStatus: "UP", responseMs: 9000 },
      ...Array.from({ length: 18 }, (_, i) => ({
        checkedAt: new Date(NOW.getTime() - (i + 2) * 60_000),
        overallStatus: "UP",
        responseMs: 100,
      })),
    ];
    const t = { ...ALERT_DEFAULTS, latencyWindow: 20 };
    const alerts = evaluateRules(ctx({ recentChecks, thresholds: t }));
    expect(alerts.find((a) => a.kind === "latency")?.metricValue).toBe(9000);
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

describe("evaluateRules — metric thresholds", () => {
  const rule = {
    key: "Heap",
    label: "heap used",
    operator: "gt" as const,
    warnValue: 100,
    critValue: 200,
  };

  it("warns when value crosses warn but not crit", () => {
    const a = evaluateRules(ctx({ metrics: [{ ...rule, value: 150 }] })).find((x) => x.kind === "metric");
    expect(a?.severity).toBe("warning");
    expect(a?.metricValue).toBe(150);
    expect(a?.threshold).toBe(100);
    expect(a?.componentPath).toBe("Heap");
    expect(a?.reason).toContain("heap used = 150 > 100");
  });

  it("critical when value crosses crit (crit wins over warn)", () => {
    const found = evaluateRules(ctx({ metrics: [{ ...rule, value: 250 }] })).filter((x) => x.kind === "metric");
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe("critical");
    expect(found[0].threshold).toBe(200);
  });

  it("no alert below warn", () => {
    expect(
      evaluateRules(ctx({ metrics: [{ ...rule, value: 50 }] })).find((x) => x.kind === "metric"),
    ).toBeUndefined();
  });

  it("supports lt operator (alert when value falls below)", () => {
    const a = evaluateRules(
      ctx({ metrics: [{ key: "conns", label: "free conns", value: 2, operator: "lt", warnValue: 5, critValue: 1 }] }),
    ).find((x) => x.kind === "metric");
    expect(a?.severity).toBe("warning");
    expect(a?.reason).toContain("< 5");
  });

  it("skips a threshold that is null", () => {
    const a = evaluateRules(
      ctx({ metrics: [{ key: "k", label: "l", value: 999, operator: "gt", warnValue: null, critValue: null }] }),
    ).find((x) => x.kind === "metric");
    expect(a).toBeUndefined();
  });

  it("words the reason for a sustained trend rule", () => {
    const a = evaluateRules(
      ctx({
        metrics: [
          { key: "cpu", label: "Process CPU", value: 0.9, operator: "gt", warnValue: 0.85, critValue: 0.95, mode: "sustained", windowSeconds: 600 },
        ],
      }),
    ).find((x) => x.kind === "metric");
    expect(a?.severity).toBe("warning");
    expect(a?.reason).toBe("Process CPU > 0.85 sustained 10m");
  });

  it("words the reason for a delta trend rule", () => {
    const a = evaluateRules(
      ctx({
        metrics: [
          { key: "err", label: "Errors", value: 143, operator: "gt", warnValue: 10, critValue: 50, mode: "delta", windowSeconds: 300 },
        ],
      }),
    ).find((x) => x.kind === "metric");
    expect(a?.severity).toBe("critical");
    expect(a?.reason).toBe("Errors changed 143 over 5m (> 50)");
  });
});
