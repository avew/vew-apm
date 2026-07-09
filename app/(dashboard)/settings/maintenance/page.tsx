import { getDb, schema } from "@/lib/db/client";
import { desc } from "drizzle-orm";
import { MaintenanceClient } from "./maintenance-client";

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const db = getDb();
  const [monitors, windows] = await Promise.all([
    db
      .select({
        id: schema.monitors.id,
        name: schema.monitors.name,
      })
      .from(schema.monitors)
      .orderBy(schema.monitors.name),
    db
      .select()
      .from(schema.maintenanceWindows)
      .orderBy(desc(schema.maintenanceWindows.startsAt)),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Maintenance windows</h1>
      <MaintenanceClient monitors={monitors} windows={windows} />
    </div>
  );
}
