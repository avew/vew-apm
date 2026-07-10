// In-memory fixed-window limiter with lockout. Single-process (one replica) —
// good enough for login brute-force protection on a self-hosted instance.

interface Entry {
  fails: number;
  windowEnd: number;
  lockedUntil: number;
}

const store = new Map<string, Entry>();

export interface LimitOpts {
  max?: number; // failures allowed within the window before lockout
  windowMs?: number; // counting window
  lockMs?: number; // lockout duration once max is hit
}

const DEFAULTS = { max: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };

/** Returns ms until the key is allowed again, or 0 if not locked. */
export function retryAfterMs(key: string): number {
  const e = store.get(key);
  if (!e) return 0;
  const now = Date.now();
  return e.lockedUntil > now ? e.lockedUntil - now : 0;
}

/** Record a failed attempt; locks the key once `max` is reached in the window. */
export function recordFailure(key: string, opts: LimitOpts = {}): void {
  const { max, windowMs, lockMs } = { ...DEFAULTS, ...opts };
  const now = Date.now();
  let e = store.get(key);
  if (!e || now > e.windowEnd) {
    e = { fails: 0, windowEnd: now + windowMs, lockedUntil: 0 };
    store.set(key, e);
  }
  e.fails += 1;
  if (e.fails >= max) e.lockedUntil = now + lockMs;

  // opportunistic cleanup so the map can't grow unbounded
  if (store.size > 2000) {
    for (const [k, v] of store) {
      if (v.lockedUntil < now && v.windowEnd < now) store.delete(k);
    }
  }
}

/** Clear a key after a successful attempt. */
export function reset(key: string): void {
  store.delete(key);
}
