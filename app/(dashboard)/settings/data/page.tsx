import { loadAlertSettings } from "@/lib/alerts";
import { getDbStats } from "@/lib/db-stats";
import { DataSettingsForm } from "./data-settings-form";

export const dynamic = "force-dynamic";

export default async function DataSettingsPage() {
  const settings = await loadAlertSettings();
  const stats = getDbStats();
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Data &amp; storage</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Operational data management — how long check history is kept and how
          much space the database uses. Not an alerting rule.
        </p>
      </div>
      <section className="card p-5">
        <DataSettingsForm
          retentionDays={settings.retentionDays}
          stats={stats}
        />
      </section>
    </div>
  );
}
