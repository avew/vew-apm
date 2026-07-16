import { signToken, verifyToken } from "./crypto";

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
