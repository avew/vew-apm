"use client";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { ClientIncident, IncidentListResult } from "@/lib/incident-list";

const KIND_LABEL: Record<string, string> = {
  availability: "Availability",
  disk: "Disk usage",
  latency: "Latency",
  component_down: "Component down",
  eureka: "Eureka",
  service_missing: "Service missing",
  metric: "Metric",
  down: "Down",
};

function Row({ i }: { i: ClientIncident }) {
  const sevBadge = i.severity === "warning" ? "badge-warn" : "badge-down";
  const dot = i.resolved
    ? "bg-emerald-500"
    : i.severity === "warning"
      ? "bg-amber-500 animate-pulse"
      : "bg-red-500 animate-pulse";
  return (
    <li className="flex items-start justify-between gap-2 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`w-2 h-2 rounded-full ${dot}`} />
          <span className={`badge ${sevBadge}`}>{i.severity}</span>
          <span className="text-xs font-medium">{KIND_LABEL[i.kind] ?? i.kind}</span>
          <span className="font-mono text-xs text-[var(--muted)]">
            {i.componentPath ?? "overall"}
          </span>
          {i.suppressed && <span className="badge badge-muted">suppressed</span>}
          {!i.resolved && <span className="badge badge-down">ongoing</span>}
        </div>
        {i.reason && (
          <div className="text-xs text-[var(--muted)] mt-1 ml-4">{i.reason}</div>
        )}
      </div>
      <span className="text-xs text-[var(--muted)] text-right shrink-0">
        {new Date(i.startedAt).toLocaleString()}
        {i.endedAt && (
          <>
            <br />→ {new Date(i.endedAt).toLocaleString()}
          </>
        )}
      </span>
    </li>
  );
}

export function IncidentBrowser({
  monitorId,
  initial,
}: {
  monitorId: number;
  initial: IncidentListResult;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<IncidentListResult>(initial);
  const [loading, setLoading] = useState(false);
  // Skip the fetch on first render — the server already gave us page 1.
  const mounted = useRef(false);

  // Debounce the query; reset to page 1 whenever the search text changes.
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({
      q: debouncedQ,
      page: String(page),
      pageSize: String(initial.pageSize),
    });
    fetch(`/api/monitors/${monitorId}/incidents?${params}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: IncidentListResult) => setData(d))
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setData({ ...initial, incidents: [], total: 0 });
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [debouncedQ, page, monitorId, initial]);

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = Math.min(data.total, data.page * data.pageSize);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by kind, component, service, or reason…"
          className="field-input pl-9"
          aria-label="Search incidents"
        />
      </div>

      {data.incidents.length === 0 ? (
        <p className="text-sm text-[var(--muted)] py-2">
          {q ? "No incidents match your search." : "No incidents recorded."}
        </p>
      ) : (
        <ul
          className={`text-sm divide-y divide-[var(--border)] transition-opacity ${
            loading ? "opacity-50" : ""
          }`}
        >
          {data.incidents.map((i) => (
            <Row key={i.id} i={i} />
          ))}
        </ul>
      )}

      {data.total > 0 && (
        <div className="flex items-center justify-between gap-3 pt-1 text-xs text-[var(--muted)]">
          <span className="tabular-nums">
            {from}–{to} of {data.total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost px-2 py-1"
              disabled={data.page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <span className="tabular-nums">
              {data.page} / {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-ghost px-2 py-1"
              disabled={data.page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
