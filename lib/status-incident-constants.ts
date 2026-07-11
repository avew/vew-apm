// DB-free constants + types so client components can import them without
// pulling the server-only DB module (better-sqlite3) into the browser bundle.
import type { StatusIncident, StatusIncidentUpdate } from "@/lib/db/schema";

export const INCIDENT_STATUSES = [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_IMPACTS = ["minor", "major", "critical"] as const;
export type IncidentImpact = (typeof INCIDENT_IMPACTS)[number];

export function isIncidentStatus(s: string): s is IncidentStatus {
  return (INCIDENT_STATUSES as readonly string[]).includes(s);
}
export function isIncidentImpact(s: string): s is IncidentImpact {
  return (INCIDENT_IMPACTS as readonly string[]).includes(s);
}

export interface IncidentWithUpdates extends StatusIncident {
  updates: StatusIncidentUpdate[];
}
