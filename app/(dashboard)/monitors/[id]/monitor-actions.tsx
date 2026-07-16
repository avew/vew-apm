"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  Pause,
  Pencil,
  Copy,
  Trash2,
  X,
  SlidersHorizontal,
} from "lucide-react";
import { OverrideForm } from "./override-form";
import { useT } from "@/lib/i18n-client";

type ThresholdProps = Omit<React.ComponentProps<typeof OverrideForm>, "onSaved">;

export interface CheckConfig {
  type: "actuator" | "http" | "json" | "prometheus";
  expectStatus: string | null;
  keyword: string | null;
  statusPath: string | null;
  statusUpValue: string | null;
}

// Secret (authHeaderValue) is intentionally omitted — never shipped to the client.
export interface AuthConfig {
  authType: "none" | "basic" | "header" | "bearer";
  authUsername: string | null;
  authHeaderName: string | null;
}

export function MonitorActions({
  id,
  enabled,
  name,
  url,
  intervalSeconds,
  group,
  check,
  auth,
  thresholds,
}: {
  id: number;
  enabled: boolean;
  name: string;
  url: string;
  intervalSeconds: number;
  group: string | null;
  check: CheckConfig;
  auth: AuthConfig;
  thresholds: ThresholdProps;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [thresholding, setThresholding] = useState(false);

  const t = useT();
  const call = (input: RequestInfo, init: RequestInit, after?: (j: unknown) => void) =>
    start(async () => {
      const res = await fetch(input, init);
      const j = await res.json().catch(() => ({}));
      if (res.ok) after?.(j);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        disabled={pending}
        onClick={() =>
          call(`/api/monitors/${id}/run`, { method: "POST" })
        }
        className="btn btn-ghost"
      >
        <Play className="w-4 h-4" /> {t("runCheck")}
      </button>

      <button
        disabled={pending}
        onClick={() => {
          const verb = enabled ? t("pause") : t("resume");
          if (!confirm(`${verb} — "${name}"?`)) return;
          call(`/api/monitors/${id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ enabled: !enabled }),
          });
        }}
        className="btn btn-ghost"
      >
        {enabled ? (
          <>
            <Pause className="w-4 h-4" /> {t("pause")}
          </>
        ) : (
          <>
            <Play className="w-4 h-4" /> {t("resume")}
          </>
        )}
      </button>

      <button
        disabled={pending}
        onClick={() => setEditing(true)}
        className="btn btn-ghost"
      >
        <Pencil className="w-4 h-4" /> {t("edit")}
      </button>

      <button
        disabled={pending}
        onClick={() => setThresholding(true)}
        className="btn btn-ghost"
      >
        <SlidersHorizontal className="w-4 h-4" /> {t("thresholds")}
      </button>

      <button
        disabled={pending}
        onClick={() => setCloning(true)}
        className="btn btn-ghost"
      >
        <Copy className="w-4 h-4" /> {t("clone")}
      </button>

      <button
        disabled={pending}
        onClick={() => {
          if (!confirm("Delete this monitor and all its history?")) return;
          call(`/api/monitors/${id}`, { method: "DELETE" }, () => {
            router.replace("/");
          });
        }}
        className="btn btn-danger"
      >
        <Trash2 className="w-4 h-4" /> {t("delete")}
      </button>

      {editing && (
        <EditModal
          id={id}
          name={name}
          url={url}
          intervalSeconds={intervalSeconds}
          group={group}
          check={check}
          auth={auth}
          onClose={() => setEditing(false)}
        />
      )}
      {cloning && (
        <CloneModal
          id={id}
          name={name}
          url={url}
          onClose={() => setCloning(false)}
        />
      )}
      {thresholding && (
        <ModalShell title="Alert thresholds" wide onClose={() => setThresholding(false)}>
          <p className="text-xs text-[var(--muted)] mb-3">
            Overrides for this monitor. Blank = inherit the global default.
          </p>
          <OverrideForm {...thresholds} onSaved={() => setThresholding(false)} />
        </ModalShell>
      )}
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`card w-full ${wide ? "max-w-lg" : "max-w-sm"} my-16 p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EditModal({
  id,
  name,
  url,
  intervalSeconds,
  group,
  check,
  auth,
  onClose,
}: {
  id: number;
  name: string;
  url: string;
  intervalSeconds: number;
  group: string | null;
  check: CheckConfig;
  auth: AuthConfig;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [n, setN] = useState(name);
  const [u, setU] = useState(url);
  const [iv, setIv] = useState(intervalSeconds);
  const [g, setG] = useState(group ?? "");
  const [type, setType] = useState(check.type);
  const [expectStatus, setExpectStatus] = useState(check.expectStatus ?? "");
  const [keyword, setKeyword] = useState(check.keyword ?? "");
  const [statusPath, setStatusPath] = useState(check.statusPath ?? "$.status");
  const [statusUpValue, setStatusUpValue] = useState(check.statusUpValue ?? "");
  const [authType, setAuthType] = useState(auth.authType);
  const [authUsername, setAuthUsername] = useState(auth.authUsername ?? "");
  const [authHeaderName, setAuthHeaderName] = useState(auth.authHeaderName ?? "");
  const [authValue, setAuthValue] = useState(""); // blank = keep current secret
  const [error, setError] = useState<string | null>(null);

  return (
    <ModalShell title="Edit monitor" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (!n.trim()) return setError("Name is required.");
          try {
            new URL(u.trim());
          } catch {
            return setError("Enter a valid URL.");
          }
          if (iv < 10) return setError("Interval must be ≥ 10 seconds.");
          start(async () => {
            const res = await fetch(`/api/monitors/${id}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                name: n.trim(),
                url: u.trim(),
                intervalSeconds: iv,
                group: g.trim() || null,
                type,
                expectStatus: type === "http" ? expectStatus.trim() || null : null,
                keyword:
                  type === "http" || type === "json" ? keyword.trim() || null : null,
                statusPath: type === "json" ? statusPath.trim() || null : null,
                statusUpValue: type === "json" ? statusUpValue.trim() || null : null,
                authType,
                authUsername: authType === "basic" ? authUsername.trim() || null : null,
                authHeaderName: authType === "header" ? authHeaderName.trim() || null : null,
                // omit when blank so the stored secret is kept
                ...(authValue.trim() ? { authHeaderValue: authValue.trim() } : {}),
              }),
            });
            if (!res.ok) {
              const j = await res.json().catch(() => ({}));
              setError(j.error ?? "Failed");
              return;
            }
            router.refresh();
            onClose();
          });
        }}
      >
        <label className="block text-sm">
          <span className="font-medium">Name</span>
          <input
            className="field-input !mt-1"
            value={n}
            onChange={(e) => setN(e.target.value)}
            autoFocus
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Health URL</span>
          <input
            className="field-input !mt-1"
            type="url"
            value={u}
            onChange={(e) => setU(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Interval (seconds)</span>
          <input
            className="field-input !mt-1"
            type="number"
            min={10}
            value={iv}
            onChange={(e) => setIv(Number(e.target.value))}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Group</span>
          <input
            className="field-input !mt-1"
            value={g}
            onChange={(e) => setG(e.target.value)}
            placeholder="none — e.g. core, billing"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Check type</span>
          <select
            className="field-input !mt-1"
            value={type}
            onChange={(e) => setType(e.target.value as CheckConfig["type"])}
          >
            <option value="actuator">Spring actuator</option>
            <option value="http">HTTP (2xx + keyword)</option>
            <option value="json">JSON (status path)</option>
            <option value="prometheus">Prometheus (metric rules)</option>
          </select>
        </label>
        {type === "http" && (
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="font-medium">Expected status</span>
              <input className="field-input !mt-1" value={expectStatus} onChange={(e) => setExpectStatus(e.target.value)} placeholder="2xx" />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Keyword</span>
              <input className="field-input !mt-1" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="optional" />
            </label>
          </div>
        )}
        {type === "json" && (
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="font-medium">Status path</span>
              <input className="field-input !mt-1" value={statusPath} onChange={(e) => setStatusPath(e.target.value)} placeholder="$.status" />
            </label>
            <label className="block text-sm">
              <span className="font-medium">UP when =</span>
              <input className="field-input !mt-1" value={statusUpValue} onChange={(e) => setStatusUpValue(e.target.value)} placeholder="blank = healthy" />
            </label>
          </div>
        )}

        <label className="block text-sm">
          <span className="font-medium">Authentication</span>
          <select
            className="field-input !mt-1"
            value={authType}
            onChange={(e) => setAuthType(e.target.value as AuthConfig["authType"])}
          >
            <option value="none">None</option>
            <option value="basic">Basic Auth</option>
            <option value="header">Header Auth</option>
            <option value="bearer">Bearer / JWT</option>
          </select>
        </label>
        {authType === "basic" && (
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="font-medium">Username</span>
              <input className="field-input !mt-1" value={authUsername} onChange={(e) => setAuthUsername(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Password</span>
              <input className="field-input !mt-1" type="password" value={authValue} onChange={(e) => setAuthValue(e.target.value)} placeholder="leave blank to keep" />
            </label>
          </div>
        )}
        {authType === "header" && (
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="font-medium">Header name</span>
              <input className="field-input !mt-1" value={authHeaderName} onChange={(e) => setAuthHeaderName(e.target.value)} placeholder="X-API-Key" />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Header value</span>
              <input className="field-input !mt-1" type="password" value={authValue} onChange={(e) => setAuthValue(e.target.value)} placeholder="leave blank to keep" />
            </label>
          </div>
        )}
        {authType === "bearer" && (
          <label className="block text-sm">
            <span className="font-medium">Token</span>
            <input className="field-input !mt-1" type="password" value={authValue} onChange={(e) => setAuthValue(e.target.value)} placeholder="leave blank to keep" />
          </label>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function CloneModal({
  id,
  name,
  url,
  onClose,
}: {
  id: number;
  name: string;
  url: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [n, setN] = useState(`${name} (copy)`);
  const [u, setU] = useState(url);
  const [error, setError] = useState<string | null>(null);

  return (
    <ModalShell title="Clone monitor" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (!n.trim()) return setError("Name is required.");
          try {
            new URL(u.trim());
          } catch {
            return setError("Enter a valid URL.");
          }
          start(async () => {
            const res = await fetch(`/api/monitors/${id}/clone`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name: n.trim(), url: u.trim() }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) {
              setError((j as { error?: string }).error ?? "Failed");
              return;
            }
            const nid = (j as { id?: number }).id;
            onClose();
            if (nid) router.push(`/monitors/${nid}`);
            router.refresh();
          });
        }}
      >
        <p className="text-xs text-[var(--muted)]">
          Copies all settings and alert thresholds into a new monitor. Change
          the URL to watch a different endpoint, or keep it to duplicate.
        </p>
        <label className="block text-sm">
          <span className="font-medium">Name</span>
          <input
            className="field-input !mt-1"
            value={n}
            onChange={(e) => setN(e.target.value)}
            autoFocus
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Health URL</span>
          <input
            className="field-input !mt-1"
            type="url"
            value={u}
            onChange={(e) => setU(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? "Cloning…" : "Clone"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
