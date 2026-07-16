"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function MonitorForm() {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [intervalSeconds, setInterval] = useState(60);
  const [timeoutMs, setTimeoutMs] = useState(10000);
  const [authType, setAuthType] = useState<"none" | "basic" | "header" | "bearer">("none");
  const [authUsername, setAuthUsername] = useState("");
  const [authHeaderName, setAuthName] = useState("");
  const [authHeaderValue, setAuthValue] = useState("");
  const [group, setGroup] = useState("");
  const [type, setType] = useState<"actuator" | "http" | "json" | "prometheus">(
    "actuator",
  );
  const [expectStatus, setExpectStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [statusPath, setStatusPath] = useState("$.status");
  const [statusUpValue, setStatusUpValue] = useState("");
  const [sample, setSample] = useState<
    { status?: number; body?: string; error?: string } | null
  >(null);
  const [sampling, setSampling] = useState(false);
  const [showOverrides, setShowOverrides] = useState(false);

  async function fetchSample() {
    if (!url.trim()) return;
    setSample(null);
    setSampling(true);
    try {
      const res = await fetch("/api/monitors/sample", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          method: "GET",
          authType,
          authUsername: authUsername || undefined,
          authHeaderName: authHeaderName || undefined,
          authHeaderValue: authHeaderValue || undefined,
        }),
      });
      const j = await res.json();
      setSample(j.fetchError ? { error: j.fetchError } : { status: j.status, body: j.body });
    } catch (e) {
      setSample({ error: String(e) });
    } finally {
      setSampling(false);
    }
  }
  const [ov, setOv] = useState({
    diskWarnPct: "",
    diskCritPct: "",
    downForMinutes: "",
    latencyWarnMs: "",
    latencyWindow: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const ovNum = (s: string) => (s.trim() === "" ? undefined : Number(s));

  return (
    <form
      className="space-y-4 card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const body = {
            name,
            url,
            intervalSeconds,
            timeoutMs,
            authType,
            authUsername: authType === "basic" ? authUsername || undefined : undefined,
            authHeaderName: authType === "header" ? authHeaderName || undefined : undefined,
            authHeaderValue:
              authType !== "none" ? authHeaderValue || undefined : undefined,
            group: group.trim() || undefined,
            type,
            expectStatus: type === "http" ? expectStatus.trim() || undefined : undefined,
            keyword:
              type === "http" || type === "json" ? keyword.trim() || undefined : undefined,
            statusPath: type === "json" ? statusPath.trim() || undefined : undefined,
            statusUpValue: type === "json" ? statusUpValue.trim() || undefined : undefined,
            diskWarnPct: ovNum(ov.diskWarnPct),
            diskCritPct: ovNum(ov.diskCritPct),
            downForMinutes: ovNum(ov.downForMinutes),
            latencyWarnMs: ovNum(ov.latencyWarnMs),
            latencyWindow: ovNum(ov.latencyWindow),
          };
          const res = await fetch("/api/monitors", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            setError(j.error ?? "Failed to create");
            return;
          }
          router.push("/");
          router.refresh();
        });
      }}
    >
      <Field label="Name">
        <input
          className="field-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>
      <Field label="Health URL">
        <input
          className="field-input"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://api.example.com/actuator/health"
          required
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Interval (seconds)">
          <input
            className="field-input"
            type="number"
            min={10}
            value={intervalSeconds}
            onChange={(e) => setInterval(Number(e.target.value))}
          />
        </Field>
        <Field label="Timeout (ms)">
          <input
            className="field-input"
            type="number"
            min={500}
            value={timeoutMs}
            onChange={(e) => setTimeoutMs(Number(e.target.value))}
          />
        </Field>
      </div>
      <Field label="Check type">
        <select
          className="field-input"
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
        >
          <option value="actuator">Spring actuator (parse health tree)</option>
          <option value="http">HTTP (up = 2xx, optional keyword)</option>
          <option value="json">JSON (status from a path you pick)</option>
          <option value="prometheus">Prometheus (scrape metrics + threshold rules)</option>
        </select>
      </Field>

      {type === "http" && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Expected status (optional)">
            <input className="field-input" value={expectStatus} onChange={(e) => setExpectStatus(e.target.value)} placeholder="2xx · or 200 · or 200-204" />
          </Field>
          <Field label="Body must contain (optional)">
            <input className="field-input" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. pong" />
          </Field>
        </div>
      )}

      {type === "json" && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Status path">
            <input className="field-input" value={statusPath} onChange={(e) => setStatusPath(e.target.value)} placeholder="$.status" />
          </Field>
          <Field label="UP when value = (blank = healthy words)">
            <input className="field-input" value={statusUpValue} onChange={(e) => setStatusUpValue(e.target.value)} placeholder="UP / ok / green …" />
          </Field>
          <Field label="Body must contain (optional)">
            <input className="field-input" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="optional" />
          </Field>
        </div>
      )}

      {type === "prometheus" && (
        <p className="text-xs text-[var(--muted)] -mt-2">
          Point the URL at a Prometheus text endpoint (e.g. <code>/actuator/prometheus</code>).
          The monitor is UP when reachable; add <strong>metric threshold rules</strong> on the
          monitor&apos;s detail page after creating it.
        </p>
      )}

      {type !== "actuator" && (
        <div className="rounded-lg border border-[var(--border)] p-3">
          <button type="button" onClick={fetchSample} disabled={!url.trim() || sampling} className="btn btn-ghost text-sm">
            {sampling ? "Fetching…" : "Fetch sample"}
          </button>
          {sample && (
            <div className="mt-2 text-xs">
              {sample.error ? (
                <p className="text-red-600">Failed: {sample.error}</p>
              ) : (
                <>
                  <p className="text-[var(--muted)]">HTTP {sample.status}</p>
                  <pre className="mt-1 max-h-64 overflow-auto rounded bg-black/[0.04] dark:bg-white/[0.06] p-2 font-mono text-[11px] whitespace-pre-wrap break-all">
                    {sample.body}
                  </pre>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <Field label="Group (optional)">
        <input
          className="field-input"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          placeholder="e.g. core, billing"
        />
      </Field>
      <Field label="Authentication">
        <select
          className="field-input"
          value={authType}
          onChange={(e) => setAuthType(e.target.value as typeof authType)}
        >
          <option value="none">None</option>
          <option value="basic">Basic Auth</option>
          <option value="header">Header Auth</option>
          <option value="bearer">Bearer / JWT</option>
        </select>
      </Field>
      {authType === "basic" && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Username">
            <input className="field-input" value={authUsername} onChange={(e) => setAuthUsername(e.target.value)} />
          </Field>
          <Field label="Password">
            <input className="field-input" type="password" value={authHeaderValue} onChange={(e) => setAuthValue(e.target.value)} />
          </Field>
        </div>
      )}
      {authType === "header" && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Header name">
            <input className="field-input" value={authHeaderName} onChange={(e) => setAuthName(e.target.value)} placeholder="X-API-Key" />
          </Field>
          <Field label="Header value">
            <input className="field-input" type="password" value={authHeaderValue} onChange={(e) => setAuthValue(e.target.value)} />
          </Field>
        </div>
      )}
      {authType === "bearer" && (
        <Field label="Token">
          <input className="field-input" type="password" value={authHeaderValue} onChange={(e) => setAuthValue(e.target.value)} placeholder="JWT / bearer token" />
        </Field>
      )}

      <div className="border-t border-[var(--border)] pt-3">
        <button
          type="button"
          onClick={() => setShowOverrides((s) => !s)}
          className="text-sm text-[var(--color-brand-600)] hover:underline"
        >
          {showOverrides ? "− Hide" : "+ "}Alert threshold overrides
        </button>
        {showOverrides && (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-[var(--muted)]">
              Blank = inherit global defaults (Settings → Alerts).
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Disk warning ≥ (%)">
                <input className="field-input" type="number" min={1} max={100} value={ov.diskWarnPct} onChange={(e) => setOv((p) => ({ ...p, diskWarnPct: e.target.value }))} placeholder="inherit" />
              </Field>
              <Field label="Disk critical ≥ (%)">
                <input className="field-input" type="number" min={1} max={100} value={ov.diskCritPct} onChange={(e) => setOv((p) => ({ ...p, diskCritPct: e.target.value }))} placeholder="inherit" />
              </Field>
              <Field label="Down for ≥ (min)">
                <input className="field-input" type="number" min={0} value={ov.downForMinutes} onChange={(e) => setOv((p) => ({ ...p, downForMinutes: e.target.value }))} placeholder="inherit" />
              </Field>
              <Field label="Latency warn ≥ (ms)">
                <input className="field-input" type="number" min={1} value={ov.latencyWarnMs} onChange={(e) => setOv((p) => ({ ...p, latencyWarnMs: e.target.value }))} placeholder="inherit" />
              </Field>
              <Field label="Latency window (checks)">
                <input className="field-input" type="number" min={1} max={100} value={ov.latencyWindow} onChange={(e) => setOv((p) => ({ ...p, latencyWindow: e.target.value }))} placeholder="inherit" />
              </Field>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary"
      >
        {pending ? "Saving…" : "Create monitor"}
      </button>

    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="text-neutral-700 dark:text-neutral-300">{label}</span>
      <div>{children}</div>
    </label>
  );
}
