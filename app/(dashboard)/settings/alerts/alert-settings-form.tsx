"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Values {
  diskWarnPct: number;
  diskCritPct: number;
  downForMinutes: number;
  latencyWarnMs: number;
  latencyWindow: number;
  eurekaDropAlert: boolean;
  serviceGraceSeconds: number;
  componentGraceSeconds: number;
  renotifyMinutes: number;
  certWarnDays: number;
  certCritDays: number;
  retentionDays: number;
}

const cls = "field-input";

export function AlertSettingsForm({ initial }: { initial: Values }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const num =
    (key: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setV((p) => ({ ...p, [key]: Number(e.target.value) }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        if (v.diskCritPct <= v.diskWarnPct) {
          setMsg({ type: "err", text: "Critical % must be higher than warning %." });
          return;
        }
        start(async () => {
          const res = await fetch("/api/alert-settings", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(v),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            setMsg({ type: "err", text: j.error ?? "Failed" });
            return;
          }
          setMsg({ type: "ok", text: "Saved." });
          router.refresh();
        });
      }}
    >
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium mb-1">Disk usage</legend>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span>Warning at ≥ (%)</span>
            <input className={cls} type="number" min={1} max={100} value={v.diskWarnPct} onChange={num("diskWarnPct")} />
          </label>
          <label className="block text-sm">
            <span>Critical at ≥ (%)</span>
            <input className={cls} type="number" min={1} max={100} value={v.diskCritPct} onChange={num("diskCritPct")} />
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium mb-1">Availability</legend>
        <label className="block text-sm">
          <span>Open incident after DOWN for ≥ (minutes)</span>
          <input className={cls} type="number" min={0} max={1440} value={v.downForMinutes} onChange={num("downForMinutes")} />
          <span className="text-xs text-[var(--muted)]">0 = alert on first failed check (no debounce).</span>
        </label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium mb-1">Components</legend>
        <label className="block text-sm">
          <span>Grace before a DOWN / OUT_OF_SERVICE component alerts (seconds)</span>
          <input className={cls} type="number" min={0} max={86400} value={v.componentGraceSeconds} onChange={num("componentGraceSeconds")} />
          <span className="text-xs text-[var(--muted)]">
            Debounces flapping components. DOWN → critical, OUT_OF_SERVICE →
            warning. 0 = alert on the first bad check.
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium mb-1">Latency</legend>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span>Warn when p95 ≥ (ms)</span>
            <input className={cls} type="number" min={1} value={v.latencyWarnMs} onChange={num("latencyWarnMs")} />
          </label>
          <label className="block text-sm">
            <span>p95 over last N checks</span>
            <input className={cls} type="number" min={1} max={100} value={v.latencyWindow} onChange={num("latencyWindow")} />
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium mb-1">Service registry</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={v.eurekaDropAlert}
            onChange={(e) => setV((p) => ({ ...p, eurekaDropAlert: e.target.checked }))}
          />
          <span>Alert when a registered service disappears / drops to 0</span>
        </label>
        <label className="block text-sm">
          <span>Grace before marking a missing service DOWN (seconds)</span>
          <input className={cls} type="number" min={0} max={86400} value={v.serviceGraceSeconds} onChange={num("serviceGraceSeconds")} />
          <span className="text-xs text-[var(--muted)]">
            Absorbs Eureka eviction lag / transient restarts. 0 = alert on the
            first missed check.
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium mb-1">TLS certificate</legend>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span>Warn ≤ (days to expiry)</span>
            <input className={cls} type="number" min={0} max={3650} value={v.certWarnDays} onChange={num("certWarnDays")} />
          </label>
          <label className="block text-sm">
            <span>Critical ≤ (days to expiry)</span>
            <input className={cls} type="number" min={0} max={3650} value={v.certCritDays} onChange={num("certCritDays")} />
          </label>
        </div>
        <span className="text-xs text-[var(--muted)]">
          For https monitors. Alerts before (or after) the certificate expires.
        </span>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium mb-1">Renotify</legend>
        <label className="block text-sm">
          <span>Re-send a still-open critical alert every (minutes)</span>
          <input className={cls} type="number" min={0} max={10080} value={v.renotifyMinutes} onChange={num("renotifyMinutes")} />
          <span className="text-xs text-[var(--muted)]">
            Reminders keep firing until the incident resolves. A warning that
            escalates to critical re-alerts immediately. 0 = notify once only.
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium mb-1">Data retention</legend>
        <label className="block text-sm">
          <span>Keep check history for (days)</span>
          <input className={cls} type="number" min={0} max={3650} value={v.retentionDays} onChange={num("retentionDays")} />
          <span className="text-xs text-[var(--muted)]">
            Older checks (and their component/disk/service snapshots) are pruned
            hourly. 0 = keep forever.
          </span>
        </label>
      </fieldset>

      {msg && (
        <p className={msg.type === "ok" ? "text-sm text-emerald-600" : "text-sm text-red-600"}>
          {msg.text}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : "Save thresholds"}
      </button>
    </form>
  );
}
