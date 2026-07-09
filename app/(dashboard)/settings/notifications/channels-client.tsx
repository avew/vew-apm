"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NotificationChannel } from "@/lib/db/schema";
import { Send, Trash2, Plus, Bell } from "lucide-react";
import { NotificationModal } from "./notification-modal";

export function ChannelsClient({
  initial,
}: {
  initial: NotificationChannel[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Channels alert on incidents. Unlinked channels broadcast to every
          monitor; linked ones fire only for their monitors.
        </p>
        <button
          onClick={() => setOpen(true)}
          className="btn btn-primary shrink-0"
        >
          <Plus className="w-4 h-4" /> Set Up Notification
        </button>
      </div>

      {initial.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="mx-auto w-12 h-12 grid place-items-center rounded-full bg-[var(--color-brand-50)] dark:bg-[rgb(79_107_237/0.12)] mb-3">
            <Bell className="w-6 h-6 text-[var(--color-brand-600)]" />
          </div>
          <p className="text-[var(--muted)]">No notification channels yet.</p>
        </div>
      ) : (
        <ul className="card divide-y divide-[var(--border)]">
          {initial.map((c) => (
            <ChannelRow key={c.id} channel={c} />
          ))}
        </ul>
      )}

      {open && <NotificationModal onClose={() => setOpen(false)} />}
    </div>
  );
}

function ChannelRow({ channel }: { channel: NotificationChannel }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <li className="p-4 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-sm font-medium">
          {channel.name}{" "}
          <span className="badge badge-muted">{channel.kind}</span>
          {!channel.enabled && <span className="badge badge-muted ml-1">disabled</span>}
        </div>
        <div className="text-xs text-[var(--muted)] font-mono truncate max-w-md mt-0.5">
          {JSON.stringify(channel.config).slice(0, 120)}
        </div>
        {msg && <div className="text-xs text-emerald-600 mt-0.5">{msg}</div>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
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
    </li>
  );
}
