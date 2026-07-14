import { describe, it, expect } from "vitest";
import { computeSlo, parseSloPeriod } from "./slo";

describe("computeSlo", () => {
  it("meets target when uptime >= target", () => {
    const r = computeSlo(1000, 999, 99.9, 30); // 99.9% exactly
    expect(r.met).toBe(true);
    expect(r.uptimePct).toBeCloseTo(99.9, 1);
  });

  it("breaches when uptime below target", () => {
    const r = computeSlo(1000, 990, 99.9, 30); // 99.0%
    expect(r.met).toBe(false);
    // budget = 0.1% of 30d = 43.2 min; observed = 1% of 30d = 432 min → 1000%
    expect(r.budgetUsedPct).toBeCloseTo(1000, 0);
  });

  it("reports no breach and no data when there are no checks", () => {
    const r = computeSlo(0, 0, 99.9, 30);
    expect(r.hasData).toBe(false);
    expect(r.met).toBe(true);
    expect(r.budgetUsedPct).toBe(0);
  });

  it("uses ∞ budget-used when target is 100% and there is downtime", () => {
    const r = computeSlo(100, 99, 100, 7);
    expect(r.met).toBe(false);
    expect(r.budgetUsedPct).toBe(Infinity);
  });

  it("computes allowed vs observed downtime minutes", () => {
    const r = computeSlo(1000, 995, 99.5, 30); // 99.5% = exactly target
    expect(r.allowedDownMin).toBeCloseTo(0.005 * 30 * 24 * 60, 1); // 216 min
    expect(r.observedDownMin).toBeCloseTo(0.005 * 30 * 24 * 60, 1);
    expect(r.met).toBe(true);
  });
});

describe("parseSloPeriod", () => {
  it("accepts valid periods, defaults to 30d", () => {
    expect(parseSloPeriod("7d")).toBe("7d");
    expect(parseSloPeriod("90d")).toBe("90d");
    expect(parseSloPeriod("x")).toBe("30d");
    expect(parseSloPeriod(undefined)).toBe("30d");
  });
});
