"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Stats {
  dbBytes: number;
  walBytes: number;
  totalBytes: number;
  reclaimableBytes: number;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function DataSettingsForm({
  retentionDays: initialRetention,
  stats: initialStats,
}: {
  retentionDays: number;
  stats: Stats;
}) {
  const [retention, setRetention] = useState(initialRetention);
  const [stats, setStats] = useState(initialStats);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [savePending, startSave] = useTransition();
  const [vacPending, setVacPending] = useState(false);
  const router = useRouter();

  const save = () => {
    setMsg(null);
    startSave(async () => {
      const res = await fetch("/api/data-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ retentionDays: retention }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMsg({ type: "err", text: j.error ?? "Failed" });
        return;
      }
      setMsg({ type: "ok", text: "Saved." });
      router.refresh();
    });
  };

  const reclaim = async () => {
    setMsg(null);
    setVacPending(true);
    try {
      const res = await fetch("/api/data-settings/vacuum", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ type: "err", text: j.error ?? "Vacuum failed" });
        return;
      }
      setStats(j.after as Stats);
      setMsg({
        type: "ok",
        text: `Reclaimed ${fmtBytes(j.reclaimedBytes ?? 0)}.`,
      });
      router.refresh();
    } finally {
      setVacPending(false);
    }
  };

  return (
    <div className="space-y-8">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium mb-1">Data retention</legend>
          <label className="block text-sm">
            <span>Keep check history for (days)</span>
            <input
              className="field-input"
              type="number"
              min={0}
              max={3650}
              value={retention}
              onChange={(e) => setRetention(Number(e.target.value))}
            />
            <span className="text-xs text-[var(--muted)]">
              Checks older than this — and their component / disk / service
              snapshots — are pruned hourly. Shorter = smaller, faster database.
              0 = keep forever.
            </span>
          </label>
        </fieldset>
        <button type="submit" disabled={savePending} className="btn btn-primary">
          {savePending ? "Saving…" : "Save retention"}
        </button>
      </form>

      <section className="space-y-3 border-t border-[var(--border)] pt-6">
        <div className="text-sm font-medium">Database size</div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm max-w-sm">
          <dt className="text-[var(--muted)]">On disk (db)</dt>
          <dd className="text-right tabular-nums">{fmtBytes(stats.dbBytes)}</dd>
          <dt className="text-[var(--muted)]">Write-ahead log</dt>
          <dd className="text-right tabular-nums">{fmtBytes(stats.walBytes)}</dd>
          <dt className="text-[var(--muted)]">Reclaimable</dt>
          <dd className="text-right tabular-nums">
            {fmtBytes(stats.reclaimableBytes)}
          </dd>
          <dt className="font-medium">Total</dt>
          <dd className="text-right tabular-nums font-medium">
            {fmtBytes(stats.totalBytes)}
          </dd>
        </dl>
        <div className="pt-1">
          <button
            type="button"
            onClick={reclaim}
            disabled={vacPending}
            className="btn btn-ghost"
          >
            {vacPending ? "Reclaiming…" : "Reclaim space (VACUUM)"}
          </button>
          <p className="text-xs text-[var(--muted)] mt-2 max-w-md">
            Rewrites the database without pruned free pages and truncates the WAL,
            shrinking the file on disk. Briefly locks the database — run it during
            a quiet period.
          </p>
        </div>
      </section>

      {msg && (
        <p
          className={
            msg.type === "ok"
              ? "text-sm text-emerald-600"
              : "text-sm text-red-600"
          }
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
