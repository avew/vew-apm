import { getDb, schema } from "@/lib/db/client";
import { asc } from "drizzle-orm";
import {
  EscalationClient,
  type PolicyRow,
  type StepRow,
  type ChannelLite,
  type ScheduleLite,
} from "./escalation-client";

export const dynamic = "force-dynamic";

export default async function EscalationPage() {
  const db = getDb();
  const policies: PolicyRow[] = await db
    .select({
      id: schema.escalationPolicies.id,
      name: schema.escalationPolicies.name,
      active: schema.escalationPolicies.active,
    })
    .from(schema.escalationPolicies)
    .orderBy(asc(schema.escalationPolicies.id));
  const steps: StepRow[] = await db
    .select({
      id: schema.escalationSteps.id,
      policyId: schema.escalationSteps.policyId,
      afterMinutes: schema.escalationSteps.afterMinutes,
      channelId: schema.escalationSteps.channelId,
      scheduleId: schema.escalationSteps.scheduleId,
    })
    .from(schema.escalationSteps)
    .orderBy(asc(schema.escalationSteps.afterMinutes));
  const channels: ChannelLite[] = await db
    .select({
      id: schema.notificationChannels.id,
      name: schema.notificationChannels.name,
      kind: schema.notificationChannels.kind,
      enabled: schema.notificationChannels.enabled,
    })
    .from(schema.notificationChannels)
    .orderBy(asc(schema.notificationChannels.name));
  const oncallSchedules: ScheduleLite[] = await db
    .select({
      id: schema.oncallSchedules.id,
      name: schema.oncallSchedules.name,
    })
    .from(schema.oncallSchedules)
    .orderBy(asc(schema.oncallSchedules.name));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Escalation</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          When a critical incident stays open and unacknowledged, page more
          channels on a time ladder. One policy is active at a time.
        </p>
      </div>
      <EscalationClient
        policies={policies}
        steps={steps}
        channels={channels}
        schedules={oncallSchedules}
      />
    </div>
  );
}
