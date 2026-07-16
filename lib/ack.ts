import { signToken, verifyToken } from "./crypto";
import { getDb, schema } from "./db/client";
import { eq } from "drizzle-orm";

/**
 * Acknowledge links (P3). An open incident carries an unguessable, session-free
 * URL that operators click from a notification to stop it renotifying. The token
 * is an HMAC over the incident id, so it cannot be forged or enumerated.
 */

const scope = (incidentId: number) => `ack:${incidentId}`;

export function ackToken(incidentId: number): string {
  return signToken(scope(incidentId));
}

export function verifyAckToken(incidentId: number, token: string): boolean {
  return verifyToken(scope(incidentId), token);
}

/** Absolute ack URL, or null when APP_BASE_URL is not configured. */
export function ackUrl(incidentId: number): string | null {
  const base = process.env.APP_BASE_URL?.replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/api/ack/${incidentId}?token=${ackToken(incidentId)}`;
}

export type AckResult =
  | { ok: true; monitorName: string; kind: string }
  | { ok: false; reason: "not_found" | "resolved" };

/**
 * Acknowledge (and optionally snooze) an open incident. Shared by the signed
 * link route and the Slack/Telegram interactive endpoints. Idempotent — acking
 * an already-acked incident just refreshes it.
 */
export async function acknowledgeIncident(
  incidentId: number,
  by: string,
  snoozeMinutes?: number,
): Promise<AckResult> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.incidents)
    .where(eq(schema.incidents.id, incidentId));
  if (!row) return { ok: false, reason: "not_found" };
  const [mon] = await db
    .select({ name: schema.monitors.name })
    .from(schema.monitors)
    .where(eq(schema.monitors.id, row.monitorId));
  const monitorName = mon?.name ?? `monitor #${row.monitorId}`;
  if (row.resolved) return { ok: false, reason: "resolved" };

  const now = new Date();
  await db
    .update(schema.incidents)
    .set({
      ackedAt: now,
      ackedBy: by,
      snoozedUntil: snoozeMinutes
        ? new Date(now.getTime() + snoozeMinutes * 60_000)
        : null,
    })
    .where(eq(schema.incidents.id, incidentId));
  return { ok: true, monitorName, kind: row.kind };
}
