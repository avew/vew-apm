import Link from "next/link";
import { MonitorForm } from "./monitor-form";
import { getT } from "@/lib/i18n-server";
import { ChevronLeft } from "lucide-react";
import { getDb, schema } from "@/lib/db/client";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function NewMonitorPage() {
  const t = await getT();
  const db = getDb();
  const monitors = await db
    .select({ id: schema.monitors.id, name: schema.monitors.name })
    .from(schema.monitors)
    .orderBy(asc(schema.monitors.name));
  const policies = await db
    .select({ id: schema.escalationPolicies.id, name: schema.escalationPolicies.name })
    .from(schema.escalationPolicies)
    .orderBy(asc(schema.escalationPolicies.name));
  return (
    <div className="max-w-xl space-y-4">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)] mb-2"
        >
          <ChevronLeft className="w-4 h-4" /> {t("titleMonitors")}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t("titleNewMonitor")}</h1>
      </div>
      <MonitorForm monitors={monitors} policies={policies} />
    </div>
  );
}
