"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Megaphone } from "lucide-react";
import {
  INCIDENT_STATUSES,
  INCIDENT_IMPACTS,
  type IncidentWithUpdates,
} from "@/lib/status-incident-constants";

const IMPACT_BADGE: Record<string, string> = {
  minor: "badge-warn",
  major: "badge-warn",
  critical: "badge-down",
};
const cls = "field-input !mt-1";

export function AnnouncementsClient({
  initial,
}: {
  initial: IncidentWithUpdates[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [pending, start] = useTransition();

  // create form
  const [title, setTitle] = useState("");
  const [impact, setImpact] = useState("minor");
  const [status, setStatus] = useState("investigating");
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const create = () =>
    start(async () => {
      setErr(null);
      const res = await fetch("/api/status-incidents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, impact, status, body }),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => ({})))?.error ?? "Failed");
        return;
      }
      setTitle("");
      setBody("");
      setImpact("minor");
      setStatus("investigating");
      setOpen(false);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Posted incidents appear on the public <code>/status</code> page with a
          timeline of updates.
        </p>
        <button onClick={() => setOpen((o) => !o)} className="btn btn-primary shrink-0">
          <Plus className="w-4 h-4" /> Post incident
        </button>
      </div>

      {open && (
        <div className="card p-5 space-y-3">
          <label className="block text-sm">
            <span className="font-medium">Title</span>
            <input className={cls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Elevated API latency" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="font-medium">Impact</span>
              <select className={cls} value={impact} onChange={(e) => setImpact(e.target.value)}>
                {INCIDENT_IMPACTS.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">Status</span>
              <select className={cls} value={status} onChange={(e) => setStatus(e.target.value)}>
                {INCIDENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="font-medium">Message</span>
            <textarea className={cls} rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="We're investigating reports of…" />
          </label>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="btn btn-ghost">Cancel</button>
            <button
              onClick={create}
              disabled={pending || !title.trim() || !body.trim()}
              className="btn btn-primary"
            >
              {pending ? "Posting…" : "Post"}
            </button>
          </div>
        </div>
      )}

      {initial.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="mx-auto w-12 h-12 grid place-items-center rounded-full bg-black/[0.05] dark:bg-white/[0.06] mb-3">
            <Megaphone className="w-6 h-6 text-[var(--color-brand-600)]" />
          </div>
          <p className="text-[var(--muted)]">No posted incidents yet.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {initial.map((inc) => (
            <IncidentRow key={inc.id} inc={inc} />
          ))}
        </ul>
      )}
    </div>
  );
}

function IncidentRow({ inc }: { inc: IncidentWithUpdates }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(
    inc.status === "resolved" ? "resolved" : inc.status,
  );
  const [body, setBody] = useState("");
  const resolved = inc.status === "resolved";

  const addUpdate = () =>
    start(async () => {
      const res = await fetch(`/api/status-incidents/${inc.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, body }),
      });
      if (res.ok) {
        setBody("");
        router.refresh();
      }
    });

  const del = () =>
    start(async () => {
      if (!confirm("Delete this incident and its updates?")) return;
      await fetch(`/api/status-incidents/${inc.id}`, { method: "DELETE" });
      router.refresh();
    });

  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{inc.title}</span>
            <span className={`badge ${IMPACT_BADGE[inc.impact] ?? "badge-muted"}`}>{inc.impact}</span>
            <span className={`badge ${resolved ? "badge-up" : "badge-muted"}`}>{inc.status}</span>
          </div>
        </div>
        <button onClick={del} disabled={pending} className="btn btn-danger !px-2 !py-1 text-xs shrink-0">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      <ul className="mt-3 space-y-2 border-l-2 border-[var(--border)] pl-3">
        {inc.updates.map((u) => (
          <li key={u.id} className="text-sm">
            <span className="font-medium capitalize">{u.status}</span>{" "}
            <span className="text-xs text-[var(--muted)]">
              {new Date(u.createdAt).toLocaleString()}
            </span>
            <div className="text-[var(--muted)]">{u.body}</div>
          </li>
        ))}
      </ul>

      {!resolved && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--border)] pt-3">
          <label className="text-sm">
            <span className="text-xs text-[var(--muted)]">Status</span>
            <select className="field-input !mt-1 !py-1.5" value={status} onChange={(e) => setStatus(e.target.value)}>
              {INCIDENT_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <input
            className="field-input !mt-1 flex-1 min-w-[12rem]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Update message…"
          />
          <button onClick={addUpdate} disabled={pending || !body.trim()} className="btn btn-primary">
            Add update
          </button>
        </div>
      )}
    </li>
  );
}
