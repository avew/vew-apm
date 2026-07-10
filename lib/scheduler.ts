import { runDueChecks } from "./checker";
import { pruneUsingSettings } from "./retention";
import { guardOverlap } from "./overlap-guard";

// Next compiles instrumentation and route handlers into separate module graphs,
// so a plain module-level `let` would be instantiated once per bundle and the
// scheduler's state wouldn't be visible to /api/health. Keep it on globalThis
// behind a global Symbol so every bundle shares the one object.
interface SchedState {
  started: boolean;
  disabled: boolean;
  lastTickAt: number;
}
const STATE_KEY = Symbol.for("vew-apm.scheduler.state");

function state(): SchedState {
  const g = globalThis as unknown as Record<symbol, SchedState | undefined>;
  return (g[STATE_KEY] ??= { started: false, disabled: false, lastTickAt: 0 });
}

/** Liveness snapshot for the /api/health endpoint. */
export function getSchedulerStatus(): SchedState {
  const s = state();
  return { started: s.started, disabled: s.disabled, lastTickAt: s.lastTickAt };
}

export function startScheduler() {
  const s = state();
  if (s.started) return;
  if (process.env.APM_DISABLE_SCHEDULER === "1") {
    s.disabled = true;
    return;
  }
  s.started = true;

  const tickMs = Number(process.env.APM_SCHEDULER_TICK_MS ?? 5000);
  const PRUNE_EVERY_MS = 60 * 60 * 1000; // hourly
  let lastPrune = 0;

  const tickBody = async () => {
    try {
      try {
        const { ran } = await runDueChecks();
        if (ran > 0) console.log(`[scheduler] ran ${ran} check(s)`);
      } catch (e) {
        console.error("[scheduler] tick failed:", e);
      }
      // retention sweep (throttled)
      const now = Date.now();
      if (now - lastPrune >= PRUNE_EVERY_MS) {
        lastPrune = now;
        try {
          const removed = await pruneUsingSettings();
          if (removed > 0) console.log(`[scheduler] pruned ${removed} old check(s)`);
        } catch (e) {
          console.error("[scheduler] prune failed:", e);
        }
      }
    } finally {
      // Record liveness even if a tick threw — health reads this timestamp.
      state().lastTickAt = Date.now();
    }
  };

  // Skip a tick if the previous one is still running, so a slow tick (e.g. a
  // monitor fetch near its timeout) can't overlap and double-run a due monitor.
  const tick = guardOverlap(tickBody, () =>
    console.warn("[scheduler] previous tick still running — skipping this one"),
  );

  setTimeout(tick, 500);
  setInterval(tick, tickMs);
  console.log(`[scheduler] started (tick every ${tickMs}ms)`);
}
