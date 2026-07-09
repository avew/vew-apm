import { HeartPulse, PlugZap } from "lucide-react";

interface Probe {
  status: string;
}

interface Meta {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  question: string;
  upText: string;
  downText: string;
  consequence: string;
}

const PROBES: Meta[] = [
  {
    key: "livenessState",
    label: "Liveness",
    icon: HeartPulse,
    question: "Is the app alive?",
    upText: "Running normally.",
    downText: "Internal state broken — cannot self-recover.",
    consequence: "Kubernetes restarts the pod.",
  },
  {
    key: "readinessState",
    label: "Readiness",
    icon: PlugZap,
    question: "Ready for traffic?",
    upText: "Serving requests.",
    downText: "Not accepting traffic (startup, dependency down, or shutting down).",
    consequence: "Removed from the load balancer until ready — no restart.",
  },
];

export function HealthProbes({
  statuses,
}: {
  statuses: Record<string, string>;
}) {
  const present = PROBES.filter((p) => statuses[p.key] != null);
  if (present.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {present.map((p) => {
        const status = statuses[p.key];
        const up = status === "UP";
        const Icon = p.icon;
        return (
          <div
            key={p.key}
            className={`card relative overflow-hidden p-4 pl-5 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 ${
              up ? "before:bg-emerald-500" : "before:bg-red-500"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`grid place-items-center w-9 h-9 rounded-lg ${
                    up
                      ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                      : "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </span>
                <div>
                  <div className="font-semibold leading-tight">{p.label}</div>
                  <div className="text-xs text-[var(--muted)]">{p.question}</div>
                </div>
              </div>
              <span className={`badge ${up ? "badge-up" : "badge-down"}`}>
                {status}
              </span>
            </div>
            <p className="text-sm mt-3">{up ? p.upText : p.downText}</p>
            {!up && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 flex items-start gap-1">
                <span aria-hidden>→</span>
                {p.consequence}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
