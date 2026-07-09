"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MaintenanceWindow } from "@/lib/db/schema";
import { Trash2 } from "lucide-react";

const cls = "field-input";

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MaintenanceClient({
  monitors,
  windows,
}: {
  monitors: { id: number; name: string }[];
  windows: MaintenanceWindow[];
}) {
  const router = useRouter();
  const now = new Date();
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"global" | "monitor">("global");
  const [monitorId, setMonitorId] = useState<number | "">(
    monitors[0]?.id ?? "",
  );
  const [startsAt, setStartsAt] = useState(toLocalInputValue(now));
  const [endsAt, setEndsAt] = useState(toLocalInputValue(in1h));
  const [recurrence, setRecurrence] =
    useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="card p-4">
        <h2 className="font-medium mb-2">Create window</h2>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await fetch("/api/maintenance", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  name,
                  scope,
                  monitorId: scope === "monitor" && monitorId !== "" ? monitorId : null,
                  startsAt: new Date(startsAt).toISOString(),
                  endsAt: new Date(endsAt).toISOString(),
                  recurrence,
                  reason: reason || undefined,
                }),
              });
              if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                setError(j.error ?? "Failed");
                return;
              }
              setName("");
              setReason("");
              router.refresh();
            });
          }}
        >
          <label className="block text-sm">
            <span>Name</span>
            <input className={cls} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="block text-sm">
            <span>Scope</span>
            <select className={cls} value={scope} onChange={(e) => setScope(e.target.value as "global" | "monitor")}>
              <option value="global">Global (all monitors)</option>
              <option value="monitor">Single monitor</option>
            </select>
          </label>
          {scope === "monitor" && (
            <label className="block text-sm">
              <span>Monitor</span>
              <select
                className={cls}
                value={monitorId === "" ? "" : String(monitorId)}
                onChange={(e) => setMonitorId(e.target.value ? Number(e.target.value) : "")}
                required
              >
                <option value="" disabled>Choose one…</option>
                {monitors.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span>Starts at</span>
              <input className={cls} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
            </label>
            <label className="block text-sm">
              <span>Ends at</span>
              <input className={cls} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
            </label>
          </div>
          <label className="block text-sm">
            <span>Recurrence</span>
            <select className={cls} value={recurrence} onChange={(e) => setRecurrence(e.target.value as typeof recurrence)}>
              <option value="none">One-off</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label className="block text-sm">
            <span>Reason (optional)</span>
            <input className={cls} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="btn btn-primary"
          >
            {pending ? "Saving…" : "Create window"}
          </button>
        </form>
      </section>

      <section className="card p-4">
        <h2 className="font-medium mb-2">Existing windows</h2>
        {windows.length === 0 && (
          <p className="text-sm text-neutral-500">None yet.</p>
        )}
        <ul className="divide-y">
          {windows.map((w) => (
            <WindowRow key={w.id} window={w} monitors={monitors} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function WindowRow({
  window: w,
  monitors,
}: {
  window: MaintenanceWindow;
  monitors: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const monitorName =
    w.scope === "monitor"
      ? monitors.find((m) => m.id === w.monitorId)?.name ?? `#${w.monitorId}`
      : "global";
  return (
    <li className="py-2 flex items-center justify-between gap-2">
      <div>
        <div className="text-sm font-medium">
          {w.name}{" "}
          <span className="text-neutral-500 font-normal">
            · {monitorName} · {w.recurrence}
          </span>
        </div>
        <div className="text-xs text-neutral-500">
          {new Date(w.startsAt).toLocaleString()} →{" "}
          {new Date(w.endsAt).toLocaleString()}
        </div>
        {w.reason && <div className="text-xs text-neutral-500">{w.reason}</div>}
      </div>
      <button
        disabled={pending}
        onClick={() => {
          if (!confirm("Delete window?")) return;
          start(async () => {
            await fetch(`/api/maintenance/${w.id}`, { method: "DELETE" });
            router.refresh();
          });
        }}
        className="btn btn-danger !px-2 !py-1 text-xs"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </li>
  );
}
