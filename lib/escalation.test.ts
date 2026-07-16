import { describe, it, expect } from "vitest";
import { dueEscalationSteps, type EscStep } from "./escalation";

const steps: EscStep[] = [
  { afterMinutes: 5, channelId: 1 },
  { afterMinutes: 15, channelId: 2 },
  { afterMinutes: 30, channelId: 3 },
];

describe("dueEscalationSteps", () => {
  it("fires nothing when there are no steps", () => {
    expect(dueEscalationSteps([], 100, 0)).toEqual({ due: [], firedCount: 0 });
  });

  it("fires nothing before the first delay elapses", () => {
    expect(dueEscalationSteps(steps, 3, 0)).toEqual({ due: [], firedCount: 0 });
  });

  it("fires the first step once its delay elapses", () => {
    const r = dueEscalationSteps(steps, 6, 0);
    expect(r.due.map((s) => s.channelId)).toEqual([1]);
    expect(r.firedCount).toBe(1);
  });

  it("fires only newly-due steps given the already-fired count", () => {
    const r = dueEscalationSteps(steps, 20, 1);
    expect(r.due.map((s) => s.channelId)).toEqual([2]);
    expect(r.firedCount).toBe(2);
  });

  it("fires multiple overdue steps at once (slow tick / catch-up)", () => {
    const r = dueEscalationSteps(steps, 100, 0);
    expect(r.due.map((s) => s.channelId)).toEqual([1, 2, 3]);
    expect(r.firedCount).toBe(3);
  });

  it("fires nothing once all steps have fired", () => {
    expect(dueEscalationSteps(steps, 100, 3)).toEqual({ due: [], firedCount: 3 });
  });

  it("sorts unordered steps by delay before evaluating", () => {
    const unordered: EscStep[] = [
      { afterMinutes: 30, channelId: 3 },
      { afterMinutes: 5, channelId: 1 },
      { afterMinutes: 15, channelId: 2 },
    ];
    const r = dueEscalationSteps(unordered, 16, 0);
    expect(r.due.map((s) => s.channelId)).toEqual([1, 2]);
    expect(r.firedCount).toBe(2);
  });
});
