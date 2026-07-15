import { getDb, schema } from "@/lib/db/client";
import { desc } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";
import { ChannelsClient, type SafeChannel } from "./channels-client";

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
  return "";
}

// Strip secret fields so the edit form can prefill the rest without them ever
// reaching the browser.
const SECRET_KEYS = new Set(["botToken", "apiKey", "authHeaderValue"]);
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
    };
  });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Notification channels</h1>
      <ChannelsClient initial={channels} />
    </div>
  );
}
