"use client";

import { useState, useTransition } from "react";
import { cn } from "cn";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VoteSlider } from "@/components/scouting/vote-slider";
import { es } from "@/messages/es";
import { submitPlaystyleVotes, submitScoutingVotes, submitStarVotes } from "@/lib/actions/scouting";
import {
  GK_ATTRIBUTES,
  GK_QUICK_KEYS,
  OUTFIELD_FACE_STATS,
  isGkQuickKey,
  subAttributesOfFaceStat,
  type AttributeKey,
  type OutfieldFaceStat,
} from "@/lib/rating/attributes";
import { GK_PLAYSTYLES, PLAYSTYLES, type PlayStyleCode } from "@/lib/rating/playstyles";

export type ScoutingReason =
  | "not_found"
  | "target_left"
  | "not_member"
  | "self"
  | "spectator"
  | "no_shared_match"
  | "cooldown"
  | "ok";

export type ScoutingFormProps = {
  groupId: string;
  targetPlayerId: string;
  targetName: string;
  isGk: boolean;
  canVote: boolean;
  reason: ScoutingReason;
  nextVoteAt: string | null;
  initialTab: "quick" | "detailed";
  prefillQuickVotes: Record<string, number>;
  prefillDetailedVotes: Record<string, number>;
};

const GK_PLAYSTYLE_SET = new Set<string>(GK_PLAYSTYLES);

/** GK targets vote on the card's GK stats (VEL/EST/MAN/SAQ/REF/COL) instead of the outfield six;
 * "pac" is still the key for VEL since a GK's SPD face stat is derived from it, same as outfield. */
const GK_QUICK_VOTE_KEYS = ["pac", ...Object.keys(GK_QUICK_KEYS)] as const;

function quickVoteLabel(key: string, isGk: boolean): string {
  if (isGk) {
    if (key === "pac") return es.card.gkStats.spd;
    if (isGkQuickKey(key)) return es.card.gkStats[key];
  }
  return es.card.faceStats[key as OutfieldFaceStat];
}

export function ScoutingForm({
  groupId,
  targetPlayerId,
  targetName,
  isGk,
  canVote,
  reason,
  nextVoteAt,
  initialTab,
  prefillQuickVotes,
  prefillDetailedVotes,
}: ScoutingFormProps) {
  const disabled = !canVote;

  const [tab, setTab] = useState<"quick" | "detailed">(initialTab);
  const [quickVotes, setQuickVotes] = useState<Record<string, number>>(() => ({
    ...prefillQuickVotes,
  }));
  const [detailedVotes, setDetailedVotes] = useState<Record<string, number>>(() => ({
    ...prefillDetailedVotes,
  }));
  const [playstyles, setPlaystyles] = useState<PlayStyleCode[]>([]);
  const [weakFoot, setWeakFoot] = useState<number | undefined>(undefined);
  const [skillMoves, setSkillMoves] = useState<number | undefined>(undefined);

  const [votesPending, startVotesTransition] = useTransition();
  const [playstylesPending, startPlaystylesTransition] = useTransition();
  const [starsPending, startStarsTransition] = useTransition();

  function handleSubmitVotes() {
    const mode = tab;
    const votes = mode === "quick" ? quickVotes : detailedVotes;
    startVotesTransition(async () => {
      const result = await submitScoutingVotes({ groupId, targetPlayerId, mode, votes });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.scouting.saved);
    });
  }

  function togglePlaystyle(code: PlayStyleCode) {
    setPlaystyles((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= 5) return prev;
      return [...prev, code];
    });
  }

  function handleSubmitPlaystyles() {
    startPlaystylesTransition(async () => {
      const result = await submitPlaystyleVotes({ groupId, targetPlayerId, playstyles });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.scouting.saved);
    });
  }

  function handleSubmitStars() {
    startStarsTransition(async () => {
      const result = await submitStarVotes({ groupId, targetPlayerId, weakFoot, skillMoves });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.scouting.saved);
      setWeakFoot(undefined);
      setSkillMoves(undefined);
    });
  }

  const reasonText: string =
    reason === "cooldown" ? es.scouting.reasons.cooldown(nextVoteAt ?? new Date()) : es.scouting.reasons[reason];

  const playstyleOptions = isGk ? PLAYSTYLES : PLAYSTYLES.filter((code) => !GK_PLAYSTYLE_SET.has(code));

  const detailedGroups: { heading: string; attributes: readonly AttributeKey[] }[] = OUTFIELD_FACE_STATS.map(
    (stat) => ({
      heading: es.card.faceStats[stat],
      attributes: subAttributesOfFaceStat(stat),
    }),
  );
  if (isGk) {
    detailedGroups.push({ heading: es.profile.goalkeeper, attributes: GK_ATTRIBUTES });
  }

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div>
        <h1 className="text-xl font-semibold">{es.scouting.title(targetName)}</h1>
        <p className="text-xs text-muted-foreground">{es.scouting.anonymous}</p>
      </div>

      {!canVote && (
        <Alert variant="destructive">
          <AlertTitle>{es.errors.forbidden}</AlertTitle>
          <AlertDescription>{reasonText}</AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as "quick" | "detailed")}>
        <TabsList className="w-full">
          <TabsTrigger value="quick" className="flex-1">
            {es.scouting.quick}
          </TabsTrigger>
          <TabsTrigger value="detailed" className="flex-1">
            {es.scouting.detailed}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quick" className="flex flex-col gap-4 pt-4">
          <p className="text-sm text-muted-foreground">{es.scouting.quickHelp}</p>
          {(isGk ? GK_QUICK_VOTE_KEYS : OUTFIELD_FACE_STATS).map((key) => (
            <VoteSlider
              key={key}
              label={quickVoteLabel(key, isGk)}
              value={quickVotes[key]}
              onChange={(v) => setQuickVotes((prev) => ({ ...prev, [key]: v }))}
              disabled={disabled}
            />
          ))}
        </TabsContent>

        <TabsContent value="detailed" className="flex flex-col gap-3 pt-4">
          <p className="text-sm text-muted-foreground">{es.scouting.detailedHelp}</p>
          {detailedGroups.map((group) => (
            <details key={group.heading} open className="rounded-lg bg-card p-3 ring-1 ring-foreground/10">
              <summary className="cursor-pointer text-sm font-medium">{group.heading}</summary>
              <div className="mt-3 flex flex-col gap-4">
                {group.attributes.map((attr) => (
                  <VoteSlider
                    key={attr}
                    label={es.attributes[attr]}
                    value={detailedVotes[attr]}
                    onChange={(v) => setDetailedVotes((prev) => ({ ...prev, [attr]: v }))}
                    disabled={disabled}
                  />
                ))}
              </div>
            </details>
          ))}
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-20 z-30 -mx-4 bg-background/95 px-4 py-2 backdrop-blur-sm">
        <Button
          className="w-full"
          onClick={handleSubmitVotes}
          disabled={
            disabled ||
            votesPending ||
            (tab === "quick" && Object.keys(quickVotes).length === 0) ||
            (tab === "detailed" && Object.keys(detailedVotes).length === 0)
          }
        >
          {es.scouting.save}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{es.scouting.playstylesTitle}</h2>
        <div className="flex flex-wrap gap-1.5">
          {playstyleOptions.map((code) => {
            const selected = playstyles.includes(code);
            return (
              <button
                key={code}
                type="button"
                disabled={disabled || (!selected && playstyles.length >= 5)}
                onClick={() => togglePlaystyle(code)}
                aria-pressed={selected}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground disabled:opacity-40",
                )}
              >
                {es.playstyles[code]}
              </button>
            );
          })}
        </div>
        <Button
          variant="outline"
          className="self-start"
          onClick={handleSubmitPlaystyles}
          disabled={disabled || playstylesPending}
        >
          {es.common.save}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{es.scouting.starsTitle}</h2>
        <StarPicker label={es.card.weakFoot} value={weakFoot} onChange={setWeakFoot} disabled={disabled} />
        <StarPicker label={es.card.skillMoves} value={skillMoves} onChange={setSkillMoves} disabled={disabled} />
        <Button
          variant="outline"
          className="self-start"
          onClick={handleSubmitStars}
          disabled={disabled || starsPending || (weakFoot === undefined && skillMoves === undefined)}
        >
          {es.common.save}
        </Button>
      </div>
    </div>
  );
}

function StarPicker({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            aria-pressed={value === n}
            className={cn(
              "flex size-7 items-center justify-center rounded-full border text-xs font-medium disabled:opacity-40",
              value !== undefined && n <= value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground",
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
