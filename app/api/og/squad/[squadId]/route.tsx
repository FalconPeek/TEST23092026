// Shareable squad image (1080x1350): a published dream squad on its formation, with team rating
// and chemistry. Public by design like /api/og/card (link previews need no session), so it only
// ever renders PUBLISHED dream squads and reads just names, card OVR/tier and the layout.
import { ImageResponse } from "next/og";
import { z } from "zod";
import { es } from "@/messages/es";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSharedAppearancesAdmin, loadSquadContext } from "@/lib/server/squad-context";
import { buildSquadView } from "@/lib/squads/view";
import { OG_TIER_COLORS } from "@/lib/cards/og-card-data";
import type { CardTier } from "@/components/card/player-card";

export const runtime = "nodejs";

const WIDTH = 1080;
const HEIGHT = 1350;
const PITCH_TOP = 250;
const PITCH_HEIGHT = 1000;
const CACHE_CONTROL = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

const paramsSchema = z.object({ squadId: z.uuid() });

function isTier(value: string | null): value is CardTier {
  return value === "bronze" || value === "silver" || value === "gold" || value === "special";
}

export async function GET(_request: Request, { params }: { params: Promise<{ squadId: string }> }): Promise<Response> {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return new Response(null, { status: 400 });

  const admin = createAdminClient();
  const { data: squad } = await admin
    .from("squads")
    .select("group_id, name, team_size, formation, kind, published, squad_slots(slot, player_id)")
    .eq("id", parsed.data.squadId)
    .maybeSingle();
  if (!squad || squad.kind !== "dream" || !squad.published) return new Response(null, { status: 404 });

  const shared = await loadSharedAppearancesAdmin(admin, squad.group_id);
  const { context, settings } = await loadSquadContext(admin, squad.group_id, { sharedAppearances: shared });
  const view = buildSquadView({ team_size: squad.team_size, formation: squad.formation, slots: squad.squad_slots }, context, settings);
  if (!view) return new Response(null, { status: 404 });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(180deg, #0b1a10, #06120a)",
          color: "#f2f5f3",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", padding: "56px 64px 0" }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 800, textTransform: "uppercase" }}>{squad.name}</div>
          <div style={{ display: "flex", gap: 48, marginTop: 16, fontSize: 36, fontWeight: 700 }}>
            <div style={{ display: "flex" }}>{`${es.squads.ratingShort} ${view.rating.rating}`}</div>
            <div style={{ display: "flex" }}>{`${es.squads.chemistryShort} ${view.chemistry.total}/${view.chemistry.max}`}</div>
            <div style={{ display: "flex", opacity: 0.7 }}>{view.formation.code}</div>
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            left: 48,
            top: PITCH_TOP,
            width: WIDTH - 96,
            height: PITCH_HEIGHT,
            display: "flex",
            borderRadius: 32,
            border: "4px solid rgba(255,255,255,0.18)",
            background: "linear-gradient(180deg, #15803d, #166534)",
          }}
        />

        {view.slots.map((slot) => {
          const left = 48 + ((WIDTH - 96) * slot.x) / 100 - 80;
          const top = PITCH_TOP + (PITCH_HEIGHT * slot.y) / 100 - 90;
          const tier = slot.player?.provisional ? "provisional" : isTier(slot.player?.tier ?? null) ? (slot.player!.tier as CardTier) : "provisional";
          const colors = OG_TIER_COLORS[tier];
          return (
            <div
              key={slot.slot}
              style={{
                position: "absolute",
                left,
                top,
                width: 160,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 120,
                  height: 140,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 20,
                  background: slot.player ? `linear-gradient(160deg, ${colors.from}, ${colors.to})` : "rgba(0,0,0,0.25)",
                  color: slot.player ? colors.fg : "#d1d5db",
                  border: slot.player ? `3px solid ${colors.accent}` : "3px dashed rgba(255,255,255,0.4)",
                }}
              >
                <div style={{ display: "flex", fontSize: 48, fontWeight: 800 }}>{slot.player ? slot.player.ovr : "+"}</div>
                <div style={{ display: "flex", fontSize: 24, fontWeight: 700 }}>{slot.position}</div>
              </div>
              <div
                style={{
                  display: "flex",
                  marginTop: 8,
                  maxWidth: 160,
                  fontSize: 24,
                  fontWeight: 700,
                  textAlign: "center",
                  justifyContent: "center",
                }}
              >
                {slot.player?.name.split(" ")[0] ?? ""}
              </div>
            </div>
          );
        })}

        <div style={{ position: "absolute", right: 64, bottom: 28, display: "flex", fontSize: 28, fontWeight: 800, letterSpacing: 2 }}>
          {es.app.name.toUpperCase()}
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT, headers: { "Cache-Control": CACHE_CONTROL } },
  );
}
