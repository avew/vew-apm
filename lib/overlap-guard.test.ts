import { describe, it, expect } from "vitest";
import { guardOverlap } from "./overlap-guard";

// A promise we resolve by hand to hold a run "in flight".
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("guardOverlap", () => {
  it("runs the wrapped fn normally when not overlapping", async () => {
    let calls = 0;
    const g = guardOverlap(async () => {
      calls++;
    });
    await g();
    await g();
    expect(calls).toBe(2);
  });

  it("skips a call while a prior run is still in flight", async () => {
    let calls = 0;
    let skips = 0;
    const d = deferred();
    const g = guardOverlap(
      async () => {
        calls++;
        await d.promise;
      },
      () => skips++,
    );

    const first = g(); // starts, awaits d
    await g(); // overlaps → skipped
    await g(); // still overlapping → skipped
    expect(calls).toBe(1);
    expect(skips).toBe(2);

    d.resolve();
    await first;

    await g(); // free again → runs
    expect(calls).toBe(2);
    expect(skips).toBe(2);
  });

  it("releases the guard even if the fn throws", async () => {
    let calls = 0;
    const g = guardOverlap(async () => {
      calls++;
      throw new Error("boom");
    });
    await expect(g()).rejects.toThrow("boom");
    await expect(g()).rejects.toThrow("boom");
    expect(calls).toBe(2); // not wedged after a throw
  });
});
