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

export function MonitorActions({
  id,
  enabled,
  name,
  url,
  intervalSeconds,
  group,
  thresholds,
}: {
  id: number;
  enabled: boolean;
  name: string;
  url: string;
  intervalSeconds: number;
  group: string | null;
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
  onClose,
}: {
  id: number;
  name: string;
  url: string;
  intervalSeconds: number;
  group: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [n, setN] = useState(name);
  const [u, setU] = useState(url);
  const [iv, setIv] = useState(intervalSeconds);
  const [g, setG] = useState(group ?? "");
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
