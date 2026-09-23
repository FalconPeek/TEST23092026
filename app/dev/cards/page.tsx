import { notFound } from "next/navigation";
import { PlayerCard, type PlayerCardProps } from "@/components/card/player-card";

const outfieldFace: PlayerCardProps["face"] = {
  kind: "outfield",
  stats: { pac: 84, sho: 76, pas: 71, dri: 85, def: 42, phy: 68 },
};

const gkFace: PlayerCardProps["face"] = {
  kind: "gk",
  stats: { div: 79, han: 75, kic: 62, ref: 82, spd: 58, pos: 77 },
};

const playStyles: NonNullable<PlayerCardProps["playStyles"]> = [
  { code: "quick", label: "Rápido", plus: true },
  { code: "finesse", label: "Finura", plus: false },
  { code: "power", label: "Potencia", plus: false },
];

const goldCard: PlayerCardProps = {
  name: "Nico Oro",
  ovr: 81,
  position: "DC",
  tier: "gold",
  isProvisional: false,
  face: outfieldFace,
  weakFoot: 4,
  skillMoves: 3,
  playStyles: playStyles.slice(0, 2),
};

const cards: { key: string; props: PlayerCardProps }[] = [
  {
    key: "bronze",
    props: {
      name: "Lucas Bronce",
      ovr: 62,
      position: "DFC",
      tier: "bronze",
      isProvisional: false,
      face: outfieldFace,
      weakFoot: 2,
      skillMoves: 1,
    },
  },
  {
    key: "silver",
    props: {
      name: "Martín Plata",
      ovr: 69,
      position: "MC",
      tier: "silver",
      isProvisional: false,
      face: outfieldFace,
      weakFoot: 3,
      skillMoves: 2,
      playStyles: playStyles.slice(0, 1),
    },
  },
  { key: "gold", props: goldCard },
  {
    key: "special",
    props: {
      name: "Franco Especial",
      ovr: 91,
      position: "MCO",
      tier: "special",
      isProvisional: false,
      face: outfieldFace,
      weakFoot: 5,
      skillMoves: 5,
      playStyles,
      avatarUrl: null,
    },
  },
  {
    key: "provisional",
    props: {
      name: "Jugador Nuevo",
      ovr: 60,
      position: "ED",
      tier: "gold",
      isProvisional: true,
      face: outfieldFace,
      weakFoot: 3,
      skillMoves: 3,
    },
  },
  {
    key: "gk",
    props: {
      name: "Diego Arquero",
      ovr: 74,
      position: "POR",
      tier: "silver",
      isProvisional: false,
      face: gkFace,
      weakFoot: 3,
      skillMoves: 1,
    },
  },
  {
    key: "long-name",
    props: {
      name: "Bartolomé Alejandro Fernández de la Cruz",
      ovr: 77,
      position: "LD",
      tier: "gold",
      isProvisional: false,
      face: outfieldFace,
      weakFoot: 3,
      skillMoves: 3,
    },
  },
  {
    key: "no-playstyles",
    props: {
      name: "Sin Filigranas",
      ovr: 65,
      position: "MCD",
      tier: "bronze",
      isProvisional: false,
      face: outfieldFace,
      weakFoot: 1,
      skillMoves: 1,
      playStyles: [],
    },
  },
];

export default function DevCardsPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="flex min-h-dvh flex-col gap-8 px-4 py-8">
      <h1 className="text-xl font-semibold">Player card preview</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Tamaños (sm / md / lg)</h2>
        <div className="flex flex-wrap items-end gap-4">
          <PlayerCard {...goldCard} size="sm" />
          <PlayerCard {...goldCard} size="md" />
          <PlayerCard {...goldCard} size="lg" />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Tiers, provisoria, arquero, nombre largo, sin filigranas
        </h2>
        <div className="flex flex-wrap gap-4">
          {cards.map(({ key, props }) => (
            <PlayerCard key={key} {...props} />
          ))}
        </div>
      </section>
    </main>
  );
}
