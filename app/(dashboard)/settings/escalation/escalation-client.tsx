"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowUpCircle } from "lucide-react";

export type PolicyRow = { id: number; name: string; active: boolean };
export type StepRow = {
  id: number;
  policyId: number;
  afterMinutes: number;
  channelId: number | null;
  scheduleId: number | null;
};
export type ChannelLite = {
  id: number;
  name: string;
  kind: string;
  enabled: boolean;
};
export type ScheduleLite = { id: number; name: string };

const cls = "field-input !mt-1";

function fmtDelay(min: number): string {
  if (min === 0) return "immediately";
  if (min % 60 === 0) return `after ${min / 60}h`;
  return `after ${min}m`;
}

export function EscalationClient({
  policies,
  steps,
  channels,
  schedules,
}: {
  policies: PolicyRow[];
  steps: StepRow[];
  channels: ChannelLite[];
  schedules: ScheduleLite[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [newName, setNewName] = useState("");

  function createPolicy() {
    if (!newName.trim()) return;
    start(async () => {
      await fetch("/api/escalation-policies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      setNewName("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {channels.length === 0 && (
        <div className="card p-4 text-sm text-[var(--muted)]">
          Add a notification channel first — escalation steps page a channel.
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          className="field-input"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New policy name (e.g. On-call ladder)"
        />
        <button
          onClick={createPolicy}
          disabled={pending || !newName.trim()}
          className="btn btn-primary shrink-0"
        >
          <Plus className="w-4 h-4" /> Create
        </button>
      </div>

      {policies.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="mx-auto w-12 h-12 grid place-items-center rounded-full bg-black/[0.05] dark:bg-white/[0.06] mb-3">
            <ArrowUpCircle className="w-6 h-6 text-[var(--color-brand-600)]" />
          </div>
          <p className="text-[var(--muted)]">No escalation policies yet.</p>
        </div>
      ) : (
        policies.map((p) => (
          <PolicyCard
            key={p.id}
            policy={p}
            steps={steps.filter((s) => s.policyId === p.id)}
            channels={channels}
            schedules={schedules}
            pending={pending}
            start={start}
          />
        ))
      )}
    </div>
  );
}

function PolicyCard({
  policy,
  steps,
  channels,
  schedules,
  pending,
  start,
}: {
  policy: PolicyRow;
  steps: StepRow[];
  channels: ChannelLite[];
  schedules: ScheduleLite[];
  pending: boolean;
  start: (fn: () => Promise<void>) => void;
}) {
  const router = useRouter();
  const [afterMinutes, setAfterMinutes] = useState("15");
  const [targetType, setTargetType] = useState<"channel" | "schedule">("channel");
  const [channelId, setChannelId] = useState<string>(
    channels[0] ? String(channels[0].id) : "",
  );
  const [scheduleId, setScheduleId] = useState<string>(
    schedules[0] ? String(schedules[0].id) : "",
  );
  const channelName = (id: number) =>
    channels.find((c) => c.id === id)?.name ?? `channel #${id}`;
  const scheduleName = (id: number) =>
    schedules.find((s) => s.id === id)?.name ?? `schedule #${id}`;
  const describeTarget = (s: StepRow) =>
    s.channelId != null
      ? channelName(s.channelId)
      : s.scheduleId != null
        ? `on-call: ${scheduleName(s.scheduleId)}`
        : "—";

  function setActive(active: boolean) {
    start(async () => {
      await fetch(`/api/escalation-policies/${policy.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active }),
      });
      router.refresh();
    });
  }

  function deletePolicy() {
    if (!confirm(`Delete policy “${policy.name}”?`)) return;
    start(async () => {
      await fetch(`/api/escalation-policies/${policy.id}`, { method: "DELETE" });
      router.refresh();
    });
  }

  function addStep() {
    const mins = Number(afterMinutes);
    if (!Number.isFinite(mins) || mins < 0) return;
    const target =
      targetType === "channel"
        ? channelId
          ? { channelId: Number(channelId) }
          : null
        : scheduleId
          ? { scheduleId: Number(scheduleId) }
          : null;
    if (!target) return;
    start(async () => {
      await fetch(`/api/escalation-policies/${policy.id}/steps`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ afterMinutes: mins, ...target }),
      });
      router.refresh();
    });
  }

  function deleteStep(stepId: number) {
    start(async () => {
      await fetch(`/api/escalation-policies/${policy.id}/steps/${stepId}`, {
        method: "DELETE",
      });
      router.refresh();
    });
  }

  const sorted = [...steps].sort((a, b) => a.afterMinutes - b.afterMinutes);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">
          {policy.name}{" "}
          {policy.active && <span className="badge badge-up ml-1">active</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={pending}
            onClick={() => setActive(!policy.active)}
            className="btn btn-ghost !px-2 !py-1 text-xs"
          >
            {policy.active ? "Deactivate" : "Set active"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={deletePolicy}
            className="btn btn-danger !px-2 !py-1 text-xs"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {sorted.length > 0 ? (
        <ol className="space-y-1">
          {sorted.map((s, i) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="font-mono">
                {i + 1}. {fmtDelay(s.afterMinutes)} → {describeTarget(s)}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => deleteStep(s.id)}
                className="btn btn-ghost !px-2 !py-1"
                aria-label="Remove step"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-[var(--muted)]">No steps yet.</p>
      )}

      {(channels.length > 0 || schedules.length > 0) && (
        <div className="flex flex-wrap items-end gap-2 border-t border-[var(--border)] pt-3">
          <label className="block text-xs">
            <span className="font-medium">After (minutes)</span>
            <input
              type="number"
              min={0}
              className={`${cls} w-24`}
              value={afterMinutes}
              onChange={(e) => setAfterMinutes(e.target.value)}
            />
          </label>
          <label className="block text-xs">
            <span className="font-medium">Notify</span>
            <select
              className={cls}
              value={targetType}
              onChange={(e) => setTargetType(e.target.value as "channel" | "schedule")}
            >
              <option value="channel" disabled={channels.length === 0}>
                Channel
              </option>
              <option value="schedule" disabled={schedules.length === 0}>
                On-call schedule
              </option>
            </select>
          </label>
          {targetType === "channel" ? (
            <label className="block text-xs flex-1 min-w-40">
              <span className="font-medium">Channel</span>
              <select
                className={cls}
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
              >
                {channels.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name} ({c.kind}){c.enabled ? "" : " — disabled"}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block text-xs flex-1 min-w-40">
              <span className="font-medium">Schedule</span>
              <select
                className={cls}
                value={scheduleId}
                onChange={(e) => setScheduleId(e.target.value)}
              >
                {schedules.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={addStep}
            className="btn btn-ghost !px-3 !py-1.5 text-xs shrink-0"
          >
            <Plus className="w-3 h-3" /> Add step
          </button>
        </div>
      )}
    </div>
  );
}
