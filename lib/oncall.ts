/**
 * On-call rotation (P5) — pure. Round-robin over an ordered member list: the
 * active slot advances every `rotationDays`, counted from an anchor instant.
 * Kept DB-free and time-injected so it is deterministic and unit-testable.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Index (0-based) of the member on call at `nowMs`, or null when the schedule
 * has no members. Times before the anchor wrap correctly (negative-safe).
 */
export function currentOnCallIndex(
  memberCount: number,
  rotationDays: number,
  anchorMs: number,
  nowMs: number,
): number | null {
  if (memberCount <= 0) return null;
  const days = rotationDays > 0 ? rotationDays : 1;
  const periodMs = days * DAY_MS;
  const periods = Math.floor((nowMs - anchorMs) / periodMs);
  // JS % keeps the sign of the dividend; normalise into [0, memberCount)
  return ((periods % memberCount) + memberCount) % memberCount;
}
