"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, User, CalendarClock } from "lucide-react";

export type ChannelLite = { id: number; name: string; kind: string };
export type ResponderRow = {
  id: number;
  name: string;
  channelId: number;
  channelName: string;
};
export type MemberRow = {
  id: number;
  scheduleId: number;
  responderId: number;
  responderName: string;
  position: number;
};
export type ScheduleRow = {
  id: number;
  name: string;
  rotationDays: number;
  anchorAt: string;
  onCallName: string | null;
};

const cls = "field-input !mt-1";

export function OncallClient({
  channels,
  responders,
  schedules,
  members,
}: {
  channels: ChannelLite[];
  responders: ResponderRow[];
  schedules: ScheduleRow[];
  members: MemberRow[];
}) {
  return (
    <div className="space-y-6">
      <Responders channels={channels} responders={responders} />
      <Schedules
        responders={responders}
        schedules={schedules}
        members={members}
      />
    </div>
  );
}

function Responders({
  channels,
  responders,
}: {
  channels: ChannelLite[];
  responders: ResponderRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [channelId, setChannelId] = useState(
    channels[0] ? String(channels[0].id) : "",
  );

  function create() {
    if (!name.trim() || !channelId) return;
    start(async () => {
      await fetch("/api/responders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), channelId: Number(channelId) }),
      });
      setName("");
      router.refresh();
    });
  }
  function remove(id: number) {
    start(async () => {
      await fetch(`/api/responders/${id}`, { method: "DELETE" });
      router.refresh();
    });
  }

  return (
    <section className="card p-4 space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-1.5">
        <User className="w-4 h-4" /> Responders
      </h2>
      {channels.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">
          Add a notification channel first — a responder maps to one.
        </p>
      ) : (
        <div className="flex items-end gap-2">
          <label className="block text-xs flex-1">
            <span className="font-medium">Name</span>
            <input
              className={cls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alice"
            />
          </label>
          <label className="block text-xs flex-1">
            <span className="font-medium">Contact channel</span>
            <select
              className={cls}
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
            >
              {channels.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name} ({c.kind})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={pending || !name.trim()}
            onClick={create}
            className="btn btn-ghost !px-3 !py-1.5 text-xs shrink-0"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
      )}
      {responders.length > 0 && (
        <ul className="divide-y divide-[var(--border)]">
          {responders.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {r.name}{" "}
                <span className="text-xs text-[var(--muted)]">
                  → {r.channelName}
                </span>
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(r.id)}
                className="btn btn-ghost !px-2 !py-1"
                aria-label="Remove responder"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Schedules({
  responders,
  schedules,
  members,
}: {
  responders: ResponderRow[];
  schedules: ScheduleRow[];
  members: MemberRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [rotationDays, setRotationDays] = useState("7");

  function create() {
    if (!name.trim()) return;
    start(async () => {
      await fetch("/api/oncall-schedules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          rotationDays: Number(rotationDays) || 7,
        }),
      });
      setName("");
      router.refresh();
    });
  }

  return (
    <section className="card p-4 space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-1.5">
        <CalendarClock className="w-4 h-4" /> Schedules
      </h2>
      <div className="flex items-end gap-2">
        <label className="block text-xs flex-1">
          <span className="font-medium">Name</span>
          <input
            className={cls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Primary rotation"
          />
        </label>
        <label className="block text-xs">
          <span className="font-medium">Rotate every (days)</span>
          <input
            type="number"
            min={1}
            className={`${cls} w-28`}
            value={rotationDays}
            onChange={(e) => setRotationDays(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={pending || !name.trim()}
          onClick={create}
          className="btn btn-ghost !px-3 !py-1.5 text-xs shrink-0"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      {schedules.map((s) => (
        <ScheduleCard
          key={s.id}
          schedule={s}
          members={members.filter((m) => m.scheduleId === s.id)}
          responders={responders}
          pending={pending}
          start={start}
        />
      ))}
    </section>
  );
}

function ScheduleCard({
  schedule,
  members,
  responders,
  pending,
  start,
}: {
  schedule: ScheduleRow;
  members: MemberRow[];
  responders: ResponderRow[];
  pending: boolean;
  start: (fn: () => Promise<void>) => void;
}) {
  const router = useRouter();
  const [responderId, setResponderId] = useState(
    responders[0] ? String(responders[0].id) : "",
  );

  function addMember() {
    if (!responderId) return;
    start(async () => {
      await fetch(`/api/oncall-schedules/${schedule.id}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ responderId: Number(responderId) }),
      });
      router.refresh();
    });
  }
  function removeMember(memberId: number) {
    start(async () => {
      await fetch(`/api/oncall-schedules/${schedule.id}/members/${memberId}`, {
        method: "DELETE",
      });
      router.refresh();
    });
  }
  function remove() {
    if (!confirm(`Delete schedule “${schedule.name}”?`)) return;
    start(async () => {
      await fetch(`/api/oncall-schedules/${schedule.id}`, { method: "DELETE" });
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-[var(--border)] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">
          {schedule.name}{" "}
          <span className="text-xs text-[var(--muted)]">
            · every {schedule.rotationDays}d
          </span>
          {schedule.onCallName && (
            <span className="badge badge-up ml-2">on call: {schedule.onCallName}</span>
          )}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={remove}
          className="btn btn-danger !px-2 !py-1 text-xs shrink-0"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {members.length > 0 ? (
        <ol className="space-y-1">
          {members.map((m, i) => (
            <li
              key={m.id}
              className="flex items-center justify-between text-xs font-mono"
            >
              <span>
                {i + 1}. {m.responderName}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => removeMember(m.id)}
                className="btn btn-ghost !px-2 !py-1"
                aria-label="Remove from rotation"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-[var(--muted)]">No responders in this rotation.</p>
      )}

      {responders.length > 0 && (
        <div className="flex items-end gap-2 border-t border-[var(--border)] pt-2">
          <label className="block text-xs flex-1">
            <span className="font-medium">Add responder</span>
            <select
              className={cls}
              value={responderId}
              onChange={(e) => setResponderId(e.target.value)}
            >
              {responders.map((r) => (
                <option key={r.id} value={String(r.id)}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={addMember}
            className="btn btn-ghost !px-3 !py-1.5 text-xs shrink-0"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
      )}
    </div>
  );
}
