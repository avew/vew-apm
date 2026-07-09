import Link from "next/link";
import { MonitorForm } from "./monitor-form";
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default function NewMonitorPage() {
  return (
    <div className="max-w-xl space-y-4">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)] mb-2"
        >
          <ChevronLeft className="w-4 h-4" /> Monitors
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">New monitor</h1>
      </div>
      <MonitorForm />
    </div>
  );
}
