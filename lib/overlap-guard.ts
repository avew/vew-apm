/**
 * Wrap an async function so overlapping invocations are skipped.
 *
 * `setInterval(fn, ms)` fires on a fixed cadence regardless of whether the
 * previous async run finished. If a scheduler tick outruns its interval (e.g. a
 * monitor fetch takes up to its timeout), a second tick would start while the
 * first is mid-flight and both could claim the same due monitor. The returned
 * function no-ops (calling `onSkip`) while a prior run is still in progress.
 */
export function guardOverlap(
  fn: () => Promise<void>,
  onSkip?: () => void,
): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) {
      onSkip?.();
      return;
    }
    running = true;
    try {
      await fn();
    } finally {
      running = false;
    }
  };
}
