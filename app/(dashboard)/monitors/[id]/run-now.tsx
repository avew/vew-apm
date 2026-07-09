"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Play } from "lucide-react";

export function RunNowButton({ id }: { id: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await fetch(`/api/monitors/${id}/run`, { method: "POST" });
          router.refresh();
        })
      }
      className="btn btn-ghost"
    >
      <Play className="w-4 h-4" />
      {pending ? "Running…" : "Run check"}
    </button>
  );
}
