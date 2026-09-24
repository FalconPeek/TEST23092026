"use client";

import { useState, useTransition } from "react";
import { cn } from "cn";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { es } from "@/messages/es";
import { submitMatchRatings } from "@/lib/actions/matches";
import { buildRatingsPayload, ratingsComplete, type RatingRow } from "@/lib/match/report";
import { GK_ATTRIBUTES, OUTFIELD_ATTRIBUTES, type AttributeKey } from "@/lib/rating/attributes";

export type RatingFormPlayer = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  isGk: boolean;
};

export type RatingPrefill = {
  rating: number;
  standoutAttributes: string[];
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

const RATING_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

function PlayerRatingRow({
  player,
  row,
  onRate,
  onToggleStandout,
}: {
  player: RatingFormPlayer;
  row: RatingRow;
  onRate: (playerId: string, value: number) => void;
  onToggleStandout: (playerId: string, attribute: AttributeKey) => void;
}) {
  const [query, setQuery] = useState("");
  const options: AttributeKey[] = player.isGk ? [...OUTFIELD_ATTRIBUTES, ...GK_ATTRIBUTES] : [...OUTFIELD_ATTRIBUTES];
  const filtered =
    query.trim() === ""
      ? []
      : options.filter((attr) => es.attributes[attr].toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8);

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <div className="flex items-center gap-2">
        <Avatar size="sm">
          {player.avatarUrl && <AvatarImage src={player.avatarUrl} alt="" />}
          <AvatarFallback>{initials(player.displayName)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{player.displayName}</span>
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {RATING_VALUES.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={row.rating === n}
            onClick={() => onRate(player.id, n)}
            className={cn(
              "flex h-11 items-center justify-center rounded-md border text-sm font-semibold",
              row.rating === n
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground",
            )}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-muted-foreground">{es.match.standout}</p>
        {row.standoutAttributes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {row.standoutAttributes.map((attr) => (
              <button
                key={attr}
                type="button"
                onClick={() => onToggleStandout(player.id, attr as AttributeKey)}
                className="flex min-h-11 items-center gap-1 rounded-full border border-primary bg-primary px-3 text-xs text-primary-foreground"
              >
                {es.attributes[attr as AttributeKey]} ×
              </button>
            ))}
          </div>
        )}
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={es.match.standout}
          className="h-11 text-xs"
        />
        {filtered.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {filtered.map((attr) => {
              const selected = row.standoutAttributes.includes(attr);
              return (
                <button
                  key={attr}
                  type="button"
                  disabled={!selected && row.standoutAttributes.length >= 2}
                  onClick={() => onToggleStandout(player.id, attr)}
                  className={cn(
                    "flex min-h-11 items-center rounded-full border px-3 text-xs",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground disabled:opacity-40",
                  )}
                >
                  {es.attributes[attr]}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function RatingForm({
  groupId,
  matchId,
  players,
  prefill,
}: {
  groupId: string;
  matchId: string;
  players: RatingFormPlayer[];
  prefill: Record<string, RatingPrefill>;
}) {
  const [ratings, setRatings] = useState<RatingRow[]>(() =>
    players.map((p) => ({
      targetPlayerId: p.id,
      rating: prefill[p.id]?.rating,
      standoutAttributes: prefill[p.id]?.standoutAttributes ?? [],
    })),
  );
  const [pending, startTransition] = useTransition();

  function handleRate(playerId: string, value: number) {
    setRatings((prev) => prev.map((r) => (r.targetPlayerId === playerId ? { ...r, rating: value } : r)));
  }

  function handleToggleStandout(playerId: string, attribute: AttributeKey) {
    setRatings((prev) =>
      prev.map((r) => {
        if (r.targetPlayerId !== playerId) return r;
        if (r.standoutAttributes.includes(attribute)) {
          return { ...r, standoutAttributes: r.standoutAttributes.filter((a) => a !== attribute) };
        }
        if (r.standoutAttributes.length >= 2) return r;
        return { ...r, standoutAttributes: [...r.standoutAttributes, attribute] };
      }),
    );
  }

  const complete = ratingsComplete(ratings, players.map((p) => p.id));
  const ratingByPlayer = new Map(ratings.map((r) => [r.targetPlayerId, r]));

  function handleSubmit() {
    if (!complete) return;
    startTransition(async () => {
      const result = await submitMatchRatings({ groupId, matchId, ratings: buildRatingsPayload(ratings) });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.matches.ratingsSaved);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium">{es.match.rateTitle}</h3>
        <p className="text-xs text-muted-foreground">{es.match.ratingsAnonymous}</p>
      </div>

      <div className="flex flex-col gap-2">
        {players.map((player) => {
          const row = ratingByPlayer.get(player.id);
          if (!row) return null;
          return (
            <PlayerRatingRow
              key={player.id}
              player={player}
              row={row}
              onRate={handleRate}
              onToggleStandout={handleToggleStandout}
            />
          );
        })}
      </div>

      <Button className="h-11 w-full" onClick={handleSubmit} disabled={pending || !complete}>
        {es.match.saveRatings}
      </Button>
    </div>
  );
}
