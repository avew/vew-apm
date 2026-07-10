"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, ExternalLink } from "lucide-react";

export function PublicToggle({
  monitorId,
  initial,
}: {
  monitorId: number;
  initial: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [origin, setOrigin] = useState("");
  // window is client-only; read the origin after mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        disabled={pending}
        title={
          on
            ? "Shown on the public /status page — click to hide"
            : "Hidden from the public /status page — click to publish"
        }
        onClick={() =>
          start(async () => {
            const next = !on;
            const res = await fetch(`/api/monitors/${monitorId}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ public: next }),
            });
            if (res.ok) {
              setOn(next);
              router.refresh();
            }
          })
        }
        className="btn btn-ghost text-sm"
      >
        <Globe className="w-4 h-4" />
        {on ? "Public: on" : "Public: off"}
      </button>
      {on && (
        <a
          href="/status"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-brand-600)] hover:underline font-mono"
          title="Open the public status page"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          {origin ? `${origin}/status` : "/status"}
        </a>
      )}
    </div>
  );
}
