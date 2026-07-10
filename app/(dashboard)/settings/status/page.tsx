import { loadStatusPageSettings } from "@/lib/status";
import { StatusPageForm } from "./status-form";

export const dynamic = "force-dynamic";

export default async function StatusSettingsPage() {
  const settings = await loadStatusPageSettings();
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Public status page</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          A no-login page at{" "}
          <a href="/status" target="_blank" rel="noreferrer" className="text-[var(--color-brand-600)] hover:underline">
            /status
          </a>{" "}
          showing the services you opt in. It never exposes URLs, component
          internals, disk, service names, or raw incident details.
        </p>
      </div>
      <section className="card p-5">
        <StatusPageForm initial={{ enabled: settings.enabled, title: settings.title }} />
      </section>
      <p className="text-xs text-[var(--muted)]">
        Turn a monitor on for this page from its detail view → “Public status
        page” toggle.
      </p>
    </div>
  );
}
