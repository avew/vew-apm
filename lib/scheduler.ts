import { runDueChecks } from "./checker";
import { pruneUsingSettings } from "./retention";

let started = false;

export function startScheduler() {
  if (started) return;
  if (process.env.APM_DISABLE_SCHEDULER === "1") return;
  started = true;

  const tickMs = Number(process.env.APM_SCHEDULER_TICK_MS ?? 5000);
  const PRUNE_EVERY_MS = 60 * 60 * 1000; // hourly
  let lastPrune = 0;

  const tick = async () => {
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
  };

  setTimeout(tick, 500);
  setInterval(tick, tickMs);
  console.log(`[scheduler] started (tick every ${tickMs}ms)`);
}
