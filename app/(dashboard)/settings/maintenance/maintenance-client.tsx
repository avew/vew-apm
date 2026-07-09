"use client";
import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { MaintenanceWindow } from "@/lib/db/schema";
import { Trash2 } from "lucide-react";

const cls = "field-input";

const DURATIONS = [
  { label: "15 min", min: 15 },
  { label: "30 min", min: 30 },
  { label: "1 hour", min: 60 },
  { label: "2 hours", min: 120 },
  { label: "4 hours", min: 240 },
  { label: "8 hours", min: 480 },
  { label: "12 hours", min: 720 },
  { label: "24 hours", min: 1440 },
];

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Offset (ms) of a tz at a given instant: (wall-clock-in-tz) − UTC.
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(
    dtf.formatToParts(date).map((x) => [x.type, x.value]),
  );
  const asUTC = Date.UTC(
    +p.year,
    +p.month - 1,
    +p.day,
    +p.hour % 24,
    +p.minute,
    +p.second,
  );
  return asUTC - date.getTime();
}

// Interpret a "YYYY-MM-DDTHH:mm" wall clock in the chosen tz → UTC Date.
function wallClockToUtc(local: string, tz: string): Date {
  if (!tz) return new Date(local); // same as server (browser local)
  if (tz === "UTC") return new Date(local + ":00Z");
  const [datePart, timePart] = local.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi] = timePart.split(":").map(Number);
  const asUTC = Date.UTC(y, mo - 1, d, h, mi);
  return new Date(asUTC - tzOffsetMs(new Date(asUTC), tz));
}

function addMinutesToLocal(local: string, min: number): string {
  const d = new Date(local);
  d.setMinutes(d.getMinutes() + min);
  return toLocalInputValue(d);
}

function diffMinutes(startLocal: string, endLocal: string): number {
  return Math.round(
    (new Date(endLocal).getTime() - new Date(startLocal).getTime()) / 60000,
  );
}

export function MaintenanceClient({
  monitors,
  windows,
}: {
  monitors: { id: number; name: string }[];
  windows: MaintenanceWindow[];
}) {
  const router = useRouter();
  const now = new Date();
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"global" | "monitor">("global");
  const [monitorId, setMonitorId] = useState<number | "">(
    monitors[0]?.id ?? "",
  );
  const [startsAt, setStartsAt] = useState(toLocalInputValue(now));
  const [endsAt, setEndsAt] = useState(toLocalInputValue(in1h));
  const [timezone, setTimezone] = useState(""); // "" = same as server
  const [recurrence, setRecurrence] =
    useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const timezones = useMemo(() => {
    let zones: string[] = [];
    try {
      const sv = (
        Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
      ).supportedValuesOf;
      zones = sv ? sv("timeZone") : [];
    } catch {
      zones = [];
    }
    const ref = new Date();
    return zones
      .map((tz) => {
        const off = tzOffsetMs(ref, tz);
        const sign = off >= 0 ? "+" : "-";
        const abs = Math.abs(off);
        const hh = String(Math.floor(abs / 3600000)).padStart(2, "0");
        const mm = String(Math.floor((abs % 3600000) / 60000)).padStart(2, "0");
        return { tz, off, label: `(UTC${sign}${hh}:${mm}) ${tz}` };
      })
      .sort((a, b) => a.off - b.off || a.tz.localeCompare(b.tz));
  }, []);

  const activeDur = diffMinutes(startsAt, endsAt);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="card p-4">
        <h2 className="font-medium mb-2">Create window</h2>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await fetch("/api/maintenance", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  name,
                  scope,
                  monitorId: scope === "monitor" && monitorId !== "" ? monitorId : null,
                  startsAt: wallClockToUtc(startsAt, timezone).toISOString(),
                  endsAt: wallClockToUtc(endsAt, timezone).toISOString(),
                  recurrence,
                  reason: reason || undefined,
                }),
              });
              if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                setError(j.error ?? "Failed");
                return;
              }
              setName("");
              setReason("");
              router.refresh();
            });
          }}
        >
          <label className="block text-sm">
            <span>Name</span>
            <input className={cls} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="block text-sm">
            <span>Scope</span>
            <select className={cls} value={scope} onChange={(e) => setScope(e.target.value as "global" | "monitor")}>
              <option value="global">Global (all monitors)</option>
              <option value="monitor">Single monitor</option>
            </select>
          </label>
          {scope === "monitor" && (
            <label className="block text-sm">
              <span>Monitor</span>
              <select
                className={cls}
                value={monitorId === "" ? "" : String(monitorId)}
                onChange={(e) => setMonitorId(e.target.value ? Number(e.target.value) : "")}
                required
              >
                <option value="" disabled>Choose one…</option>
                {monitors.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm">
            <span>Timezone</span>
            <select
              className={cls}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              <option value="">Same as Server Timezone</option>
              <option value="UTC">UTC</option>
              {timezones.map((z) => (
                <option key={z.tz} value={z.tz}>
                  {z.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span>Start Date/Time</span>
              <input className={cls} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
            </label>
            <label className="block text-sm">
              <span>End Date/Time</span>
              <input className={cls} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
            </label>
          </div>

          <div>
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.map((d) => {
                const active = activeDur === d.min;
                return (
                  <button
                    key={d.min}
                    type="button"
                    onClick={() => setEndsAt(addMinutesToLocal(startsAt, d.min))}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? "border-[var(--color-brand-600)] text-[var(--color-brand-700)] bg-[var(--color-brand-50)] dark:bg-[rgb(79_107_237/0.15)] dark:text-[#8ea2ff]"
                        : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-[var(--muted)] mt-1">
              Sets end time based on start time.
            </p>
          </div>
          <label className="block text-sm">
            <span>Recurrence</span>
            <select className={cls} value={recurrence} onChange={(e) => setRecurrence(e.target.value as typeof recurrence)}>
              <option value="none">One-off</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label className="block text-sm">
            <span>Reason (optional)</span>
            <input className={cls} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="btn btn-primary"
          >
            {pending ? "Saving…" : "Create window"}
          </button>
        </form>
      </section>

      <section className="card p-4">
        <h2 className="font-medium mb-2">Existing windows</h2>
        {windows.length === 0 && (
          <p className="text-sm text-neutral-500">None yet.</p>
        )}
        <ul className="divide-y">
          {windows.map((w) => (
            <WindowRow key={w.id} window={w} monitors={monitors} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function WindowRow({
  window: w,
  monitors,
}: {
  window: MaintenanceWindow;
  monitors: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const monitorName =
    w.scope === "monitor"
      ? monitors.find((m) => m.id === w.monitorId)?.name ?? `#${w.monitorId}`
      : "global";
  return (
    <li className="py-2 flex items-center justify-between gap-2">
      <div>
        <div className="text-sm font-medium">
          {w.name}{" "}
          <span className="text-neutral-500 font-normal">
            · {monitorName} · {w.recurrence}
          </span>
        </div>
        <div className="text-xs text-neutral-500">
          {new Date(w.startsAt).toLocaleString()} →{" "}
          {new Date(w.endsAt).toLocaleString()}
        </div>
        {w.reason && <div className="text-xs text-neutral-500">{w.reason}</div>}
      </div>
      <button
        disabled={pending}
        onClick={() => {
          if (!confirm("Delete window?")) return;
          start(async () => {
            await fetch(`/api/maintenance/${w.id}`, { method: "DELETE" });
            router.refresh();
          });
        }}
        className="btn btn-danger !px-2 !py-1 text-xs"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </li>
  );
}
