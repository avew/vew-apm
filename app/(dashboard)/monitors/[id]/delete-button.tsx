"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";

export function DeleteMonitorButton({ id }: { id: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!confirm("Delete this monitor and all its history?")) return;
        start(async () => {
          const res = await fetch(`/api/monitors/${id}`, { method: "DELETE" });
          if (res.ok) {
            router.replace("/");
            router.refresh();
          }
        });
      }}
      className="btn btn-danger"
    >
      <Trash2 className="w-4 h-4" />
      Delete
    </button>
  );
}
