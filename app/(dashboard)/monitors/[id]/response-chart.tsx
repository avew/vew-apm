"use client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export function ResponseTimeChart({
  data,
}: {
  data: { t: number; ms: number | null; status: string }[];
}) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey="t"
            tickFormatter={(t) => new Date(t).toLocaleTimeString()}
            fontSize={11}
            minTickGap={40}
          />
          <YAxis fontSize={11} unit="ms" />
          <Tooltip
            labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
            formatter={(v: unknown) => [`${v}ms`, "response"]}
          />
          <Line
            type="monotone"
            dataKey="ms"
            stroke="#0284c7"
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
