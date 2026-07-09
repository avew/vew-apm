"use client";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

interface DiskDatum {
  t: number;
  total: number;
  free: number;
  usedPct: number;
  threshold: number | null;
}

const fmtGb = (b: number) => {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  if (b <= 0) return "0 B";
  const i = Math.min(units.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  const v = b / 1024 ** i;
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
};

export function DiskChart({ data }: { data: DiskDatum[] }) {
  const mapped = data.map((d) => ({
    t: d.t,
    used: d.total - d.free,
    free: d.free,
    usedPct: d.usedPct,
    threshold: d.threshold,
  }));
  const latest = data[data.length - 1];
  return (
    <div className="space-y-2">
      {latest && (
        <div className="text-sm text-neutral-500">
          latest: <strong>{latest.usedPct.toFixed(1)}%</strong> used ·{" "}
          {fmtGb(latest.total - latest.free)} of {fmtGb(latest.total)}
          {latest.threshold ? ` · threshold ${fmtGb(latest.threshold)}` : ""}
        </div>
      )}
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={mapped} stackOffset="expand">
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="t"
              tickFormatter={(t) => new Date(t).toLocaleTimeString()}
              fontSize={11}
              minTickGap={40}
            />
            <YAxis fontSize={11} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
            <Tooltip
              labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
              formatter={(v: unknown, name: unknown) => [fmtGb(Number(v)), String(name ?? "")]}
            />
            <Area
              type="monotone"
              dataKey="used"
              stackId="1"
              stroke="#dc2626"
              fill="#dc2626"
              fillOpacity={0.5}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="free"
              stackId="1"
              stroke="#16a34a"
              fill="#16a34a"
              fillOpacity={0.4}
              isAnimationActive={false}
            />
            {latest?.threshold && (
              <ReferenceLine
                y={latest.threshold / latest.total}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                label={{ value: "threshold", fill: "#f59e0b", fontSize: 10 }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
