"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink } from "lucide-react";

interface Values {
  enabled: boolean;
  title: string;
}

export function StatusPageForm({ initial }: { initial: Values }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  // Absolute public URL — origin is only known client-side.
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  // window is client-only; read the origin after mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOrigin(window.location.origin), []);
  const publicUrl = `${origin}/status`;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const res = await fetch("/api/status-page", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(v),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            setMsg({ type: "err", text: j.error ?? "Failed" });
            return;
          }
          setMsg({ type: "ok", text: "Saved." });
          router.refresh();
        });
      }}
    >
      <label className="flex items-center gap-3 text-sm">
        <button
          type="button"
          onClick={() => setV((p) => ({ ...p, enabled: !p.enabled }))}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            v.enabled ? "bg-[var(--foreground)]" : "bg-neutral-300 dark:bg-neutral-700"
          }`}
          aria-pressed={v.enabled}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-[var(--surface)] transition-transform ${
              v.enabled ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
        <span className="font-medium">
          Publish the status page {v.enabled ? "(live)" : "(hidden — /status returns 404)"}
        </span>
      </label>

      <label className="block text-sm">
        <span className="font-medium">Page title</span>
        <input
          className="field-input"
          value={v.title}
          maxLength={120}
          onChange={(e) => setV((p) => ({ ...p, title: e.target.value }))}
          placeholder="Service Status"
        />
      </label>

      <div className="rounded-lg border border-[var(--border)] p-3">
        <div className="text-xs font-medium text-[var(--muted)] mb-1.5">
          Public URL {v.enabled ? "" : "(live once published)"}
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-black/[0.04] dark:bg-white/[0.06] px-2 py-1.5 text-sm">
            {publicUrl}
          </code>
          <button
            type="button"
            title="Copy"
            onClick={() => {
              navigator.clipboard?.writeText(publicUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="btn btn-ghost !px-2 !py-1.5 text-xs"
          >
            <Copy className="w-3.5 h-3.5" /> {copied ? "Copied" : "Copy"}
          </button>
          <a
            href="/status"
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost !px-2 !py-1.5 text-xs"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open
          </a>
        </div>
        <p className="text-xs text-[var(--muted)] mt-2">
          Share this link. Only monitors with “Public” on appear here.
        </p>
      </div>

      {msg && (
        <p className={msg.type === "ok" ? "text-sm text-emerald-600" : "text-sm text-red-600"}>
          {msg.text}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
