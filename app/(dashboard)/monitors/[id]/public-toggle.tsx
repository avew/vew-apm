"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";

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

  return (
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
  );
}
