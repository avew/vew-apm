import { loadAlertSettings } from "@/lib/alerts";
import { AlertSettingsForm } from "./alert-settings-form";

export const dynamic = "force-dynamic";

export default async function AlertsSettingsPage() {
  const settings = await loadAlertSettings();
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alert thresholds</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Global defaults applied to every monitor. Each monitor can override
          these individually.
        </p>
      </div>
      <section className="card p-5">
        <AlertSettingsForm
          initial={{
            diskWarnPct: settings.diskWarnPct,
            diskCritPct: settings.diskCritPct,
            downForMinutes: settings.downForMinutes,
            latencyWarnMs: settings.latencyWarnMs,
            latencyWindow: settings.latencyWindow,
            eurekaDropAlert: settings.eurekaDropAlert,
            serviceGraceSeconds: settings.serviceGraceSeconds,
            componentGraceSeconds: settings.componentGraceSeconds,
          }}
        />
      </section>
    </div>
  );
}
