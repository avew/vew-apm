"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import type { MonitorService } from "@/lib/db/schema";

function ago(d: Date | string) {
  const t = new Date(d).getTime();
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// A service is only meaningfully "up" if it appeared in the most recent check.
// If the latest check failed (gateway unreachable), previously-present services
// are "stale" — we can't confirm them, so don't show a green UP.
function serviceState(
  s: MonitorService,
  latestCheckAt: number | null,
): "up" | "down" | "stale" {
  if (!s.present) return "down";
  if (latestCheckAt == null) return "up";
  const seen = new Date(s.lastSeenAt).getTime();
  return seen >= latestCheckAt - 5000 ? "up" : "stale";
}

export function ServiceRegistry({
  monitorId,
  services,
  latestCheckAt,
}: {
  monitorId: number;
  services: MonitorService[];
  latestCheckAt: number | null;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const states = services.map((s) => serviceState(s, latestCheckAt));
  const upCount = states.filter((x) => x === "up").length;
  const staleCount = states.filter((x) => x === "stale").length;
  const downCount = services.filter(
    (s, i) => s.tracked && states[i] === "down",
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
        <span>{services.length} registered</span>
        <span className="text-emerald-600 dark:text-emerald-400">
          {upCount} up
        </span>
        {staleCount > 0 && <span>{staleCount} stale</span>}
        {downCount > 0 && (
          <span className="text-red-600 dark:text-red-400 font-medium">
            {downCount} down
          </span>
        )}
      </div>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (!name.trim()) return;
          start(async () => {
            const res = await fetch(`/api/monitors/${monitorId}/services`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ serviceName: name.trim(), source: "manual" }),
            });
            if (!res.ok) {
              const j = await res.json().catch(() => ({}));
              setError(j.error ?? "Failed");
              return;
            }
            setName("");
            router.refresh();
          });
        }}
      >
        <input
          className="field-input !mt-0 flex-1"
          placeholder="Add expected service manually (e.g. admin-console-svc)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" disabled={pending} className="btn btn-ghost">
          <Plus className="w-4 h-4" /> Add
        </button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {services.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          No services recorded yet. They are auto-seeded on the first successful
          check.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[var(--muted)] border-b border-[var(--border)]">
                <th className="py-2 font-medium">Service</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Source</th>
                <th className="py-2 font-medium">Last seen</th>
                <th className="py-2 font-medium text-center">Tracked</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {services.map((s, i) => (
                <ServiceRow
                  key={s.id}
                  monitorId={monitorId}
                  service={s}
                  state={states[i]}
                  agoText={ago(s.lastSeenAt)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ServiceRow({
  monitorId,
  service: s,
  state,
  agoText,
}: {
  monitorId: number;
  service: MonitorService;
  state: "up" | "down" | "stale";
  agoText: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const badge =
    state === "up" ? "badge-up" : state === "stale" ? "badge-muted" : "badge-down";
  const label = state === "up" ? "UP" : state === "stale" ? "STALE" : "DOWN";
  return (
    <tr className={state === "down" && s.tracked ? "bg-red-50/40 dark:bg-red-950/10" : ""}>
      <td className="py-2 font-mono text-xs">{s.serviceName}</td>
      <td className="py-2">
        <span
          className={`badge ${badge}`}
          title={
            state === "stale"
              ? "Not seen in the latest check — the endpoint was unreachable, so this service's state is unknown"
              : undefined
          }
        >
          {label}
        </span>
      </td>
      <td className="py-2 text-xs text-[var(--muted)]">{s.source}</td>
      <td className="py-2 text-xs text-[var(--muted)] tabular-nums">{agoText}</td>
      <td className="py-2 text-center">
        <input
          type="checkbox"
          checked={s.tracked}
          disabled={pending}
          onChange={(e) =>
            start(async () => {
              await fetch(`/api/monitors/${monitorId}/services/${s.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ tracked: e.target.checked }),
              });
              router.refresh();
            })
          }
          title={s.tracked ? "Alerting on — click to mute" : "Muted — click to alert"}
        />
      </td>
      <td className="py-2 text-right">
        <button
          disabled={pending}
          onClick={() => {
            if (!confirm(`Remove ${s.serviceName} from registry?`)) return;
            start(async () => {
              await fetch(`/api/monitors/${monitorId}/services/${s.id}`, {
                method: "DELETE",
              });
              router.refresh();
            });
          }}
          className="btn btn-danger !px-2 !py-1 text-xs"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </td>
    </tr>
  );
}
