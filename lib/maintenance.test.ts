import { describe, it, expect } from "vitest";
import { currentOccurrence, nextOccurrence, occursAt } from "./maintenance";
import type { MaintenanceWindow } from "@/lib/db/schema";

// Minimal window factory (only the fields the occurrence math reads).
function win(over: Partial<MaintenanceWindow>): MaintenanceWindow {
  return {
    id: 1,
    name: "mw",
    scope: "global",
    monitorId: null,
    startsAt: new Date("2026-01-01T22:00:00Z"),
    endsAt: new Date("2026-01-01T23:00:00Z"),
    recurrence: "none",
    recurrenceConfig: null,
    reason: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  } as MaintenanceWindow;
}

describe("currentOccurrence (one-off)", () => {
  it("is active inside the window, inactive outside", () => {
    const w = win({});
    expect(occursAt(w, new Date("2026-01-01T22:30:00Z"))).toBe(true);
    expect(occursAt(w, new Date("2026-01-01T23:30:00Z"))).toBe(false);
    expect(occursAt(w, new Date("2026-01-01T21:30:00Z"))).toBe(false);
  });
});

describe("nextOccurrence (one-off)", () => {
  it("returns the window when it's in the future, else null", () => {
    const w = win({});
    expect(nextOccurrence(w, new Date("2026-01-01T00:00:00Z"))?.start).toEqual(
      w.startsAt,
    );
    expect(nextOccurrence(w, new Date("2026-01-02T00:00:00Z"))).toBeNull();
  });
});

describe("recurrence (daily)", () => {
  const w = win({ recurrence: "daily" });
  it("is active during today's occurrence", () => {
    expect(occursAt(w, new Date("2026-03-15T22:30:00Z"))).toBe(true);
    expect(occursAt(w, new Date("2026-03-15T12:00:00Z"))).toBe(false);
  });
  it("finds the next daily occurrence after a gap", () => {
    const next = nextOccurrence(w, new Date("2026-03-15T12:00:00Z"));
    // next 22:00 same day
    expect(next?.start.toISOString()).toBe("2026-03-15T22:00:00.000Z");
    expect(next?.end.toISOString()).toBe("2026-03-15T23:00:00.000Z");
  });
});
