"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Overrides {
  diskWarnPct: number | null;
  diskCritPct: number | null;
  downForMinutes: number | null;
  latencyWarnMs: number | null;
  latencyWindow: number | null;
  eurekaDropAlert: boolean | null;
  serviceGraceSeconds: number | null;
  componentGraceSeconds: number | null;
  renotifyMinutes: number | null;
}

interface Globals {
  diskWarnPct: number;
  diskCritPct: number;
  downForMinutes: number;
  latencyWarnMs: number;
  latencyWindow: number;
  eurekaDropAlert: boolean;
  serviceGraceSeconds: number;
  componentGraceSeconds: number;
  renotifyMinutes: number;
}

const cls = "field-input";

export function OverrideForm({
  monitorId,
  current,
  globals,
  onSaved,
}: {
  monitorId: number;
  current: Overrides;
  globals: Globals;
  onSaved?: () => void;
}) {
  const toStr = (v: number | null) => (v == null ? "" : String(v));
  const [diskWarnPct, setDiskWarn] = useState(toStr(current.diskWarnPct));
  const [diskCritPct, setDiskCrit] = useState(toStr(current.diskCritPct));
  const [downForMinutes, setDown] = useState(toStr(current.downForMinutes));
  const [latencyWarnMs, setLat] = useState(toStr(current.latencyWarnMs));
  const [latencyWindow, setWin] = useState(toStr(current.latencyWindow));
  const [serviceGrace, setGrace] = useState(toStr(current.serviceGraceSeconds));
  const [componentGrace, setCompGrace] = useState(toStr(current.componentGraceSeconds));
  const [renotify, setRenotify] = useState(toStr(current.renotifyMinutes));
  const [eureka, setEureka] = useState<string>(
    current.eurekaDropAlert == null ? "" : current.eurekaDropAlert ? "on" : "off",
  );
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        const dw = numOrNull(diskWarnPct);
        const dc = numOrNull(diskCritPct);
        if (dw != null && dc != null && dc <= dw) {
          setMsg({ type: "err", text: "Critical % must exceed warning %." });
          return;
        }
        start(async () => {
          const res = await fetch(`/api/monitors/${monitorId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              diskWarnPct: dw,
              diskCritPct: dc,
              downForMinutes: numOrNull(downForMinutes),
              latencyWarnMs: numOrNull(latencyWarnMs),
              latencyWindow: numOrNull(latencyWindow),
              serviceGraceSeconds: numOrNull(serviceGrace),
              componentGraceSeconds: numOrNull(componentGrace),
              renotifyMinutes: numOrNull(renotify),
              eurekaDropAlert:
                eureka === "" ? null : eureka === "on" ? true : false,
            }),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            setMsg({ type: "err", text: j.error ?? "Failed" });
            return;
          }
          setMsg({ type: "ok", text: "Overrides saved." });
          router.refresh();
          onSaved?.();
        });
      }}
    >
      <p className="text-xs text-[var(--muted)]">
        Blank = inherit global default (shown as placeholder). Set a value to
        override just this monitor.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span>Disk warning ≥ (%)</span>
          <input className={cls} type="number" min={1} max={100} value={diskWarnPct}
            placeholder={`inherit · ${globals.diskWarnPct}`}
            onChange={(e) => setDiskWarn(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span>Disk critical ≥ (%)</span>
          <input className={cls} type="number" min={1} max={100} value={diskCritPct}
            placeholder={`inherit · ${globals.diskCritPct}`}
            onChange={(e) => setDiskCrit(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span>Down for ≥ (min)</span>
          <input className={cls} type="number" min={0} value={downForMinutes}
            placeholder={`inherit · ${globals.downForMinutes}`}
            onChange={(e) => setDown(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span>Latency warn ≥ (ms)</span>
          <input className={cls} type="number" min={1} value={latencyWarnMs}
            placeholder={`inherit · ${globals.latencyWarnMs}`}
            onChange={(e) => setLat(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span>Latency window (checks)</span>
          <input className={cls} type="number" min={1} max={100} value={latencyWindow}
            placeholder={`inherit · ${globals.latencyWindow}`}
            onChange={(e) => setWin(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span>Service grace (sec)</span>
          <input className={cls} type="number" min={0} value={serviceGrace}
            placeholder={`inherit · ${globals.serviceGraceSeconds}`}
            onChange={(e) => setGrace(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span>Component grace (sec)</span>
          <input className={cls} type="number" min={0} value={componentGrace}
            placeholder={`inherit · ${globals.componentGraceSeconds}`}
            onChange={(e) => setCompGrace(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span>Renotify (min)</span>
          <input className={cls} type="number" min={0} value={renotify}
            placeholder={`inherit · ${globals.renotifyMinutes}`}
            onChange={(e) => setRenotify(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span>Service down alert</span>
          <select className={cls} value={eureka} onChange={(e) => setEureka(e.target.value)}>
            <option value="">inherit · {globals.eurekaDropAlert ? "on" : "off"}</option>
            <option value="on">on</option>
            <option value="off">off</option>
          </select>
        </label>
      </div>
      {msg && (
        <p className={msg.type === "ok" ? "text-sm text-emerald-600" : "text-sm text-red-600"}>
          {msg.text}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : "Save overrides"}
      </button>
    </form>
  );
}
