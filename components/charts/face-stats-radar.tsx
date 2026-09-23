"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { es } from "@/messages/es";
import type { GkFace, OutfieldFace } from "@/components/card/player-card";

const OUTFIELD_ORDER: (keyof OutfieldFace)[] = ["pac", "dri", "sho", "def", "pas", "phy"];
const GK_ORDER: (keyof GkFace)[] = ["div", "han", "kic", "ref", "spd", "pos"];

export type FaceStatsRadarProps = {
  face: { kind: "outfield"; stats: OutfieldFace } | { kind: "gk"; stats: GkFace };
  tier: "bronze" | "silver" | "gold" | "special" | "provisional";
  className?: string;
};

export function FaceStatsRadar({ face, tier, className }: FaceStatsRadarProps) {
  const entries: { key: string; label: string; value: number }[] =
    face.kind === "outfield"
      ? OUTFIELD_ORDER.map((key) => ({ key, label: es.card.faceStats[key], value: face.stats[key] }))
      : GK_ORDER.map((key) => ({ key, label: es.card.gkStats[key], value: face.stats[key] }));

  const color = `var(--color-tier-${tier}-accent)`;

  return (
    <div className={className}>
      <ChartContainer
        config={{ value: { label: es.profile.attributes, color } }}
        className="mx-auto aspect-square max-h-64"
      >
        <RadarChart data={entries} outerRadius="75%">
          <PolarGrid stroke="var(--color-border)" />
          <PolarAngleAxis dataKey="label" tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} />
          <PolarRadiusAxis domain={[0, 99]} tick={false} axisLine={false} />
          <Radar dataKey="value" stroke={color} fill={color} fillOpacity={0.35} />
        </RadarChart>
      </ChartContainer>
      <ul className="sr-only">
        {entries.map((entry) => (
          <li key={entry.key}>
            {entry.label}: {entry.value}
          </li>
        ))}
      </ul>
    </div>
  );
}
