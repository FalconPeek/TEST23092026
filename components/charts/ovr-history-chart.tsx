"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { es } from "@/messages/es";
import { formatDate } from "@/lib/format";

export interface OvrHistoryPoint {
  snapshotAt: string;
  ovr: number;
}

/** Needs at least 2 points to draw a meaningful line; a brand-new player only has one (or zero)
 * OVR snapshots, so that's the empty-state threshold rather than exactly zero. */
export function OvrHistoryChart({ points }: { points: OvrHistoryPoint[] }) {
  if (points.length < 2) {
    return <p className="text-sm text-muted-foreground">{es.dashboard.noHistory}</p>;
  }

  const data = points.map((p) => ({ date: formatDate(p.snapshotAt), ovr: p.ovr }));
  const color = "var(--color-primary)";

  return (
    <ChartContainer
      config={{ ovr: { label: es.dashboard.ovrHistory, color } }}
      className="aspect-video max-h-56 w-full"
    >
      <LineChart data={data}>
        <CartesianGrid stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[1, 99]}
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={28}
        />
        <Line dataKey="ovr" stroke={color} strokeWidth={2} dot={false} type="monotone" />
      </LineChart>
    </ChartContainer>
  );
}
