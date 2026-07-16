"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil } from "lucide-react";
import { MetricChart } from "./metric-chart";

type Op = "gt" | "gte" | "lt" | "lte";
const OP_SYMBOL: Record<Op, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤" };

export interface Rule {
  id: number;
  label: string;
  metricName: string;
  labelMatchers: Record<string, string> | null;
  operator: Op;
  warnValue: number | null;
  critValue: number | null;
  enabled: boolean;
}

type Series = Record<number, { t: number; value: number }[]>;

function fmtMatchers(m: Record<string, string> | null): string {
  if (!m) return "";
  return Object.entries(m)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}
function parseMatchers(s: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const pair of s.split(",").map((x) => x.trim()).filter(Boolean)) {
    const i = pair.indexOf("=");
    if (i <= 0) continue;
    out[pair.slice(0, i).trim()] = pair.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return Object.keys(out).length ? out : null;
}

function breach(value: number, op: Op, t: number): boolean {
  return op === "gt" ? value > t : op === "gte" ? value >= t : op === "lt" ? value < t : value <= t;
}
function severityOf(rule: Rule, value: number | null): "critical" | "warning" | null {
  if (value === null) return null;
  if (rule.critValue !== null && breach(value, rule.operator, rule.critValue)) return "critical";
  if (rule.warnValue !== null && breach(value, rule.operator, rule.warnValue)) return "warning";
  return null;
}

const EMPTY = {
  label: "",
  metricName: "",
  matchers: "",
  operator: "gt" as Op,
  warnValue: "",
  critValue: "",
};

export function MetricRulesClient({
  monitorId,
  url,
  initial,
  series,
}: {
  monitorId: number;
  url: string;
  initial: Rule[];
  series: Series;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sample, setSample] = useState<string | null>(null);
  const [sampling, setSampling] = useState(false);

  const openNew = () => {
    setForm({ ...EMPTY });
    setEditing("new");
    setErr(null);
  };
  const openEdit = (r: Rule) => {
    setForm({
      label: r.label,
      metricName: r.metricName,
      matchers: fmtMatchers(r.labelMatchers),
      operator: r.operator,
      warnValue: r.warnValue?.toString() ?? "",
      critValue: r.critValue?.toString() ?? "",
    });
    setEditing(r.id);
    setErr(null);
  };

  const save = async () => {
    setErr(null);
    if (!form.label.trim() || !form.metricName.trim()) {
      setErr("Label and metric name are required.");
      return;
    }
    const body = {
      label: form.label.trim(),
      metricName: form.metricName.trim(),
      labelMatchers: parseMatchers(form.matchers),
      operator: form.operator,
      warnValue: form.warnValue.trim() === "" ? null : Number(form.warnValue),
      critValue: form.critValue.trim() === "" ? null : Number(form.critValue),
    };
    setPending(true);
    try {
      const path =
        editing === "new"
          ? `/api/monitors/${monitorId}/metric-rules`
          : `/api/monitors/${monitorId}/metric-rules/${editing}`;
      const res = await fetch(path, {
        method: editing === "new" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? "Save failed");
        return;
      }
      setEditing(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this metric rule?")) return;
    await fetch(`/api/monitors/${monitorId}/metric-rules/${id}`, { method: "DELETE" });
    router.refresh();
  };

  const fetchSample = async () => {
    setSampling(true);
    setSample(null);
    try {
      const res = await fetch("/api/monitors/sample", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, method: "GET" }),
      });
      const j = await res.json().catch(() => ({}));
      setSample(typeof j.body === "string" ? j.body : JSON.stringify(j, null, 2));
    } finally {
      setSampling(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Threshold rules on scraped Prometheus metrics. A breach opens a{" "}
          <span className="font-mono text-xs">metric</span> incident; the monitor stays UP.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={fetchSample} disabled={sampling} className="btn btn-ghost text-sm">
            {sampling ? "Fetching…" : "Fetch sample"}
          </button>
          <button type="button" onClick={openNew} className="btn btn-primary text-sm">
            <Plus className="w-4 h-4" /> Add rule
          </button>
        </div>
      </div>

      {sample !== null && (
        <pre className="max-h-64 overflow-auto rounded-lg border border-[var(--border)] bg-black/[0.03] dark:bg-white/[0.04] p-3 text-xs">
          {sample || "(empty)"}
        </pre>
      )}

      {editing !== null && (
        <div className="card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span>Label</span>
              <input className="field-input" value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} placeholder="Heap memory" />
            </label>
            <label className="block text-sm">
              <span>Metric name</span>
              <input className="field-input" value={form.metricName} onChange={(e) => setForm((p) => ({ ...p, metricName: e.target.value }))} placeholder="jvm_memory_used_bytes" />
            </label>
            <label className="block text-sm">
              <span>Label matchers (optional)</span>
              <input className="field-input" value={form.matchers} onChange={(e) => setForm((p) => ({ ...p, matchers: e.target.value }))} placeholder='area=heap, id=Old Gen' />
            </label>
            <label className="block text-sm">
              <span>Operator</span>
              <select className="field-input" value={form.operator} onChange={(e) => setForm((p) => ({ ...p, operator: e.target.value as Op }))}>
                <option value="gt">&gt; greater than</option>
                <option value="gte">≥ at least</option>
                <option value="lt">&lt; less than</option>
                <option value="lte">≤ at most</option>
              </select>
            </label>
            <label className="block text-sm">
              <span>Warn at (optional)</span>
              <input className="field-input" type="number" value={form.warnValue} onChange={(e) => setForm((p) => ({ ...p, warnValue: e.target.value }))} placeholder="e.g. 1.2e9" />
            </label>
            <label className="block text-sm">
              <span>Critical at (optional)</span>
              <input className="field-input" type="number" value={form.critValue} onChange={(e) => setForm((p) => ({ ...p, critValue: e.target.value }))} placeholder="e.g. 1.5e9" />
            </label>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex items-center gap-2">
            <button type="button" onClick={save} disabled={pending} className="btn btn-primary">
              {pending ? "Saving…" : "Save rule"}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="btn btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      )}

      {initial.length === 0 && editing === null && (
        <p className="text-sm text-[var(--muted)]">No metric rules yet.</p>
      )}

      <div className="space-y-4">
        {initial.map((r) => {
          const data = series[r.id] ?? [];
          const current = data.length ? data[data.length - 1].value : null;
          const sev = severityOf(r, current);
          const sevBadge = sev === "critical" ? "badge-down" : sev === "warning" ? "badge-warn" : "badge-up";
          return (
            <div key={r.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{r.label}</span>
                    {!r.enabled && <span className="badge badge-muted">disabled</span>}
                    {current !== null && (
                      <span className={`badge ${sevBadge}`}>
                        {sev ?? "ok"}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--muted)] mt-0.5 font-mono truncate">
                    {r.metricName}
                    {r.labelMatchers ? `{${fmtMatchers(r.labelMatchers)}}` : ""} {OP_SYMBOL[r.operator]}{" "}
                    {r.warnValue ?? "—"}/{r.critValue ?? "—"}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-right">
                    <div className="text-lg font-semibold tabular-nums leading-none">
                      {current !== null ? current : "—"}
                    </div>
                    <div className="text-[10px] text-[var(--muted)]">current</div>
                  </span>
                  <button type="button" onClick={() => openEdit(r)} className="btn btn-ghost px-2 py-1" aria-label="Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => remove(r.id)} className="btn btn-ghost px-2 py-1" aria-label="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {data.length > 0 ? (
                <div className="mt-3">
                  <MetricChart data={data} />
                </div>
              ) : (
                <p className="text-xs text-[var(--muted)] mt-2">No samples yet.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
