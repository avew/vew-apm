import { SettingsNav } from "./settings-nav";
import { getT } from "@/lib/i18n-server";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getT();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("titleSettings")}</h1>
      <SettingsNav />
      {children}
    </div>
  );
}
