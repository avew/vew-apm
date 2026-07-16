"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type { RouteRow, MonitorLite } from "./channels-client";

const cls = "field-input !mt-1";

const ALERT_KINDS: { value: string; label: string }[] = [
  { value: "availability", label: "Availability" },
  { value: "latency", label: "Latency" },
  { value: "disk", label: "Disk" },
  { value: "component_down", label: "Component" },
  { value: "eureka", label: "Eureka" },
  { value: "service_missing", label: "Service missing" },
  { value: "cert_expiry", label: "Cert expiry" },
  { value: "metric", label: "Metric" },
];

function describe(r: RouteRow, monitors: MonitorLite[]): string {
  let scope = "All monitors";
  if (r.scope === "group") scope = `Group “${r.targetId}”`;
  else if (r.scope === "monitor") {
    const m = monitors.find((x) => String(x.id) === String(r.targetId));
    scope = m ? m.name : `Monitor #${r.targetId}`;
  }
  const sev = r.minSeverity === "critical" ? "≥ critical" : "≥ warning";
  const kinds =
    r.alertKinds && r.alertKinds.length > 0
      ? r.alertKinds.join(", ")
      : "all alerts";
  return `${scope} · ${sev} · ${kinds}`;
}

export function RoutesEditor({
  channelId,
  routes,
  monitors,
  groups,
}: {
  channelId: number;
  routes: RouteRow[];
  monitors: MonitorLite[];
  groups: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [scope, setScope] = useState<"all" | "group" | "monitor">("all");
  const [targetId, setTargetId] = useState("");
  const [minSeverity, setMinSeverity] = useState<"warning" | "critical">("warning");
  const [kinds, setKinds] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  function toggleKind(k: string) {
    setKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  }

  function resetForm() {
    setScope("all");
    setTargetId("");
    setMinSeverity("warning");
    setKinds([]);
    setErr(null);
    setAdding(false);
  }

  function addRoute() {
    setErr(null);
    if (scope !== "all" && !targetId) {
      setErr(`Pick a ${scope} target.`);
      return;
    }
    start(async () => {
      const res = await fetch(`/api/notifications/${channelId}/routes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope,
          targetId: scope === "all" ? null : targetId,
          minSeverity,
          alertKinds: kinds.length > 0 ? kinds : null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? "Failed to add rule");
        return;
      }
      resetForm();
      router.refresh();
    });
  }

  function removeRoute(routeId: number) {
    start(async () => {
      await fetch(`/api/notifications/${channelId}/routes/${routeId}`, {
        method: "DELETE",
      });
      router.refresh();
    });
  }

  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] p-3 space-y-3">
      <div className="text-xs text-[var(--muted)]">
        {routes.length === 0
          ? "No rules — this channel fires for every monitor. Add a rule to scope it."
          : "This channel fires only when at least one rule matches."}
      </div>

      {routes.length > 0 && (
        <ul className="space-y-1">
          {routes.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="font-mono truncate">{describe(r, monitors)}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => removeRoute(r.id)}
                className="btn btn-ghost !px-2 !py-1 shrink-0"
                aria-label="Remove rule"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="space-y-3 border-t border-[var(--border)] pt-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs">
              <span className="font-medium">Scope</span>
              <select
                className={cls}
                value={scope}
                onChange={(e) => {
                  setScope(e.target.value as typeof scope);
                  setTargetId("");
                }}
              >
                <option value="all">All monitors</option>
                <option value="group">Group</option>
                <option value="monitor">Single monitor</option>
              </select>
            </label>
            <label className="block text-xs">
              <span className="font-medium">Minimum severity</span>
              <select
                className={cls}
                value={minSeverity}
                onChange={(e) => setMinSeverity(e.target.value as typeof minSeverity)}
              >
                <option value="warning">Warning &amp; up</option>
                <option value="critical">Critical only</option>
              </select>
            </label>
          </div>

          {scope === "group" && (
            <label className="block text-xs">
              <span className="font-medium">Group</span>
              <select
                className={cls}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                <option value="">Select a group…</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          )}
          {scope === "monitor" && (
            <label className="block text-xs">
              <span className="font-medium">Monitor</span>
              <select
                className={cls}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                <option value="">Select a monitor…</option>
                {monitors.map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div>
            <span className="text-xs font-medium">Alert kinds</span>
            <span className="text-xs text-[var(--muted)]"> (none = all)</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {ALERT_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => toggleKind(k.value)}
                  className={`badge ${
                    kinds.includes(k.value)
                      ? "!bg-[var(--color-brand-600)] !text-white"
                      : "badge-muted"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          {err && <p className="text-xs text-red-600">{err}</p>}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="btn btn-ghost !px-3 !py-1 text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={addRoute}
              className="btn btn-primary !px-3 !py-1 text-xs"
            >
              {pending ? "…" : "Add rule"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="btn btn-ghost !px-2 !py-1 text-xs"
        >
          <Plus className="w-3 h-3" /> Add routing rule
        </button>
      )}
    </div>
  );
}
