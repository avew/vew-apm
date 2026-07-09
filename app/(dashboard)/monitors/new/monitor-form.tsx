"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function MonitorForm() {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [intervalSeconds, setInterval] = useState(60);
  const [timeoutMs, setTimeoutMs] = useState(10000);
  const [authHeaderName, setAuthName] = useState("");
  const [authHeaderValue, setAuthValue] = useState("");
  const [showOverrides, setShowOverrides] = useState(false);
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
            authHeaderName: authHeaderName || undefined,
            authHeaderValue: authHeaderValue || undefined,
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
      <div className="grid grid-cols-2 gap-4">
        <Field label="Auth header name (optional)">
          <input
            className="field-input"
            value={authHeaderName}
            onChange={(e) => setAuthName(e.target.value)}
            placeholder="Authorization"
          />
        </Field>
        <Field label="Auth header value (optional)">
          <input
            className="field-input"
            value={authHeaderValue}
            onChange={(e) => setAuthValue(e.target.value)}
            placeholder="Bearer …"
          />
        </Field>
      </div>

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
