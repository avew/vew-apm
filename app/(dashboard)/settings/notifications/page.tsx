import { getDb, schema } from "@/lib/db/client";
import { desc } from "drizzle-orm";
import { ChannelsClient } from "./channels-client";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const db = getDb();
  const channels = await db
    .select()
    .from(schema.notificationChannels)
    .orderBy(desc(schema.notificationChannels.createdAt));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Notification channels</h1>
      <ChannelsClient initial={channels} />
    </div>
  );
}
