import { runDueChecks } from "./checker";

let started = false;

export function startScheduler() {
  if (started) return;
  if (process.env.APM_DISABLE_SCHEDULER === "1") return;
  started = true;

  const tickMs = Number(process.env.APM_SCHEDULER_TICK_MS ?? 5000);

  const tick = async () => {
    try {
      const { ran } = await runDueChecks();
      if (ran > 0) console.log(`[scheduler] ran ${ran} check(s)`);
    } catch (e) {
      console.error("[scheduler] tick failed:", e);
    }
  };

  setTimeout(tick, 500);
  setInterval(tick, tickMs);
  console.log(`[scheduler] started (tick every ${tickMs}ms)`);
}
