import { cookies } from "next/headers";
import { AppearanceClient } from "./appearance-client";
import { MESSAGES, type Lang } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function AppearancePage() {
  const jar = await cookies();
  const raw = jar.get("apm_lang")?.value;
  const lang: Lang = raw && raw in MESSAGES ? (raw as Lang) : "en";
  return (
    <div className="max-w-2xl">
      <AppearanceClient initialLang={lang} />
    </div>
  );
}
