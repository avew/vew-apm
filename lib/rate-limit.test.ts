import { describe, it, expect } from "vitest";
import { retryAfterMs, recordFailure, reset } from "./rate-limit";

describe("rate-limit", () => {
  it("is not limited before max failures", () => {
    const k = "ip:test-a";
    reset(k);
    for (let i = 0; i < 4; i++) recordFailure(k, { max: 5 });
    expect(retryAfterMs(k)).toBe(0);
  });

  it("locks once max failures reached", () => {
    const k = "ip:test-b";
    reset(k);
    for (let i = 0; i < 5; i++) recordFailure(k, { max: 5, lockMs: 60_000 });
    expect(retryAfterMs(k)).toBeGreaterThan(0);
  });

  it("reset clears the lock", () => {
    const k = "ip:test-c";
    for (let i = 0; i < 5; i++) recordFailure(k, { max: 5 });
    reset(k);
    expect(retryAfterMs(k)).toBe(0);
  });
});
