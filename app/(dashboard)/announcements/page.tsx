import { listStatusIncidents } from "@/lib/status-incidents";
import { AnnouncementsClient } from "./announcements-client";

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  const incidents = await listStatusIncidents();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Announcements</h1>
      <AnnouncementsClient initial={incidents} />
    </div>
  );
}
