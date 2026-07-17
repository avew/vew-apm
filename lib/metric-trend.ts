import type { MetricOp, TrendMode } from "./rules";

/** One historical reading of a metric: `at` is epoch-ms, `value` the scraped number. */
export interface TrendSample {
  at: number;
  value: number;
}

export interface TrendResult {
  /** The derived scalar to threshold-compare (latest value, extreme, delta, or rate). */
  value: number;
  /**
   * True when the window can't be evaluated yet (too few samples, or the series
   * doesn't span enough of the window). The caller skips the rule — no fire, no
   * flap-clear — exactly like a metric that isn't present in the scrape.
   */
  insufficient: boolean;
}

/**
 * Fraction of the window that must actually be covered by samples before a
 * non-instant rule evaluates. Stops a freshly-created rule (2 samples 20s apart)
 * from "sustaining" a 10m window. A rule stays silent until it has ~this much
 * history.
 */
const MIN_COVERAGE = 0.75;

/** `true` when a "greater" operator — its breaching direction is upward. */
function isGreater(op: MetricOp): boolean {
  return op === "gt" || op === "gte";
}

/**
 * Reduce a metric's recent series to a single scalar per the rule's trend mode,
 * so the (unchanged) `breaches()` comparison in the rule engine can be applied to
 * it. Pure — the checker feeds it DB-derived history.
 *
 * - `instant`   → latest value (today's behavior; window ignored).
 * - `sustained` → the worst *non*-breaching extreme in the window (min for gt/gte,
 *                 max for lt/lte). If that extreme breaches, every sample did.
 * - `delta`     → last − earliest-in-window (absolute change).
 * - `rate`      → (last − first) / span-seconds; a negative result (counter reset)
 *                 is clamped to 0.
 *
 * `series` must be ascending by `at` and include the current reading as its last
 * element. `windowMs` is the trailing window in milliseconds.
 */
export function computeTrend(
  series: TrendSample[],
  mode: TrendMode,
  windowMs: number,
  op: MetricOp,
): TrendResult {
  if (series.length === 0) return { value: 0, insufficient: true };
  const last = series[series.length - 1];

  if (mode === "instant") {
    return { value: last.value, insufficient: false };
  }

  const windowStart = last.at - windowMs;
  const win = series.filter((s) => s.at >= windowStart);

  // Need at least two points, and the series must span most of the window.
  if (win.length < 2) return { value: 0, insufficient: true };
  const covered = last.at - win[0].at;
  if (covered < windowMs * MIN_COVERAGE) return { value: 0, insufficient: true };

  if (mode === "sustained") {
    // The extreme that, if it breaches, guarantees every sample in the window did.
    const value = isGreater(op)
      ? Math.min(...win.map((s) => s.value))
      : Math.max(...win.map((s) => s.value));
    return { value, insufficient: false };
  }

  if (mode === "delta") {
    return { value: last.value - win[0].value, insufficient: false };
  }

  // rate: per-second change over the covered span; counter resets clamp to 0.
  const spanSeconds = covered / 1000;
  if (spanSeconds <= 0) return { value: 0, insufficient: true };
  const raw = (last.value - win[0].value) / spanSeconds;
  return { value: raw < 0 ? 0 : raw, insufficient: false };
}
