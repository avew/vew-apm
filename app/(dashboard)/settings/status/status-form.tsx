"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Values {
  enabled: boolean;
  title: string;
}

export function StatusPageForm({ initial }: { initial: Values }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

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
