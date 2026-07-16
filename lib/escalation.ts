/**
 * Escalation engine (P4) — pure. Given a policy's steps, how long an incident
 * has been open, and how many steps already fired, decide which steps fire now.
 * Kept DB-free so it is unit-testable; the checker feeds it rows and delivers
 * the returned steps.
 */

export interface EscStep {
  afterMinutes: number;
  channelId: number;
}

export interface DueResult {
  /** Steps to notify now, in order. */
  due: EscStep[];
  /** New fired count to persist on the incident. */
  firedCount: number;
}

/**
 * Steps fire in ascending `afterMinutes` order, each once its delay has elapsed.
 * `firedCount` is how many leading steps already fired; only later steps are
 * considered. If several are overdue at once (e.g. a slow tick), they all fire.
 */
export function dueEscalationSteps(
  steps: EscStep[],
  minutesSinceStart: number,
  firedCount: number,
): DueResult {
  const sorted = [...steps].sort((a, b) => a.afterMinutes - b.afterMinutes);
  const due: EscStep[] = [];
  let fired = Math.max(0, firedCount);
  for (let i = fired; i < sorted.length; i++) {
    if (sorted[i].afterMinutes <= minutesSinceStart) {
      due.push(sorted[i]);
      fired = i + 1;
    } else {
      break;
    }
  }
  return { due, firedCount: fired };
}
