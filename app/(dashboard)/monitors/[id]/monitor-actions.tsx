"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Pause, Pencil, Copy, Trash2, X } from "lucide-react";

export function MonitorActions({
  id,
  enabled,
  name,
  intervalSeconds,
}: {
  id: number;
  enabled: boolean;
  name: string;
  intervalSeconds: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);

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
        <Play className="w-4 h-4" /> Run check
      </button>

      <button
        disabled={pending}
        onClick={() => {
          const verb = enabled ? "Pause" : "Resume";
          if (!confirm(`${verb} monitoring for "${name}"?`)) return;
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
            <Pause className="w-4 h-4" /> Pause
          </>
        ) : (
          <>
            <Play className="w-4 h-4" /> Resume
          </>
        )}
      </button>

      <button
        disabled={pending}
        onClick={() => setEditing(true)}
        className="btn btn-ghost"
      >
        <Pencil className="w-4 h-4" /> Edit
      </button>

      <button
        disabled={pending}
        onClick={() => {
          if (!confirm(`Clone "${name}" into a new monitor?`)) return;
          call(
            `/api/monitors/${id}/clone`,
            { method: "POST" },
            (j) => {
              const nid = (j as { id?: number }).id;
              if (nid) router.push(`/monitors/${nid}`);
            },
          );
        }}
        className="btn btn-ghost"
      >
        <Copy className="w-4 h-4" /> Clone
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
        <Trash2 className="w-4 h-4" /> Delete
      </button>

      {editing && (
        <EditModal
          id={id}
          name={name}
          intervalSeconds={intervalSeconds}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function EditModal({
  id,
  name,
  intervalSeconds,
  onClose,
}: {
  id: number;
  name: string;
  intervalSeconds: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [n, setN] = useState(name);
  const [iv, setIv] = useState(intervalSeconds);
  const [error, setError] = useState<string | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-sm my-16 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Edit monitor</h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (!n.trim()) return setError("Name is required.");
            if (iv < 10) return setError("Interval must be ≥ 10 seconds.");
            start(async () => {
              const res = await fetch(`/api/monitors/${id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name: n.trim(), intervalSeconds: iv }),
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
            <span className="font-medium">Interval (seconds)</span>
            <input
              className="field-input !mt-1"
              type="number"
              min={10}
              value={iv}
              onChange={(e) => setIv(Number(e.target.value))}
            />
          </label>
          <p className="text-xs text-[var(--muted)]">
            URL can’t be changed. To monitor a different endpoint, use Clone or
            create a new monitor.
          </p>
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
      </div>
    </div>
  );
}
