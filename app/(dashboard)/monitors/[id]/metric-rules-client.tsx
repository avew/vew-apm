"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, Server, KeyRound, Plug, CheckCircle2, XCircle } from "lucide-react";
import { MetricChart } from "./metric-chart";

type Op = "gt" | "gte" | "lt" | "lte";
const OP_SYMBOL: Record<Op, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤" };

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
  warnValue: "",
  critValue: "",
};

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
  // Result of the in-form "Test" button (verify the URL + auth before saving).
  const [srcTest, setSrcTest] = useState<{
    loading: boolean;
    ok?: boolean;
    status?: number;
    error?: string;
    preview?: string;
  } | null>(null);

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
    // Secret: send only when typed. Blank on edit keeps the stored value; blank
    // on create / when auth is "none" clears it.
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
  const deleteSource = async (id: number) => {
    if (!confirm("Delete this source and its rules?")) return;
    await fetch(`${base}/metric-sources/${id}`, { method: "DELETE" });
    router.refresh();
  };
  // Scrape server-side (uses the stored secret) so the token never round-trips.
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

  // Hit the endpoint with the values currently in the form — before saving — so
  // the operator can confirm the URL + credentials actually reach it.
  const testEndpoint = async () => {
    if (!srcForm || !srcForm.url.trim()) return;
    setSrcTest({ loading: true });
    // Editing an existing source whose stored secret is left blank (= keep):
    // test via the saved source so the stored secret is used server-side.
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
              authUsername:
                srcForm.authType === "basic" ? srcForm.authUsername.trim() : undefined,
              authHeaderName:
                srcForm.authType === "header" ? srcForm.authHeaderName.trim() : undefined,
              authHeaderValue:
                srcForm.authType === "none" ? undefined : srcForm.authHeaderValue,
            }),
          });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Our own route rejected the request (e.g. invalid URL).
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
  const [ruleForm, setRuleForm] = useState<
    (typeof EMPTY_RULE & { id: number | "new" }) | null
  >(null);
  const [err, setErr] = useState<string | null>(null);

  const openNewRule = () => {
    setErr(null);
    setRuleForm({ ...EMPTY_RULE, id: "new", sourceId: sources[0]?.id ?? 0 });
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
      warnValue: r.warnValue?.toString() ?? "",
      critValue: r.critValue?.toString() ?? "",
    });
  };
  const saveRule = async () => {
    if (!ruleForm) return;
    setErr(null);
    if (!ruleForm.sourceId) return setErr("Pick a source.");
    if (!ruleForm.label.trim() || !ruleForm.metricName.trim())
      return setErr("Label and metric name are required.");
    const body = {
      sourceId: ruleForm.sourceId,
      label: ruleForm.label.trim(),
      metricName: ruleForm.metricName.trim(),
      labelMatchers: parseMatchers(ruleForm.matchers),
      operator: ruleForm.operator,
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

  const sourceLabel = (id: number | null) => sources.find((s) => s.id === id)?.label ?? "—";

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--muted)]">
        Scrape Prometheus endpoints (one or more) and alert on metrics. Each
        endpoint can carry its own auth header; leave it on{" "}
        <span className="font-mono text-xs">None</span> to reuse the
        monitor&apos;s credentials. A breach opens a{" "}
        <span className="font-mono text-xs">metric</span> incident; the monitor stays UP.
      </p>

      {/* Sources */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium flex items-center gap-1.5">
            <Server className="w-4 h-4" /> Endpoints
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
                <select
                  className="field-input"
                  value={srcForm.authType}
                  onChange={(e) => setSrcForm({ ...srcForm, authType: e.target.value as AuthType })}
                >
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
                  <span>
                    {srcForm.authType === "header"
                      ? "Header value"
                      : srcForm.authType === "bearer"
                        ? "Token"
                        : "Password"}
                  </span>
                  <input
                    className="field-input"
                    type="password"
                    value={srcForm.authHeaderValue}
                    onChange={(e) => setSrcForm({ ...srcForm, authHeaderValue: e.target.value })}
                    placeholder={srcForm.hasAuthSecret ? "•••••• (unchanged)" : "secret"}
                    autoComplete="off"
                  />
                </label>
              )}
            </div>

            <div className="flex gap-2 items-center">
              <button type="button" onClick={saveSource} className="btn btn-primary">Save</button>
              <button
                type="button"
                onClick={testEndpoint}
                disabled={!srcForm.url.trim() || srcTest?.loading}
                className="btn btn-ghost"
              >
                <Plug className="w-4 h-4" /> {srcTest?.loading ? "Testing…" : "Test"}
              </button>
              <button type="button" onClick={() => { setSrcForm(null); setSrcTest(null); }} className="btn btn-ghost">Cancel</button>
            </div>

            {srcTest && !srcTest.loading && (
              <div className="space-y-2">
                {srcTest.error ? (
                  <p className="text-sm text-red-600 flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 shrink-0" /> Could not reach endpoint: {srcTest.error}
                  </p>
                ) : srcTest.ok ? (
                  <p className="text-sm text-emerald-600 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" /> Reached — HTTP {srcTest.status}
                  </p>
                ) : (
                  <p className="text-sm text-amber-600 flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 shrink-0" /> HTTP {srcTest.status} — reachable, but the request was rejected (check auth).
                  </p>
                )}
                {srcTest.preview && (
                  <pre className="max-h-40 overflow-auto rounded-lg border border-[var(--border)] bg-black/[0.03] dark:bg-white/[0.04] p-2.5 text-xs">
                    {srcTest.preview}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}

        {sources.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No endpoints yet. Add one to start.</p>
        ) : (
          <ul className="text-sm divide-y divide-[var(--border)]">
            {sources.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <span className="font-medium">{s.label}</span>
                  {s.authType && s.authType !== "none" && (
                    <span className="badge badge-muted ml-2 inline-flex items-center gap-1">
                      <KeyRound className="w-3 h-3" /> {s.authType}
                    </span>
                  )}
                  <span className="font-mono text-xs text-[var(--muted)] ml-2 truncate">{s.url}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => fetchSample(s)} className="btn btn-ghost text-xs px-2 py-1">Sample</button>
                  <button type="button" onClick={() => editSource(s)} className="btn btn-ghost px-2 py-1" aria-label="Edit"><Pencil className="w-4 h-4" /></button>
                  <button type="button" onClick={() => deleteSource(s.id)} className="btn btn-ghost px-2 py-1" aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {sample && (
          <pre className="max-h-56 overflow-auto rounded-lg border border-[var(--border)] bg-black/[0.03] dark:bg-white/[0.04] p-3 text-xs">
            {sample.text || "(empty)"}
          </pre>
        )}
      </div>

      {/* Rules */}
      <div className="space-y-3 border-t border-[var(--border)] pt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Metric rules</h3>
          <button
            type="button"
            className="btn btn-primary text-sm"
            onClick={openNewRule}
            disabled={sources.length === 0}
          >
            <Plus className="w-4 h-4" /> Add rule
          </button>
        </div>

        {ruleForm && (
          <div className="card p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-sm">
                <span>Endpoint (source)</span>
                <select className="field-input" value={ruleForm.sourceId} onChange={(e) => setRuleForm({ ...ruleForm, sourceId: Number(e.target.value) })}>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span>Label</span>
                <input className="field-input" value={ruleForm.label} onChange={(e) => setRuleForm({ ...ruleForm, label: e.target.value })} placeholder="Heap memory" />
              </label>
              <label className="block text-sm">
                <span>Metric name</span>
                <input className="field-input" value={ruleForm.metricName} onChange={(e) => setRuleForm({ ...ruleForm, metricName: e.target.value })} placeholder="jvm_memory_used_bytes" />
              </label>
              <label className="block text-sm">
                <span>Label matchers (optional)</span>
                <input className="field-input" value={ruleForm.matchers} onChange={(e) => setRuleForm({ ...ruleForm, matchers: e.target.value })} placeholder="area=heap, id=Old Gen" />
              </label>
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
            {err && <p className="text-sm text-red-600">{err}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={saveRule} className="btn btn-primary">Save rule</button>
              <button type="button" onClick={() => setRuleForm(null)} className="btn btn-ghost">Cancel</button>
            </div>
          </div>
        )}

        {initial.length === 0 && !ruleForm && (
          <p className="text-sm text-[var(--muted)]">
            {sources.length === 0 ? "Add an endpoint first, then metric rules." : "No metric rules yet."}
          </p>
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
                      <span className="badge badge-muted">{sourceLabel(r.sourceId)}</span>
                      {!r.enabled && <span className="badge badge-muted">disabled</span>}
                      {current !== null && <span className={`badge ${sevBadge}`}>{sev ?? "ok"}</span>}
                    </div>
                    <div className="text-xs text-[var(--muted)] mt-0.5 font-mono truncate">
                      {r.metricName}
                      {r.labelMatchers ? `{${fmtMatchers(r.labelMatchers)}}` : ""} {OP_SYMBOL[r.operator]}{" "}
                      {r.warnValue ?? "—"}/{r.critValue ?? "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-right">
                      <div className="text-lg font-semibold tabular-nums leading-none">{current !== null ? current : "—"}</div>
                      <div className="text-[10px] text-[var(--muted)]">current</div>
                    </span>
                    <button type="button" onClick={() => openEditRule(r)} className="btn btn-ghost px-2 py-1" aria-label="Edit"><Pencil className="w-4 h-4" /></button>
                    <button type="button" onClick={() => deleteRule(r.id)} className="btn btn-ghost px-2 py-1" aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {data.length > 0 ? (
                  <div className="mt-3"><MetricChart data={data} /></div>
                ) : (
                  <p className="text-xs text-[var(--muted)] mt-2">No samples yet.</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
