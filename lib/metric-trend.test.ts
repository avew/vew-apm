import { describe, it, expect } from "vitest";
import { computeTrend, type TrendSample } from "./metric-trend";

const MIN = 60_000;

// Build an evenly-spaced ascending series ending at t=0 (epoch-ms), one point per
// minute going back, so a series of N values covers (N-1) minutes.
function series(values: number[], stepMs = MIN): TrendSample[] {
  const n = values.length;
  return values.map((value, i) => ({ at: (i - (n - 1)) * stepMs, value }));
}

describe("computeTrend", () => {
  it("instant returns the latest value regardless of window", () => {
    const r = computeTrend(series([1, 2, 9]), "instant", 5 * MIN, "gt");
    expect(r).toEqual({ value: 9, insufficient: false });
  });

  it("instant with an empty series is insufficient", () => {
    expect(computeTrend([], "instant", MIN, "gt").insufficient).toBe(true);
  });

  it("non-instant needs at least two samples", () => {
    const r = computeTrend(series([5]), "sustained", 5 * MIN, "gt");
    expect(r.insufficient).toBe(true);
  });

  it("non-instant needs the window mostly covered", () => {
    // Two points only 1 minute apart, but a 10-minute window → not covered yet.
    const r = computeTrend(series([9, 9]), "sustained", 10 * MIN, "gt");
    expect(r.insufficient).toBe(true);
  });

  describe("sustained", () => {
    it("gt uses the window minimum (all must breach)", () => {
      // 6 points over 5m; min is 82 → compared against threshold by the engine.
      const r = computeTrend(series([90, 88, 85, 82, 91, 95]), "sustained", 5 * MIN, "gt");
      expect(r.insufficient).toBe(false);
      expect(r.value).toBe(82);
    });

    it("lt uses the window maximum (all must breach downward)", () => {
      const r = computeTrend(series([10, 12, 15, 9, 8, 11]), "sustained", 5 * MIN, "lt");
      expect(r.value).toBe(15);
    });
  });

  describe("delta", () => {
    it("is last minus earliest in window", () => {
      const r = computeTrend(series([100, 110, 130, 143]), "delta", 3 * MIN, "gt");
      expect(r.insufficient).toBe(false);
      expect(r.value).toBe(43);
    });

    it("only counts samples inside the window", () => {
      // 7 points over 6m; a 3m window keeps the last 4 (values 40..70).
      const r = computeTrend(series([10, 20, 30, 40, 50, 60, 70]), "delta", 3 * MIN, "gt");
      expect(r.value).toBe(30); // 70 - 40
    });
  });

  describe("rate", () => {
    it("is per-second change over the covered span", () => {
      // +300 over 5 minutes = 300 / 300s = 1.0 / s
      const r = computeTrend(series([0, 60, 120, 180, 240, 300]), "rate", 5 * MIN, "gt");
      expect(r.insufficient).toBe(false);
      expect(r.value).toBeCloseTo(1.0, 5);
    });

    it("clamps a counter reset to 0", () => {
      // Counter dropped (restart) → negative raw rate clamps to 0.
      const r = computeTrend(series([500, 520, 540, 10, 30, 50]), "rate", 5 * MIN, "gt");
      expect(r.value).toBe(0);
    });
  });
});
