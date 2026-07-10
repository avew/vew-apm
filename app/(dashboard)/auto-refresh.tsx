"use client";
import { useEffect, useState, useRef, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

const OPTIONS = [
  { label: "Off", value: 0 },
  { label: "5s", value: 5 },
  { label: "10s", value: 10 },
  { label: "30s", value: 30 },
  { label: "60s", value: 60 },
];

const STORAGE_KEY = "apm.refreshInterval";
const MIN_SPIN_MS = 650;

export function AutoRefresh() {
  const router = useRouter();
  const [interval, setInterval] = useState(10);
  const [pending, start] = useTransition();
  const [spinning, setSpinning] = useState(false);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [clock, setClock] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);
  const spinTimer = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  const refresh = useCallback(() => {
    setSpinning(true);
    if (spinTimer.current) globalThis.clearTimeout(spinTimer.current);
    spinTimer.current = globalThis.setTimeout(
      () => setSpinning(false),
      MIN_SPIN_MS,
    );
    start(() => {
      router.refresh();
      setLastAt(Date.now());
    });
  }, [router]);

  // live ticking clock — seed after mount to avoid an SSR hydration mismatch
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClock(new Date());
    const id = globalThis.setInterval(() => setClock(new Date()), 1000);
    return () => globalThis.clearInterval(id);
  }, []);

  useEffect(() => {
    // localStorage is client-only; hydrate the saved interval after mount.
    const saved = localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved !== null) setInterval(Number(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(interval));
    if (timer.current) globalThis.clearInterval(timer.current);
    if (interval <= 0) return;
    timer.current = globalThis.setInterval(() => refresh(), interval * 1000);
    return () => {
      if (timer.current) globalThis.clearInterval(timer.current);
    };
  }, [interval, refresh]);

  const spin = spinning || pending;
  const secsAgo =
    lastAt && clock ? Math.round((clock.getTime() - lastAt) / 1000) : null;

  return (
    <div className="flex items-center gap-3 text-sm">
      <button
        onClick={refresh}
        className="btn btn-ghost !px-2.5"
        title="Refresh now"
        aria-busy={spin}
      >
        <RefreshCw
          className={`w-4 h-4 transition-transform ${spin ? "animate-spin text-[var(--foreground)]" : ""}`}
        />
      </button>
      <select
        value={interval}
        onChange={(e) => setInterval(Number(e.target.value))}
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm"
        title="Auto-refresh interval"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.value === 0 ? "Auto: Off" : `Auto: ${o.label}`}
          </option>
        ))}
      </select>
      <div
        className="hidden sm:flex flex-col leading-snug pl-1 min-w-[92px]"
        suppressHydrationWarning
      >
        <span className="text-xs font-medium tabular-nums text-[var(--foreground)]">
          {clock ? clock.toLocaleTimeString() : "--:--:--"}
        </span>
        <span className="text-[10px] text-[var(--muted)] tabular-nums">
          {spin
            ? "refreshing…"
            : secsAgo === null
              ? "updated -- -- --"
              : secsAgo <= 1
                ? "updated just now"
                : `updated ${secsAgo}s ago`}
        </span>
      </div>
    </div>
  );
}
