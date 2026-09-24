import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayerCard } from "@/components/card/player-card";
import { FaceStatsRadar } from "@/components/charts/face-stats-radar";
import { AttributeList } from "@/components/player/attribute-list";
import { BadgeList, type EarnedBadge } from "@/components/player/badge-list";
import { ShareCardButton } from "@/components/player/share-card-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { es } from "@/messages/es";
import { formatDecimal } from "@/lib/format";
import { createClient, getUserId } from "@/lib/supabase/server";
import { toCardProps, type CardRow } from "@/lib/cards/to-card-props";
import type { PositionCode } from "@/lib/rating/positions";

export default async function PlayerProfilePage({
  params,
}: PageProps<"/g/[groupId]/jugadores/[playerId]">) {
  const { groupId, playerId } = await params;
  const userId = await getUserId();
  const supabase = await createClient();

  const { data: player } = await supabase
    .from("players")
    .select("id, group_id, user_id, display_name, avatar_url, primary_position, preferred_foot")
    .eq("id", playerId)
    .maybeSingle();

  if (!player || player.group_id !== groupId) notFound();

  const [{ data: cardRow }, { data: attributeRows }, { data: statRows }, { data: badgeRows }] = await Promise.all([
    supabase
      .from("player_cards")
      .select("ovr, position, tier, is_provisional, face, ovr_by_position, playstyles, weak_foot, skill_moves, n_raters")
      .eq("player_id", playerId)
      .maybeSingle(),
    supabase.from("attribute_ratings").select("attribute, value, n_raters").eq("player_id", playerId),
    supabase
      .from("match_stats")
      .select("goals, assists, clean_sheet, is_mvp, median_rating")
      .eq("player_id", playerId),
    supabase.from("player_badges").select("badge_code, count, badges(icon, sort)").eq("player_id", playerId),
  ]);

  const earnedBadges: EarnedBadge[] = (badgeRows ?? [])
    .filter((b) => b.badges !== null)
    .sort((a, b) => a.badges!.sort - b.badges!.sort)
    .map((b) => ({ code: b.badge_code, icon: b.badges!.icon, count: b.count }));

  const cardProps = toCardProps(
    { displayName: player.display_name, avatarUrl: player.avatar_url, preferredFoot: player.preferred_foot },
    cardRow as CardRow | null,
    es.playstyles,
  );

  const isOwnPlayer = player.user_id !== null && player.user_id === userId;

  const stats = statRows ?? [];
  const matchesPlayed = stats.length;
  const goals = stats.reduce((sum, s) => sum + s.goals, 0);
  const assists = stats.reduce((sum, s) => sum + s.assists, 0);
  const mvps = stats.filter((s) => s.is_mvp).length;
  const cleanSheets = stats.filter((s) => s.clean_sheet).length;
  const ratedMatches = stats.filter((s): s is typeof s & { median_rating: number } => s.median_rating !== null);
  const avgRating =
    ratedMatches.length > 0
      ? ratedMatches.reduce((sum, s) => sum + s.median_rating, 0) / ratedMatches.length
      : null;

  const ovrByPosition = (cardRow?.ovr_by_position ?? {}) as Partial<Record<PositionCode, number>>;
  const topPositions = Object.entries(ovrByPosition)
    .filter((entry): entry is [PositionCode, number] => typeof entry[1] === "number")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <div className="flex flex-col items-center gap-2">
        {cardProps ? (
          <>
            <PlayerCard {...cardProps} size="lg" />
            <p className="text-sm text-muted-foreground">{es.profile.raters(cardRow?.n_raters ?? 0)}</p>
            {cardProps.isProvisional && (
              <p className="text-xs text-muted-foreground">{es.card.provisionalHint}</p>
            )}
          </>
        ) : (
          <Card className="w-full max-w-sm">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              {es.profile.noCard}
            </CardContent>
          </Card>
        )}

        <div className="mt-2 flex gap-2">
          {!isOwnPlayer && (
            <Button asChild>
              <Link href={`/g/${groupId}/jugadores/${playerId}/votar`}>{es.profile.vote}</Link>
            </Button>
          )}
          {isOwnPlayer && (
            <Button asChild variant="outline">
              <Link href={`/g/${groupId}/jugadores/${playerId}/editar`}>{es.profile.editProfile}</Link>
            </Button>
          )}
        </div>

        {cardProps && <ShareCardButton playerId={playerId} playerName={player.display_name} />}
      </div>

      {cardProps && (
        <>
          <FaceStatsRadar
            face={cardProps.face}
            tier={cardProps.isProvisional ? "provisional" : cardProps.tier}
          />

          {topPositions.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">{es.profile.positionOvr}</h2>
              <div className="flex flex-wrap gap-1.5">
                {topPositions.map(([position, ovr]) => (
                  <Badge key={position} variant="outline">
                    {es.positions[position]} {ovr}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{es.profile.stats}</h2>
        {matchesPlayed === 0 ? (
          <Card>
            <CardContent className="py-4 text-sm text-muted-foreground">{es.profile.noStats}</CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[
              { label: es.profile.matches, value: matchesPlayed },
              { label: es.profile.goals, value: goals },
              { label: es.profile.assists, value: assists },
              { label: es.profile.mvps, value: mvps },
              { label: es.profile.cleanSheets, value: cleanSheets },
              { label: es.profile.avgRating, value: avgRating === null ? "—" : formatDecimal(avgRating) },
            ].map((tile) => (
              <Card key={tile.label} size="sm">
                <CardContent className="flex flex-col items-center gap-0.5 py-2 text-center">
                  <span className="text-lg font-semibold tabular-nums">{tile.value}</span>
                  <span className="text-[10px] text-muted-foreground">{tile.label}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{es.badges.title}</h2>
        <BadgeList badges={earnedBadges} />
      </div>

      {cardProps && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">{es.profile.attributes}</h2>
          <AttributeList
            position={cardProps.position}
            ratings={(attributeRows ?? []).map((r) => ({
              attribute: r.attribute,
              value: r.value,
              nRaters: r.n_raters,
            }))}
          />
        </div>
      )}
    </div>
  );
}
