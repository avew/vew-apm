import { loadAuthSettings } from "@/lib/auth";
import { CredentialsForm } from "./credentials-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await loadAuthSettings();
  return (
    <div className="max-w-xl space-y-6">
      <section className="card p-4 space-y-3">
        <h2 className="font-medium">Basic auth credentials</h2>
        <p className="text-sm text-neutral-500">
          Change the admin username and/or password. Changing either invalidates
          all active sessions on other browsers.
        </p>
        <CredentialsForm currentUsername={settings?.username ?? ""} />
      </section>
    </div>
  );
}
