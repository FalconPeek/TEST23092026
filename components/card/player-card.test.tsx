import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PlayerCard, type PlayerCardProps } from "./player-card";
import { es } from "@/messages/es";

afterEach(cleanup);

const outfieldFace: PlayerCardProps["face"] = {
  kind: "outfield",
  stats: { pac: 80, sho: 75, pas: 70, dri: 82, def: 40, phy: 65 },
};

const gkFace: PlayerCardProps["face"] = {
  kind: "gk",
  stats: { div: 78, han: 74, kic: 60, ref: 81, spd: 55, pos: 76 },
};

const baseProps: PlayerCardProps = {
  name: "Juan Pérez",
  ovr: 78,
  position: "DC",
  tier: "gold",
  isProvisional: false,
  face: outfieldFace,
  weakFoot: 3,
  skillMoves: 4,
};

describe("PlayerCard", () => {
  it("renders the outfield face labels (RIT, TIR, PAS, REG, DEF, FIS)", () => {
    render(<PlayerCard {...baseProps} />);
    expect(screen.getByText(es.card.faceStats.pac)).toBeInTheDocument();
    expect(screen.getByText(es.card.faceStats.sho)).toBeInTheDocument();
    expect(screen.getByText(es.card.faceStats.pas)).toBeInTheDocument();
    expect(screen.getByText(es.card.faceStats.dri)).toBeInTheDocument();
    expect(screen.getByText(es.card.faceStats.def)).toBeInTheDocument();
    expect(screen.getByText(es.card.faceStats.phy)).toBeInTheDocument();
  });

  it("renders the GK face labels (EST, MAN, SAQ, REF, VEL, COL)", () => {
    render(<PlayerCard {...baseProps} position="POR" face={gkFace} />);
    expect(screen.getByText(es.card.gkStats.div)).toBeInTheDocument();
    expect(screen.getByText(es.card.gkStats.han)).toBeInTheDocument();
    expect(screen.getByText(es.card.gkStats.kic)).toBeInTheDocument();
    expect(screen.getByText(es.card.gkStats.ref)).toBeInTheDocument();
    expect(screen.getByText(es.card.gkStats.spd)).toBeInTheDocument();
    expect(screen.getByText(es.card.gkStats.pos)).toBeInTheDocument();
  });

  it("shows the OVR and position", () => {
    render(<PlayerCard {...baseProps} />);
    expect(screen.getByText("78")).toBeInTheDocument();
    expect(screen.getByText("DC")).toBeInTheDocument();
    expect(
      screen.getByRole("figure", { name: `Juan Pérez, 78 ${es.positions.DC}` }),
    ).toBeInTheDocument();
  });

  it("caps PlayStyles to 3 even when more are given", () => {
    render(
      <PlayerCard
        {...baseProps}
        playStyles={[
          { code: "quick", label: "Rápido", plus: false },
          { code: "finesse", label: "Finura", plus: true },
          { code: "power", label: "Potencia", plus: false },
          { code: "vision", label: "Visión", plus: false },
        ]}
      />,
    );
    expect(screen.getByTitle("Rápido")).toBeInTheDocument();
    expect(screen.getByTitle("Finura")).toBeInTheDocument();
    expect(screen.getByTitle("Potencia")).toBeInTheDocument();
    expect(screen.queryByTitle("Visión")).not.toBeInTheDocument();
  });

  it("renders the provisional badge and hides the underlying tier when isProvisional", () => {
    render(<PlayerCard {...baseProps} isProvisional />);
    expect(screen.getByText(es.card.tiers.provisional)).toBeInTheDocument();
    expect(screen.queryByText(es.card.tiers.gold)).not.toBeInTheDocument();
  });
});
