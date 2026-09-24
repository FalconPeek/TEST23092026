// Shareable card image: 1080x1350 (4:5, good for WhatsApp/Instagram). Public by design (see
// lib/supabase/proxy.ts's PUBLIC_PATHS) so a shared link's preview renders without a session --
// reads go through the admin client instead of the caller's session, and only the minimal columns
// this image needs are selected (never votes, emails, or other members' data).
import { ImageResponse } from "next/og";
import { es } from "@/messages/es";
import { buildOgCardData, ogCardParamsSchema } from "@/lib/cards/og-card-data";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CardRow } from "@/lib/cards/to-card-props";
import type { OutfieldFace, GkFace } from "@/components/card/player-card";

export const runtime = "nodejs";

const WIDTH = 1080;
const HEIGHT = 1350;

const CACHE_CONTROL = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

const OUTFIELD_ORDER: (keyof OutfieldFace)[] = ["pac", "dri", "sho", "def", "pas", "phy"];
const GK_ORDER: (keyof GkFace)[] = ["div", "han", "kic", "ref", "spd", "pos"];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0] + parts[1]![0]).toUpperCase();
}

// The bundled default font has no ★ glyph (and the dynamic font fetch fails offline), so draw it.
function Star({ color }: { color: string }) {
  return (
    <svg width={28} height={28} viewBox="0 0 24 24">
      <path fill={color} d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.7 7.3L12 17.8 5.7 21.5l1.7-7.3L2 9.5l7.1-.6z" />
    </svg>
  );
}

export async function GET(_request: Request, { params }: { params: Promise<{ playerId: string }> }): Promise<Response> {
  const { playerId } = await params;
  const parsed = ogCardParamsSchema.safeParse({ playerId });
  if (!parsed.success) {
    return new Response(null, { status: 400 });
  }

  const supabase = createAdminClient();
  const [{ data: player }, { data: cardRow }] = await Promise.all([
    supabase
      .from("players")
      .select("display_name, avatar_url")
      .eq("id", parsed.data.playerId)
      .maybeSingle(),
    supabase
      .from("player_cards")
      .select("ovr, position, tier, is_provisional, face, playstyles, weak_foot, skill_moves")
      .eq("player_id", parsed.data.playerId)
      .maybeSingle(),
  ]);

  if (!player) {
    return new Response(null, { status: 404 });
  }

  // Satori fetches the avatar server-side: only follow https URLs, never internal/other schemes.
  const avatarUrl = player.avatar_url?.startsWith("https://") ? player.avatar_url : null;
  const data = buildOgCardData({ displayName: player.display_name, avatarUrl }, cardRow as CardRow | null);
  if (!data) {
    return new Response(null, { status: 404 });
  }

  const { card, positionLabel, tierLabel, colors } = data;
  const face = card.face;
  const statEntries =
    face.kind === "outfield"
      ? OUTFIELD_ORDER.map((key) => ({ key, value: face.stats[key], label: es.card.faceStats[key] }))
      : GK_ORDER.map((key) => ({ key, value: face.stats[key], label: es.card.gkStats[key] }));
  const playStyles = (card.playStyles ?? []).slice(0, 3);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 72,
          background: `linear-gradient(160deg, ${colors.from}, ${colors.to})`,
          color: colors.fg,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 216, fontWeight: 800, lineHeight: 1 }}>{card.ovr}</div>
            <div style={{ display: "flex", fontSize: 44, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase" }}>
              {positionLabel}
            </div>
          </div>

          {card.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- ImageResponse (Satori) renders its own <img>, not next/image.
            <img
              src={card.avatarUrl}
              width={240}
              height={240}
              style={{ borderRadius: "50%", border: `6px solid ${colors.accent}`, objectFit: "cover" }}
              alt=""
            />
          ) : (
            <div
              style={{
                width: 240,
                height: 240,
                borderRadius: "50%",
                border: `6px solid ${colors.accent}`,
                background: "rgba(0,0,0,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 84,
                fontWeight: 800,
              }}
            >
              {initials(card.name)}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 24 }}>
          <div style={{ display: "flex", fontSize: 60, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase" }}>{card.name}</div>
          <div
            style={{
              display: "flex",
              marginTop: 12,
              padding: "8px 24px",
              borderRadius: 999,
              background: "rgba(0,0,0,0.25)",
              fontSize: 30,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 2,
            }}
          >
            {tierLabel}
          </div>
        </div>

        {playStyles.length > 0 && (
          <div style={{ display: "flex", flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 24 }}>
            {playStyles.map((ps) => (
              <div
                key={ps.code}
                style={{
                  display: "flex",
                  padding: "8px 20px",
                  borderRadius: 999,
                  background: "rgba(0,0,0,0.2)",
                  fontSize: 24,
                  fontWeight: 700,
                  textTransform: "uppercase",
                }}
              >
                {ps.plus ? `${ps.label}+` : ps.label}
              </div>
            ))}
          </div>
        )}

        {/* Satori has no CSS grid: two columns via flex-wrap at 50% width. */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            rowGap: 28,
            marginTop: "auto",
            marginBottom: 32,
          }}
        >
          {statEntries.map(({ key, value, label }) => (
            <div key={key} style={{ display: "flex", flexDirection: "row", alignItems: "baseline", gap: 16, width: "50%" }}>
              <div style={{ display: "flex", fontSize: 56, fontWeight: 800 }}>{value}</div>
              <div style={{ display: "flex", fontSize: 30, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", opacity: 0.85 }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: `2px solid rgba(255,255,255,0.25)`,
            paddingTop: 24,
            fontSize: 28,
            fontWeight: 600,
          }}
        >
          <div style={{ display: "flex", gap: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {card.weakFoot}
              <Star color={colors.fg} /> {es.card.weakFoot}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {card.skillMoves}
              <Star color={colors.fg} /> {es.card.skillMoves}
            </div>
          </div>
          <div style={{ display: "flex", fontWeight: 800, letterSpacing: 2, textTransform: "uppercase" }}>{es.app.name}</div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: { "Cache-Control": CACHE_CONTROL },
    },
  );
}
