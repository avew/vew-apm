import { getDb, schema } from "@/lib/db/client";
import { asc, desc } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";
import {
  ChannelsClient,
  type SafeChannel,
  type MonitorLite,
  type RouteRow,
} from "./channels-client";

export const dynamic = "force-dynamic";

// A one-line, secret-free summary for the row (never surfaces token/apiKey).
function preview(kind: string, cfg: Record<string, unknown>): string {
  if (kind === "webhook") return String(cfg.url ?? "");
  if (kind === "telegram") {
    const thread = cfg.messageThreadId ? ` · thread ${cfg.messageThreadId}` : "";
    return `chat ${cfg.chatId ?? "?"}${thread}`;
  }
  if (kind === "email") {
    const to = Array.isArray(cfg.to) ? cfg.to.join(", ") : "";
    return `${cfg.from ?? "?"} → ${to}`;
  }
  if (kind === "slack" || kind === "discord" || kind === "teams") {
    const url = String(cfg.webhookUrl ?? "");
    let host = "";
    try {
      host = url ? new URL(url).host : "";
    } catch {
      host = "";
    }
    const who = cfg.username ? ` · as ${cfg.username}` : "";
    return `${host || "incoming webhook"}${who}`;
  }
  return "";
}

// Strip secret fields so the edit form can prefill the rest without them ever
// reaching the browser.
const SECRET_KEYS = new Set(["botToken", "apiKey", "authHeaderValue", "webhookUrl"]);
function secretFreeConfig(cfg: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (!SECRET_KEYS.has(k)) out[k] = v;
  }
  return out;
}

export default async function NotificationsPage() {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.notificationChannels)
    .orderBy(desc(schema.notificationChannels.createdAt));

  // Routing rules (P2), grouped by channel for the per-row routing editor.
  const routeRows = await db
    .select()
    .from(schema.channelRoutes)
    .orderBy(asc(schema.channelRoutes.id));
  const routesByChannel = new Map<number, RouteRow[]>();
  for (const r of routeRows) {
    const row: RouteRow = {
      id: r.id,
      scope: r.scope,
      targetId: r.targetId,
      minSeverity: r.minSeverity,
      alertKinds: r.alertKinds ?? null,
    };
    const list = routesByChannel.get(r.channelId);
    if (list) list.push(row);
    else routesByChannel.set(r.channelId, [row]);
  }

  // Monitors + groups feed the route target dropdowns.
  const monitorRows = await db
    .select({
      id: schema.monitors.id,
      name: schema.monitors.name,
      group: schema.monitors.group,
    })
    .from(schema.monitors)
    .orderBy(asc(schema.monitors.name));
  const monitors: MonitorLite[] = monitorRows;
  const groups = Array.from(
    new Set(monitorRows.map((m) => m.group).filter((g): g is string => !!g)),
  ).sort();

  // Decrypt server-side only to derive a safe preview; secrets never reach the client.
  const channels: SafeChannel[] = rows.map((c) => {
    let cfg: Record<string, unknown> = {};
    try {
      cfg = decryptSecret<Record<string, unknown>>(c.config);
    } catch {
      cfg = {};
    }
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      enabled: c.enabled,
      preview: preview(c.kind, cfg),
      config: secretFreeConfig(cfg),
      routes: routesByChannel.get(c.id) ?? [],
    };
  });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Notification channels</h1>
      <ChannelsClient initial={channels} monitors={monitors} groups={groups} />
    </div>
  );
}
