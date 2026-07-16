import { getDb, schema } from "@/lib/db/client";
import { asc, eq } from "drizzle-orm";
import { currentOnCallIndex } from "@/lib/oncall";
import {
  OncallClient,
  type ChannelLite,
  type ResponderRow,
  type MemberRow,
  type ScheduleRow,
} from "./oncall-client";

export const dynamic = "force-dynamic";

export default async function OncallPage() {
  const db = getDb();

  const channels: ChannelLite[] = await db
    .select({
      id: schema.notificationChannels.id,
      name: schema.notificationChannels.name,
      kind: schema.notificationChannels.kind,
    })
    .from(schema.notificationChannels)
    .orderBy(asc(schema.notificationChannels.name));

  const responders: ResponderRow[] = await db
    .select({
      id: schema.responders.id,
      name: schema.responders.name,
      channelId: schema.responders.channelId,
      channelName: schema.notificationChannels.name,
    })
    .from(schema.responders)
    .innerJoin(
      schema.notificationChannels,
      eq(schema.responders.channelId, schema.notificationChannels.id),
    )
    .orderBy(asc(schema.responders.name));

  const scheduleRows = await db
    .select()
    .from(schema.oncallSchedules)
    .orderBy(asc(schema.oncallSchedules.id));

  const memberRows: MemberRow[] = await db
    .select({
      id: schema.oncallMembers.id,
      scheduleId: schema.oncallMembers.scheduleId,
      responderId: schema.oncallMembers.responderId,
      responderName: schema.responders.name,
      position: schema.oncallMembers.position,
    })
    .from(schema.oncallMembers)
    .innerJoin(
      schema.responders,
      eq(schema.oncallMembers.responderId, schema.responders.id),
    )
    .orderBy(asc(schema.oncallMembers.position), asc(schema.oncallMembers.id));

  const now = Date.now();
  const schedules: ScheduleRow[] = scheduleRows.map((s) => {
    const mem = memberRows.filter((m) => m.scheduleId === s.id);
    const idx = currentOnCallIndex(
      mem.length,
      s.rotationDays,
      s.anchorAt.getTime(),
      now,
    );
    return {
      id: s.id,
      name: s.name,
      rotationDays: s.rotationDays,
      anchorAt: s.anchorAt.toISOString(),
      onCallName: idx == null ? null : mem[idx].responderName,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">On-call</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Responders map a person to a notification channel. A schedule rotates
          over them; an escalation step can page “whoever is on call now”.
        </p>
      </div>
      <OncallClient
        channels={channels}
        responders={responders}
        schedules={schedules}
        members={memberRows}
      />
    </div>
  );
}
