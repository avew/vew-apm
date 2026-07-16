"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Trash2, Plus, Bell, Pencil, Filter } from "lucide-react";
import { NotificationModal } from "./notification-modal";
import { RoutesEditor } from "./routes-editor";
import { useT } from "@/lib/i18n-client";

/** A routing rule row (P2), secret-free. */
export type RouteRow = {
  id: number;
  scope: string;
  targetId: string | null;
  minSeverity: string;
  alertKinds: string[] | null;
};

/** Minimal monitor shape for route target dropdowns. */
export type MonitorLite = { id: number; name: string; group: string | null };

/** Secret-free channel shape sent to the client (no token/apiKey). */
export type SafeChannel = {
  id: number;
  name: string;
  kind: string;
  enabled: boolean;
  preview: string;
  config: Record<string, unknown>;
  routes: RouteRow[];
};

export function ChannelsClient({
  initial,
  monitors,
  groups,
}: {
  initial: SafeChannel[];
  monitors: MonitorLite[];
  groups: string[];
}) {
  const [open, setOpen] = useState(false);
  const t = useT();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Channels alert on incidents. A channel fires for all monitors until you
          add routing rules to scope it by monitor, group, or severity.
        </p>
        <button
          onClick={() => setOpen(true)}
          className="btn btn-primary shrink-0"
        >
          <Plus className="w-4 h-4" /> {t("setUpNotification")}
        </button>
      </div>

      {initial.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="mx-auto w-12 h-12 grid place-items-center rounded-full bg-black/[0.05] dark:bg-white/[0.06] mb-3">
            <Bell className="w-6 h-6 text-[var(--color-brand-600)]" />
          </div>
          <p className="text-[var(--muted)]">No notification channels yet.</p>
        </div>
      ) : (
        <ul className="card divide-y divide-[var(--border)]">
          {initial.map((c) => (
            <ChannelRow
              key={c.id}
              channel={c}
              monitors={monitors}
              groups={groups}
            />
          ))}
        </ul>
      )}

      {open && <NotificationModal onClose={() => setOpen(false)} />}
    </div>
  );
}

function ChannelRow({
  channel,
  monitors,
  groups,
}: {
  channel: SafeChannel;
  monitors: MonitorLite[];
  groups: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showRoutes, setShowRoutes] = useState(false);
  const routeCount = channel.routes.length;
  return (
    <li className="p-4">
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-sm font-medium">
          {channel.name}{" "}
          <span className="badge badge-muted">{channel.kind}</span>
          {!channel.enabled && <span className="badge badge-muted ml-1">disabled</span>}
        </div>
        <div className="text-xs text-[var(--muted)] font-mono truncate max-w-md mt-0.5">
          {channel.preview}
        </div>
        {msg && <div className="text-xs text-emerald-600 mt-0.5">{msg}</div>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setShowRoutes((s) => !s)}
          title="Routing rules"
          className="btn btn-ghost !px-2 !py-1 text-xs"
        >
          <Filter className="w-3 h-3" />{" "}
          {routeCount > 0 ? `Routing (${routeCount})` : "All monitors"}
        </button>
        <button
          type="button"
          disabled={pending}
          title={channel.enabled ? "Enabled — click to pause" : "Disabled — click to enable"}
          onClick={() =>
            start(async () => {
              await fetch(`/api/notifications/${channel.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ enabled: !channel.enabled }),
              });
              router.refresh();
            })
          }
          className="mr-1"
        >
          <span
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              channel.enabled
                ? "bg-[var(--foreground)]"
                : "bg-neutral-300 dark:bg-neutral-700"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-[var(--surface)] transition-transform ${
                channel.enabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </span>
        </button>
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const res = await fetch(`/api/notifications/${channel.id}/test`, {
                method: "POST",
              });
              if (res.ok) setMsg("test sent");
              else {
                const j = await res.json().catch(() => ({}));
                setMsg(`error: ${j.error}`);
              }
            })
          }
          className="btn btn-ghost !px-2 !py-1 text-xs"
        >
          <Send className="w-3 h-3" /> Test
        </button>
        <button
          disabled={pending}
          onClick={() => setEditing(true)}
          className="btn btn-ghost !px-2 !py-1 text-xs"
        >
          <Pencil className="w-3 h-3" /> Edit
        </button>
        <button
          disabled={pending}
          onClick={() => {
            if (!confirm("Delete channel?")) return;
            start(async () => {
              await fetch(`/api/notifications/${channel.id}`, {
                method: "DELETE",
              });
              router.refresh();
            });
          }}
          className="btn btn-danger !px-2 !py-1 text-xs"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      </div>
      {showRoutes && (
        <RoutesEditor
          channelId={channel.id}
          routes={channel.routes}
          monitors={monitors}
          groups={groups}
        />
      )}
      {editing && (
        <NotificationModal edit={channel} onClose={() => setEditing(false)} />
      )}
    </li>
  );
}
