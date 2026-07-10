import { describe, it, expect } from "vitest";
import { withRetry, NotifyError, httpRetryable } from "./retry";

// Deterministic options: no real sleeping, no jitter; capture the delays used.
function harness() {
  const delays: number[] = [];
  const sleep = async (ms: number) => {
    delays.push(ms);
  };
  return { delays, opts: { jitter: false, sleep } };
}

describe("withRetry", () => {
  it("returns immediately on first success (no sleep)", async () => {
    const { delays, opts } = harness();
    let calls = 0;
    const out = await withRetry(async () => {
      calls++;
      return "ok";
    }, opts);
    expect(out).toBe("ok");
    expect(calls).toBe(1);
    expect(delays).toEqual([]);
  });

  it("retries retryable failures then succeeds", async () => {
    const { delays, opts } = harness();
    let calls = 0;
    const out = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new NotifyError("boom", { retryable: true });
      return "ok";
    }, opts);
    expect(out).toBe("ok");
    expect(calls).toBe(3);
    // base 500, factor 3 → 500, 1500 before the 3rd (successful) attempt
    expect(delays).toEqual([500, 1500]);
  });

  it("stops immediately on a non-retryable error", async () => {
    const { delays, opts } = harness();
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new NotifyError("bad token", { retryable: false });
      }, opts),
    ).rejects.toThrow("bad token");
    expect(calls).toBe(1);
    expect(delays).toEqual([]);
  });

  it("exhausts retries then throws the last error", async () => {
    const { delays, opts } = harness();
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new NotifyError(`fail ${calls}`, { retryable: true });
        },
        { ...opts, retries: 2 },
      ),
    ).rejects.toThrow("fail 3");
    expect(calls).toBe(3); // 1 + 2 retries
    expect(delays).toEqual([500, 1500]);
  });

  it("treats non-NotifyError throws as retryable", async () => {
    const { opts } = harness();
    let calls = 0;
    const out = await withRetry(async () => {
      calls++;
      if (calls < 2) throw new Error("network glitch");
      return 42;
    }, opts);
    expect(out).toBe(42);
    expect(calls).toBe(2);
  });

  it("caps the delay at maxMs", async () => {
    const { delays, opts } = harness();
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new NotifyError("x", { retryable: true });
        },
        { ...opts, retries: 4, baseMs: 1000, factor: 10, maxMs: 5000 },
      ),
    ).rejects.toThrow();
    // 1000, 10000→cap 5000, 100000→cap 5000, 5000
    expect(delays).toEqual([1000, 5000, 5000, 5000]);
  });
});

describe("httpRetryable", () => {
  it("marks 429 and 5xx transient, other 4xx permanent", () => {
    expect(httpRetryable(429)).toBe(true);
    expect(httpRetryable(500)).toBe(true);
    expect(httpRetryable(503)).toBe(true);
    expect(httpRetryable(400)).toBe(false);
    expect(httpRetryable(401)).toBe(false);
    expect(httpRetryable(404)).toBe(false);
  });
});
