"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Pencil,
  Server,
  KeyRound,
  Plug,
  Copy,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { MetricChart } from "./metric-chart";
import { computeTrend } from "@/lib/metric-trend";

type Op = "gt" | "gte" | "lt" | "lte";
const OP_SYMBOL: Record<Op, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤" };

type Mode = "instant" | "sustained" | "delta" | "rate";
const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: "instant", label: "Instant", hint: "current value" },
  { value: "sustained", label: "Sustained", hint: "breached for the whole window" },
  { value: "delta", label: "Delta", hint: "change over the window" },
  { value: "rate", label: "Rate", hint: "per-second change over the window" },
];

type AuthType = "none" | "basic" | "header" | "bearer";

export interface Source {
  id: number;
  label: string;
  url: string;
  authType: AuthType | null;
  authUsername: string | null;
  authHeaderName: string | null;
  hasAuthSecret: boolean;
}

interface SrcForm {
  id: number | "new";
  label: string;
  url: string;
  authType: AuthType;
  authUsername: string;
  authHeaderName: string;
  authHeaderValue: string; // blank on edit = keep the stored secret
  hasAuthSecret: boolean;
}

const EMPTY_SRC: Omit<SrcForm, "id"> = {
  label: "",
  url: "",
  authType: "none",
  authUsername: "",
  authHeaderName: "",
  authHeaderValue: "",
  hasAuthSecret: false,
};

export interface Rule {
  id: number;
  sourceId: number | null;
  label: string;
  metricName: string;
  labelMatchers: Record<string, string> | null;
  operator: Op;
  mode: Mode;
  windowSeconds: number | null;
  warnValue: number | null;
  critValue: number | null;
  enabled: boolean;
}
type Series = Record<number, { t: number; value: number }[]>;

function fmtMatchers(m: Record<string, string> | null): string {
  return m ? Object.entries(m).map(([k, v]) => `${k}=${v}`).join(", ") : "";
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
function fmtWindow(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "";
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

// The value a rule is actually judged on: raw latest for instant, the derived
// scalar for a trend mode. Mirrors the server so the badge matches what fires.
function derive(
  rule: Rule,
  data: { t: number; value: number }[],
): { value: number | null; sev: "critical" | "warning" | null; warming: boolean } {
  if (data.length === 0) return { value: null, sev: null, warming: false };
  if (rule.mode === "instant" || !rule.windowSeconds) {
    const v = data[data.length - 1].value;
    return { value: v, sev: severityOf(rule, v), warming: false };
  }
  const series = data.map((d) => ({ at: d.t, value: d.value }));
  const trend = computeTrend(series, rule.mode, rule.windowSeconds * 1000, rule.operator);
  if (trend.insufficient) return { value: null, sev: null, warming: true };
  const v = Math.round(trend.value * 1000) / 1000;
  return { value: v, sev: severityOf(rule, v), warming: false };
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

const EMPTY_RULE = {
  sourceId: 0,
  label: "",
  metricName: "",
  matchers: "",
  operator: "gt" as Op,
  mode: "instant" as Mode,
  windowMin: "", // minutes; blank for instant
  warnValue: "",
  critValue: "",
};
type RuleForm = typeof EMPTY_RULE & { id: number | "new" };

export function MetricRulesClient({
  monitorId,
  sources,
  initial,
  series,
}: {
  monitorId: number;
  sources: Source[];
  initial: Rule[];
  series: Series;
}) {
  const router = useRouter();
  const base = `/api/monitors/${monitorId}`;

  // --- sources ---
  const [srcForm, setSrcForm] = useState<SrcForm | null>(null);
  const [sample, setSample] = useState<{ sourceId: number; text: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  // Which endpoint's clone/copy target-picker is open (source id), keyed by intent.
  const [copyAllFor, setCopyAllFor] = useState<number | null>(null);
  const [cloneFor, setCloneFor] = useState<number | null>(null); // rule id
  const [srcTest, setSrcTest] = useState<{
    loading: boolean;
    ok?: boolean;
    status?: number;
    error?: string;
    preview?: string;
  } | null>(null);

  const toggleCollapse = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const saveSource = async () => {
    if (!srcForm || !srcForm.label.trim() || !srcForm.url.trim()) return;
    const isNew = srcForm.id === "new";
    const body: Record<string, unknown> = {
      label: srcForm.label.trim(),
      url: srcForm.url.trim(),
      authType: srcForm.authType,
      authUsername: srcForm.authType === "basic" ? srcForm.authUsername.trim() || null : null,
      authHeaderName: srcForm.authType === "header" ? srcForm.authHeaderName.trim() || null : null,
    };
    const secret = srcForm.authHeaderValue;
    if (srcForm.authType === "none") body.authHeaderValue = null;
    else if (secret !== "" || isNew) body.authHeaderValue = secret || null;
    const path = isNew ? `${base}/metric-sources` : `${base}/metric-sources/${srcForm.id}`;
    const res = await fetch(path, {
      method: isNew ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setSrcForm(null);
      router.refresh();
    }
  };
  const deleteSource = async (s: Source) => {
    const n = initial.filter((r) => r.sourceId === s.id).length;
    const msg = n
      ? `Delete “${s.label}” and its ${n} rule${n === 1 ? "" : "s"}?`
      : `Delete “${s.label}”?`;
    if (!confirm(msg)) return;
    await fetch(`${base}/metric-sources/${s.id}`, { method: "DELETE" });
    router.refresh();
  };
  const fetchSample = async (s: Source) => {
    setSample({ sourceId: s.id, text: "…" });
    const res = await fetch(`${base}/metric-sources/${s.id}/sample`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setSample({ sourceId: s.id, text: typeof j.body === "string" ? j.body : JSON.stringify(j, null, 2) });
  };
  const editSource = (s: Source) => {
    setSrcTest(null);
    setSrcForm({
      id: s.id,
      label: s.label,
      url: s.url,
      authType: s.authType ?? "none",
      authUsername: s.authUsername ?? "",
      authHeaderName: s.authHeaderName ?? "",
      authHeaderValue: "",
      hasAuthSecret: s.hasAuthSecret,
    });
  };

  const testEndpoint = async () => {
    if (!srcForm || !srcForm.url.trim()) return;
    setSrcTest({ loading: true });
    const keepStored =
      srcForm.id !== "new" &&
      srcForm.hasAuthSecret &&
      srcForm.authType !== "none" &&
      srcForm.authHeaderValue === "";
    try {
      const res = keepStored
        ? await fetch(`${base}/metric-sources/${srcForm.id}/sample`, { method: "POST" })
        : await fetch("/api/monitors/sample", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              url: srcForm.url.trim(),
              method: "GET",
              authType: srcForm.authType,
              authUsername: srcForm.authType === "basic" ? srcForm.authUsername.trim() : undefined,
              authHeaderName: srcForm.authType === "header" ? srcForm.authHeaderName.trim() : undefined,
              authHeaderValue: srcForm.authType === "none" ? undefined : srcForm.authHeaderValue,
            }),
          });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSrcTest({ loading: false, error: j.error ?? `request rejected (HTTP ${res.status})` });
      } else if (j.fetchError) {
        setSrcTest({ loading: false, error: j.fetchError });
      } else {
        setSrcTest({
          loading: false,
          ok: !!j.ok,
          status: j.status,
          preview: typeof j.body === "string" ? j.body.slice(0, 600) : undefined,
        });
      }
    } catch (e) {
      setSrcTest({ loading: false, error: (e as Error).message });
    }
  };

  // --- rules ---
  const [ruleForm, setRuleForm] = useState<RuleForm | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const openNewRule = (sourceId: number) => {
    setErr(null);
    setRuleForm({ ...EMPTY_RULE, id: "new", sourceId });
  };
  const openEditRule = (r: Rule) => {
    setErr(null);
    setRuleForm({
      id: r.id,
      sourceId: r.sourceId ?? sources[0]?.id ?? 0,
      label: r.label,
      metricName: r.metricName,
      matchers: fmtMatchers(r.labelMatchers),
      operator: r.operator,
      mode: r.mode,
      windowMin: r.windowSeconds ? String(r.windowSeconds / 60) : "",
      warnValue: r.warnValue?.toString() ?? "",
      critValue: r.critValue?.toString() ?? "",
    });
  };
  const saveRule = async () => {
    if (!ruleForm) return;
    setErr(null);
    if (!ruleForm.sourceId) return setErr("Pick an endpoint.");
    if (!ruleForm.label.trim() || !ruleForm.metricName.trim())
      return setErr("Label and metric name are required.");
    const isTrend = ruleForm.mode !== "instant";
    const winMin = Number(ruleForm.windowMin);
    if (isTrend && (!ruleForm.windowMin.trim() || !(winMin > 0)))
      return setErr("A trend mode needs a positive window (minutes).");
    const body = {
      sourceId: ruleForm.sourceId,
      label: ruleForm.label.trim(),
      metricName: ruleForm.metricName.trim(),
      labelMatchers: parseMatchers(ruleForm.matchers),
      operator: ruleForm.operator,
      mode: ruleForm.mode,
      windowSeconds: isTrend ? Math.round(winMin * 60) : null,
      warnValue: ruleForm.warnValue.trim() === "" ? null : Number(ruleForm.warnValue),
      critValue: ruleForm.critValue.trim() === "" ? null : Number(ruleForm.critValue),
    };
    const path = ruleForm.id === "new" ? `${base}/metric-rules` : `${base}/metric-rules/${ruleForm.id}`;
    const res = await fetch(path, {
      method: ruleForm.id === "new" ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "Save failed");
      return;
    }
    setRuleForm(null);
    router.refresh();
  };
  const deleteRule = async (id: number) => {
    if (!confirm("Delete this metric rule?")) return;
    await fetch(`${base}/metric-rules/${id}`, { method: "DELETE" });
    router.refresh();
  };
  const cloneRule = async (ruleId: number, targetSourceId: number) => {
    setCloneFor(null);
    await fetch(`${base}/metric-rules/${ruleId}/clone`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetSourceId }),
    });
    router.refresh();
  };
  const copyAllRules = async (sourceId: number, targetSourceId: number) => {
    setCopyAllFor(null);
    await fetch(`${base}/metric-sources/${sourceId}/clone-rules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetSourceId }),
    });
    router.refresh();
  };

  const others = (sourceId: number) => sources.filter((s) => s.id !== sourceId);
  const orphanRules = initial.filter((r) => r.sourceId == null || !sources.some((s) => s.id === r.sourceId));

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--muted)]">
        Scrape one or more Prometheus endpoints on this service and alert on their
        metrics. Each endpoint carries its own auth and its own rules; leave auth on{" "}
        <span className="font-mono text-xs">None</span> to reuse the monitor&apos;s
        credentials. A breach opens a{" "}
        <span className="font-mono text-xs">metric</span> incident; the monitor stays UP.
      </p>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-1.5">
          <Server className="w-4 h-4" /> Endpoints{" "}
          <span className="text-[var(--muted)] font-normal">
            · {sources.length} · {initial.length} rule{initial.length === 1 ? "" : "s"}
          </span>
        </h3>
        <button
          type="button"
          className="btn btn-ghost text-sm"
          onClick={() => {
            setSrcTest(null);
            setSrcForm({ ...EMPTY_SRC, id: "new" });
          }}
        >
          <Plus className="w-4 h-4" /> Add endpoint
        </button>
      </div>

      {srcForm && (
        <div className="card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-3">
            <label className="block text-sm">
              <span>Label</span>
              <input className="field-input" value={srcForm.label} onChange={(e) => setSrcForm({ ...srcForm, label: e.target.value })} placeholder="billing-svc" />
            </label>
            <label className="block text-sm">
              <span>Prometheus URL</span>
              <input className="field-input" value={srcForm.url} onChange={(e) => setSrcForm({ ...srcForm, url: e.target.value })} placeholder="https://billing/actuator/prometheus" />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span>Authentication</span>
              <select className="field-input" value={srcForm.authType} onChange={(e) => setSrcForm({ ...srcForm, authType: e.target.value as AuthType })}>
                <option value="none">None (inherit monitor)</option>
                <option value="header">Custom header</option>
                <option value="bearer">Bearer token</option>
                <option value="basic">Basic auth</option>
              </select>
            </label>
            {srcForm.authType === "header" && (
              <label className="block text-sm">
                <span>Header name</span>
                <input className="field-input" value={srcForm.authHeaderName} onChange={(e) => setSrcForm({ ...srcForm, authHeaderName: e.target.value })} placeholder="X-Metrics-Token" />
              </label>
            )}
            {srcForm.authType === "basic" && (
              <label className="block text-sm">
                <span>Username</span>
                <input className="field-input" value={srcForm.authUsername} onChange={(e) => setSrcForm({ ...srcForm, authUsername: e.target.value })} placeholder="user" autoComplete="off" />
              </label>
            )}
            {srcForm.authType !== "none" && (
              <label className="block text-sm">
                <span>{srcForm.authType === "header" ? "Header value" : srcForm.authType === "bearer" ? "Token" : "Password"}</span>
                <input className="field-input" type="password" value={srcForm.authHeaderValue} onChange={(e) => setSrcForm({ ...srcForm, authHeaderValue: e.target.value })} placeholder={srcForm.hasAuthSecret ? "•••••• (unchanged)" : "secret"} autoComplete="off" />
              </label>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <button type="button" onClick={saveSource} className="btn btn-primary">Save</button>
            <button type="button" onClick={testEndpoint} disabled={!srcForm.url.trim() || srcTest?.loading} className="btn btn-ghost">
              <Plug className="w-4 h-4" /> {srcTest?.loading ? "Testing…" : "Test"}
            </button>
            <button type="button" onClick={() => { setSrcForm(null); setSrcTest(null); }} className="btn btn-ghost">Cancel</button>
          </div>
          {srcTest && !srcTest.loading && (
            <div className="space-y-2">
              {srcTest.error ? (
                <p className="text-sm text-red-600 flex items-center gap-1.5"><XCircle className="w-4 h-4 shrink-0" /> Could not reach endpoint: {srcTest.error}</p>
              ) : srcTest.ok ? (
                <p className="text-sm text-emerald-600 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 shrink-0" /> Reached — HTTP {srcTest.status}</p>
              ) : (
                <p className="text-sm text-amber-600 flex items-center gap-1.5"><XCircle className="w-4 h-4 shrink-0" /> HTTP {srcTest.status} — reachable, but the request was rejected (check auth).</p>
              )}
              {srcTest.preview && (
                <pre className="max-h-40 overflow-auto rounded-lg border border-[var(--border)] bg-black/[0.03] dark:bg-white/[0.04] p-2.5 text-xs">{srcTest.preview}</pre>
              )}
            </div>
          )}
        </div>
      )}

      {sources.length === 0 && (
        <p className="text-sm text-[var(--muted)]">No endpoints yet. Add one to start.</p>
      )}

      {/* One group per endpoint: header + its nested rules + scoped add-rule. */}
      <div className="space-y-3">
        {sources.map((s) => {
          const rules = initial.filter((r) => r.sourceId === s.id);
          const isCollapsed = collapsed.has(s.id);
          const dupUrl = sources.some((o) => o.id !== s.id && o.url === s.url);
          return (
            <div key={s.id} className="card overflow-hidden p-0">
              {/* endpoint header */}
              <div className="flex items-center gap-2 px-4 py-3 bg-black/[0.02] dark:bg-white/[0.02]">
                <button type="button" onClick={() => toggleCollapse(s.id)} className="btn btn-ghost px-1 py-1" aria-label={isCollapsed ? "Expand" : "Collapse"}>
                  <ChevronRight className={`w-4 h-4 transition-transform ${isCollapsed ? "" : "rotate-90"}`} />
                </button>
                <span className="font-medium">{s.label}</span>
                {s.authType && s.authType !== "none" && (
                  <span className="badge badge-muted inline-flex items-center gap-1"><KeyRound className="w-3 h-3" /> {s.authType}</span>
                )}
                <span className="badge badge-muted">{rules.length} rule{rules.length === 1 ? "" : "s"}</span>
                <span className="font-mono text-xs text-[var(--muted)] ml-1 truncate hidden sm:inline">{s.url}</span>
                <div className="ml-auto flex items-center gap-1 shrink-0 relative">
                  {rules.length > 0 && others(s.id).length > 0 && (
                    <div className="relative">
                      <button type="button" onClick={() => setCopyAllFor(copyAllFor === s.id ? null : s.id)} className="btn btn-ghost text-xs px-2 py-1" title="Copy all rules to another endpoint">
                        <Copy className="w-3.5 h-3.5" /> Copy {rules.length}
                      </button>
                      {copyAllFor === s.id && (
                        <TargetMenu title={`Copy ${rules.length} rules to`} sources={others(s.id)} onPick={(t) => copyAllRules(s.id, t)} onClose={() => setCopyAllFor(null)} />
                      )}
                    </div>
                  )}
                  <button type="button" onClick={() => fetchSample(s)} className="btn btn-ghost text-xs px-2 py-1">Sample</button>
                  <button type="button" onClick={() => editSource(s)} className="btn btn-ghost px-2 py-1" aria-label="Edit endpoint"><Pencil className="w-4 h-4" /></button>
                  <button type="button" onClick={() => deleteSource(s)} className="btn btn-ghost px-2 py-1" aria-label="Delete endpoint"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>

              {dupUrl && !isCollapsed && (
                <p className="mx-4 mt-3 text-xs text-amber-600 flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5 shrink-0" /> Another endpoint scrapes this same URL — usually a mistake.
                </p>
              )}

              {!isCollapsed && (
                <div className="px-4 py-3 space-y-3">
                  {sample && sample.sourceId === s.id && (
                    <pre className="max-h-56 overflow-auto rounded-lg border border-[var(--border)] bg-black/[0.03] dark:bg-white/[0.04] p-3 text-xs">{sample.text || "(empty)"}</pre>
                  )}

                  {rules.length === 0 && ruleForm?.sourceId !== s.id && (
                    <p className="text-sm text-[var(--muted)]">No rules on this endpoint yet.</p>
                  )}

                  {rules.map((r) => {
                    const data = series[r.id] ?? [];
                    const d = derive(r, data);
                    const sevBadge = d.sev === "critical" ? "badge-down" : d.sev === "warning" ? "badge-warn" : "badge-up";
                    return (
                      <div key={r.id} className="rounded-lg border border-[var(--border)] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{r.label}</span>
                              {r.mode !== "instant" && (
                                <span className="badge badge-muted">{r.mode} {fmtWindow(r.windowSeconds)}</span>
                              )}
                              {!r.enabled && <span className="badge badge-muted">disabled</span>}
                              {d.warming ? (
                                <span className="badge badge-muted">warming up</span>
                              ) : data.length > 0 ? (
                                <span className={`badge ${sevBadge}`}>{d.sev ?? "ok"}</span>
                              ) : null}
                            </div>
                            <div className="text-xs text-[var(--muted)] mt-0.5 font-mono truncate">
                              {r.mode === "delta" ? "Δ " : r.mode === "rate" ? "rate " : ""}
                              {r.metricName}
                              {r.labelMatchers ? `{${fmtMatchers(r.labelMatchers)}}` : ""} {OP_SYMBOL[r.operator]}{" "}
                              <span className="text-amber-600">{r.warnValue ?? "—"}</span>/
                              <span className="text-red-600">{r.critValue ?? "—"}</span>
                              {r.mode !== "instant" ? ` over ${fmtWindow(r.windowSeconds)}` : ""}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-right">
                              <div className="text-lg font-semibold tabular-nums leading-none">{d.value !== null ? d.value : "—"}</div>
                              <div className="text-[10px] text-[var(--muted)]">{r.mode === "rate" ? "/s" : r.mode === "delta" ? `Δ ${fmtWindow(r.windowSeconds)}` : "current"}</div>
                            </span>
                            {others(s.id).length > 0 && (
                              <div className="relative">
                                <button type="button" onClick={() => setCloneFor(cloneFor === r.id ? null : r.id)} className="btn btn-ghost px-2 py-1" aria-label="Duplicate to another endpoint" title="Duplicate to another endpoint"><Copy className="w-4 h-4" /></button>
                                {cloneFor === r.id && (
                                  <TargetMenu title={`Duplicate “${r.label}” to`} sources={others(s.id)} onPick={(t) => cloneRule(r.id, t)} onClose={() => setCloneFor(null)} />
                                )}
                              </div>
                            )}
                            <button type="button" onClick={() => openEditRule(r)} className="btn btn-ghost px-2 py-1" aria-label="Edit"><Pencil className="w-4 h-4" /></button>
                            <button type="button" onClick={() => deleteRule(r.id)} className="btn btn-ghost px-2 py-1" aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                        {data.length > 0 ? <div className="mt-3"><MetricChart data={data} /></div> : <p className="text-xs text-[var(--muted)] mt-2">No samples yet.</p>}
                      </div>
                    );
                  })}

                  {ruleForm && ruleForm.sourceId === s.id ? (
                    <RuleFormCard s={s} ruleForm={ruleForm} setRuleForm={setRuleForm} onSave={saveRule} onCancel={() => setRuleForm(null)} err={err} />
                  ) : (
                    <button type="button" onClick={() => openNewRule(s.id)} className="btn btn-ghost w-full justify-center text-sm border border-dashed border-[var(--border)]">
                      <Plus className="w-4 h-4" /> Add rule to {s.label}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {orphanRules.length > 0 && (
        <p className="text-xs text-[var(--muted)]">
          {orphanRules.length} rule{orphanRules.length === 1 ? "" : "s"} have no endpoint and never fire — edit them to assign a source.
        </p>
      )}
    </div>
  );
}

/** Small target-endpoint picker rendered under a clone/copy button. */
function TargetMenu({
  title,
  sources,
  onPick,
  onClose,
}: {
  title: string;
  sources: Source[];
  onPick: (targetSourceId: number) => void;
  onClose: () => void;
}) {
  return (
    <>
      <button type="button" aria-hidden className="fixed inset-0 z-10 cursor-default" onClick={onClose} tabIndex={-1} />
      <div className="absolute right-0 top-[calc(100%+4px)] z-20 w-56 card p-1.5 shadow-lg">
        <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)] px-2 py-1.5">{title}</div>
        {sources.map((t) => (
          <button key={t.id} type="button" onClick={() => onPick(t.id)} className="btn btn-ghost w-full justify-start text-sm px-2 py-1.5">
            {t.label}
          </button>
        ))}
      </div>
    </>
  );
}

/** The scoped add/edit rule form, including trend mode + window + live preview. */
function RuleFormCard({
  s,
  ruleForm,
  setRuleForm,
  onSave,
  onCancel,
  err,
}: {
  s: Source;
  ruleForm: RuleForm;
  setRuleForm: (f: RuleForm) => void;
  onSave: () => void;
  onCancel: () => void;
  err: string | null;
}) {
  const isTrend = ruleForm.mode !== "instant";
  const win = isTrend && ruleForm.windowMin ? `${ruleForm.windowMin}m` : "";
  const preview = `${ruleForm.mode === "delta" ? "Δ " : ruleForm.mode === "rate" ? "rate " : ""}${ruleForm.metricName || "metric"} ${OP_SYMBOL[ruleForm.operator]} ${ruleForm.warnValue || "—"} / ${ruleForm.critValue || "—"}${isTrend ? ` — ${ruleForm.mode} ${win}` : ""}`;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-black/[0.02] dark:bg-white/[0.02] p-4 space-y-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
        {ruleForm.id === "new" ? `New rule for ${s.label}` : `Edit rule`}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-sm">
          <span>Display name</span>
          <input className="field-input" value={ruleForm.label} onChange={(e) => setRuleForm({ ...ruleForm, label: e.target.value })} placeholder="Heap after GC" />
        </label>
        <label className="block text-sm">
          <span>Metric name</span>
          <input className="field-input font-mono text-xs" value={ruleForm.metricName} onChange={(e) => setRuleForm({ ...ruleForm, metricName: e.target.value })} placeholder="jvm_memory_usage_after_gc" />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span>Label matchers (optional)</span>
          <input className="field-input font-mono text-xs" value={ruleForm.matchers} onChange={(e) => setRuleForm({ ...ruleForm, matchers: e.target.value })} placeholder="pool=long-lived" />
        </label>
        <label className="block text-sm">
          <span>Mode</span>
          <select className="field-input" value={ruleForm.mode} onChange={(e) => setRuleForm({ ...ruleForm, mode: e.target.value as Mode })}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label} — {m.hint}</option>
            ))}
          </select>
        </label>
        {isTrend && (
          <label className="block text-sm">
            <span>Window (minutes)</span>
            <input className="field-input" type="number" min="1" value={ruleForm.windowMin} onChange={(e) => setRuleForm({ ...ruleForm, windowMin: e.target.value })} placeholder="10" />
          </label>
        )}
        <label className="block text-sm">
          <span>Operator</span>
          <select className="field-input" value={ruleForm.operator} onChange={(e) => setRuleForm({ ...ruleForm, operator: e.target.value as Op })}>
            <option value="gt">&gt; greater than</option>
            <option value="gte">≥ at least</option>
            <option value="lt">&lt; less than</option>
            <option value="lte">≤ at most</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span>Warn at</span>
            <input className="field-input" type="number" value={ruleForm.warnValue} onChange={(e) => setRuleForm({ ...ruleForm, warnValue: e.target.value })} placeholder="opt." />
          </label>
          <label className="block text-sm">
            <span>Critical at</span>
            <input className="field-input" type="number" value={ruleForm.critValue} onChange={(e) => setRuleForm({ ...ruleForm, critValue: e.target.value })} placeholder="opt." />
          </label>
        </div>
      </div>
      <p className="font-mono text-xs text-[var(--muted)] rounded-md border border-[var(--border)] px-3 py-2 truncate">{preview}</p>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onSave} className="btn btn-primary">Save rule</button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">Cancel</button>
      </div>
    </div>
  );
}
