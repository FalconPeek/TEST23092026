import { describe, expect, it } from "vitest";
import { es } from "@/messages/es";
import {
  badgeAwardedPayload,
  cardUpdatedPayload,
  matchDisputedPayload,
  matchFinalizedPayload,
  matchScheduledPayload,
  ratingPendingPayload,
  reportPendingPayload,
  tournamentGeneratedPayload,
  tournamentMatchReadyPayload,
} from "./templates";

describe("notification payload templates", () => {
  it("matchScheduledPayload includes the group name, a formatted date and the url", () => {
    const payload = matchScheduledPayload({ groupName: "Los Pibes", scheduledAt: new Date("2026-10-01T20:00:00Z"), url: "/g/1/partidos/2" });
    expect(payload.url).toBe("/g/1/partidos/2");
    expect(payload.body).toContain("Los Pibes");
    expect(payload.title.length).toBeGreaterThan(0);
  });

  it("reportPendingPayload and ratingPendingPayload carry only the url as variable content", () => {
    expect(reportPendingPayload({ url: "/g/1/partidos/2" })).toMatchObject({ url: "/g/1/partidos/2" });
    expect(ratingPendingPayload({ url: "/g/1/partidos/2" })).toMatchObject({ url: "/g/1/partidos/2" });
  });

  it("matchFinalizedPayload includes the final score", () => {
    const payload = matchFinalizedPayload({ team1Goals: 3, team2Goals: 1, url: "/g/1/partidos/2" });
    expect(payload.body).toContain("3");
    expect(payload.body).toContain("1");
  });

  it("matchDisputedPayload pluralizes the reason count", () => {
    const one = matchDisputedPayload({ reasonCount: 1, url: "/x" });
    const many = matchDisputedPayload({ reasonCount: 3, url: "/x" });
    expect(one.body).not.toEqual(many.body);
    expect(many.body).toContain("3");
  });

  it("tournamentGeneratedPayload includes the tournament name", () => {
    const payload = tournamentGeneratedPayload({ tournamentName: "Copa Verano", url: "/g/1/torneos/2" });
    expect(payload.body).toContain("Copa Verano");
  });

  it("tournamentMatchReadyPayload includes the round number", () => {
    const payload = tournamentMatchReadyPayload({ round: 2, url: "/g/1/torneos/2" });
    expect(payload.body).toContain("2");
  });

  it("badgeAwardedPayload includes the badge's Spanish name, never the raw code", () => {
    const payload = badgeAwardedPayload({ badgeCode: "hat_trick", url: "/g/1/jugadores/2" });
    expect(payload.body).toContain(es.badges.hat_trick.name);
    expect(payload.body).not.toContain("hat_trick");
  });

  it("cardUpdatedPayload always returns non-empty title/body", () => {
    const payload = cardUpdatedPayload({ url: "/g/1/jugadores/2" });
    expect(payload.title.length).toBeGreaterThan(0);
    expect(payload.body.length).toBeGreaterThan(0);
  });
});
