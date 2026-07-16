import { describe, it, expect } from "vitest";
import { currentOnCallIndex } from "./oncall";

const DAY = 24 * 60 * 60 * 1000;
const anchor = 1_700_000_000_000; // fixed instant

describe("currentOnCallIndex", () => {
  it("returns null when there are no members", () => {
    expect(currentOnCallIndex(0, 7, anchor, anchor)).toBeNull();
  });

  it("picks the first member at the anchor", () => {
    expect(currentOnCallIndex(3, 7, anchor, anchor)).toBe(0);
  });

  it("advances one slot per rotation period", () => {
    expect(currentOnCallIndex(3, 7, anchor, anchor + 8 * DAY)).toBe(1);
    expect(currentOnCallIndex(3, 7, anchor, anchor + 15 * DAY)).toBe(2);
  });

  it("wraps around after the last member", () => {
    expect(currentOnCallIndex(3, 7, anchor, anchor + 22 * DAY)).toBe(0);
  });

  it("stays on the current member within a period", () => {
    expect(currentOnCallIndex(3, 7, anchor, anchor + 6 * DAY)).toBe(0);
  });

  it("handles times before the anchor without going negative", () => {
    // one period before the anchor → last member (index 2)
    expect(currentOnCallIndex(3, 7, anchor, anchor - 1 * DAY)).toBe(2);
  });

  it("treats a non-positive rotation as daily", () => {
    expect(currentOnCallIndex(2, 0, anchor, anchor + 1 * DAY)).toBe(1);
  });
});
