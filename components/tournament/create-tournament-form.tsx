"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { es } from "@/messages/es";
import { createTournament } from "@/lib/actions/tournaments";
import {
  defaultTournamentSettings,
  tournamentFormats,
  tournamentSettingsSchema,
  seedingModes,
  drawResolutions,
  type Tiebreaker,
  type TournamentFormat,
  type TournamentSettings,
} from "@/lib/settings/tournament";

const TEAM_SIZES = [5, 6, 7, 8, 9, 11] as const;
type TeamSize = (typeof TEAM_SIZES)[number];
type EntryMode = "teams" | "individual";

function setIn(obj: unknown, path: string[], value: unknown): unknown {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  const record = (obj ?? {}) as Record<string, unknown>;
  return { ...record, [head]: setIn(record[head], rest, value) };
}

// Only the fields whose schema chains both a min and a max; a zod issue only ever carries the
// one bound it violated (points.win/draw/loss are .min()-only, so they fall back to fieldInvalid).
const FIELD_RANGES: Record<string, [number, number]> = {
  "groups_ko.group_count": [1, 16],
  "groups_ko.qualifiers_per_group": [1, 8],
  "swiss.rounds": [1, 20],
};

function zodIssueMessage(dotted: string, code: string): string {
  if (code === "invalid_type") return es.errors.fieldRequired;
  if (code === "too_small" || code === "too_big") {
    const range = FIELD_RANGES[dotted];
    if (range) return es.errors.fieldRange(range[0], range[1]);
  }
  return es.errors.fieldInvalid;
}

function TiebreakerEditor({
  value,
  onChange,
}: {
  value: readonly Tiebreaker[];
  onChange: (next: Tiebreaker[]) => void;
}) {
  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[index], next[j]] = [next[j]!, next[index]!];
    onChange(next);
  }

  return (
    <ol className="flex flex-col gap-1.5">
      {value.map((tb, i) => (
        <li
          key={tb}
          className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-1.5 ring-1 ring-foreground/10"
        >
          <span className="text-sm">
            {i + 1}. {es.tournaments.settings.tiebreakerNames[tb]}
          </span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label={es.tournaments.settings.moveUp}
            >
              <ArrowUp className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11"
              onClick={() => move(i, 1)}
              disabled={i === value.length - 1}
              aria-label={es.tournaments.settings.moveDown}
            >
              <ArrowDown className="size-4" />
            </Button>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function CreateTournamentForm({ groupId, defaultTeamSize }: { groupId: string; defaultTeamSize: TeamSize }) {
  const [name, setName] = useState("");
  const [format, setFormat] = useState<TournamentFormat>("league");
  const [entryMode, setEntryMode] = useState<EntryMode>("teams");
  const [teamSize, setTeamSize] = useState<TeamSize>(defaultTeamSize);
  const [settings, setSettings] = useState<TournamentSettings>(defaultTournamentSettings);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function field(path: string[], value: unknown) {
    setSettings((prev) => setIn(prev, path, value) as TournamentSettings);
  }

  const showPoints = format === "league" || format === "groups_ko" || format === "swiss";
  const showTopTiebreakers = format === "league" || format === "groups_ko";
  const showSwissTiebreakers = format === "swiss";
  const showKoDrawResolution = format === "single_elim" || format === "double_elim" || format === "groups_ko";

  function handleSubmit() {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setErrors({ name: es.errors.validation });
      return;
    }

    const parsed = tournamentSettingsSchema.safeParse(settings);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const dotted = issue.path.join(".");
        map[dotted] = zodIssueMessage(dotted, issue.code);
      }
      setErrors(map);
      toast.error(es.errors.validation);
      return;
    }
    setErrors({});

    startTransition(async () => {
      const result = await createTournament({
        groupId,
        name: trimmedName,
        format,
        teamSize,
        entryMode,
        settings: parsed.data,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.tournaments.created);
      router.push(`/g/${groupId}/torneos/${result.data.tournamentId}`);
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tournament-name">{es.tournaments.name}</Label>
        <Input id="tournament-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{es.tournaments.format}</Label>
        <RadioGroup value={format} onValueChange={(v) => setFormat(v as TournamentFormat)}>
          {tournamentFormats.map((f) => (
            <label
              key={f}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-background p-3 ring-1 ring-foreground/10 has-[[data-state=checked]]:ring-2 has-[[data-state=checked]]:ring-primary"
            >
              <RadioGroupItem value={f} />
              <span className="text-sm">{es.tournaments.formats[f]}</span>
            </label>
          ))}
        </RadioGroup>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>{es.tournaments.entryMode}</Label>
          <Select value={entryMode} onValueChange={(v) => setEntryMode(v as EntryMode)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="teams">{es.tournaments.entryModes.teams}</SelectItem>
              <SelectItem value="individual">{es.tournaments.entryModes.individual}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>{es.tournaments.teamSize}</Label>
          <Select value={String(teamSize)} onValueChange={(v) => setTeamSize(Number(v) as TeamSize)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEAM_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {es.matches.teamSizeOption(size)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {format === "league" && (
        <label className="flex items-center justify-between gap-2">
          <span className="text-sm">{es.tournaments.settings.leagueDoubleRoundRobinLabel}</span>
          <Switch
            checked={settings.league.double_round_robin}
            onCheckedChange={(checked) => field(["league", "double_round_robin"], checked)}
          />
        </label>
      )}

      {format === "single_elim" && (
        <label className="flex items-center justify-between gap-2">
          <span className="text-sm">{es.tournaments.settings.singleElimThirdPlaceLabel}</span>
          <Switch
            checked={settings.single_elim.third_place}
            onCheckedChange={(checked) => field(["single_elim", "third_place"], checked)}
          />
        </label>
      )}

      {format === "double_elim" && (
        <label className="flex items-center justify-between gap-2">
          <span className="text-sm">{es.tournaments.settings.doubleElimGrandFinalResetLabel}</span>
          <Switch
            checked={settings.double_elim.grand_final_reset}
            onCheckedChange={(checked) => field(["double_elim", "grand_final_reset"], checked)}
          />
        </label>
      )}

      {format === "groups_ko" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="groups-ko-group-count">{es.tournaments.settings.groupsKoGroupCountLabel}</Label>
              <Input
                id="groups-ko-group-count"
                type="number"
                min={1}
                max={16}
                value={settings.groups_ko.group_count}
                onChange={(e) => field(["groups_ko", "group_count"], Number(e.target.value))}
              />
              {errors["groups_ko.group_count"] && (
                <p className="text-sm text-destructive">{errors["groups_ko.group_count"]}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="groups-ko-qualifiers">{es.tournaments.settings.groupsKoQualifiersLabel}</Label>
              <Input
                id="groups-ko-qualifiers"
                type="number"
                min={1}
                max={8}
                value={settings.groups_ko.qualifiers_per_group}
                onChange={(e) => field(["groups_ko", "qualifiers_per_group"], Number(e.target.value))}
              />
              {errors["groups_ko.qualifiers_per_group"] && (
                <p className="text-sm text-destructive">{errors["groups_ko.qualifiers_per_group"]}</p>
              )}
            </div>
          </div>
          <label className="flex items-center justify-between gap-2">
            <span className="text-sm">{es.tournaments.settings.groupsKoDoubleRoundRobinLabel}</span>
            <Switch
              checked={settings.groups_ko.double_round_robin}
              onCheckedChange={(checked) => field(["groups_ko", "double_round_robin"], checked)}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-sm">{es.tournaments.settings.groupsKoThirdPlaceLabel}</span>
            <Switch
              checked={settings.groups_ko.third_place}
              onCheckedChange={(checked) => field(["groups_ko", "third_place"], checked)}
            />
          </label>
        </div>
      )}

      {format === "swiss" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="swiss-rounds">{es.tournaments.settings.swissRoundsLabel}</Label>
          <Input
            id="swiss-rounds"
            type="number"
            min={1}
            max={20}
            placeholder={es.tournaments.settings.swissRoundsAuto}
            value={settings.swiss.rounds ?? ""}
            onChange={(e) => field(["swiss", "rounds"], e.target.value === "" ? null : Number(e.target.value))}
          />
          {errors["swiss.rounds"] && <p className="text-sm text-destructive">{errors["swiss.rounds"]}</p>}
        </div>
      )}

      <details open={rulesOpen} onToggle={(e) => setRulesOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer text-sm font-medium">{es.tournaments.settings.rulesTitle}</summary>

        <div className="mt-3 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>{es.tournaments.settings.seedingLabel}</Label>
            <Select value={settings.seeding} onValueChange={(v) => field(["seeding"], v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {seedingModes.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {es.tournaments.settings.seedingOptions[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showKoDrawResolution && (
            <div className="flex flex-col gap-1.5">
              <Label>{es.tournaments.settings.koDrawResolutionLabel}</Label>
              <Select value={settings.ko_draw_resolution} onValueChange={(v) => field(["ko_draw_resolution"], v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {drawResolutions.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {es.tournaments.settings.koDrawResolutionOptions[mode]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showPoints && (
            <div className="flex flex-col gap-3">
              <Label>{es.tournaments.settings.pointsTitle}</Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="points-win">{es.tournaments.settings.pointsWinLabel}</Label>
                  <Input
                    id="points-win"
                    type="number"
                    min={0}
                    value={settings.points.win}
                    onChange={(e) => field(["points", "win"], Number(e.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="points-draw">{es.tournaments.settings.pointsDrawLabel}</Label>
                  <Input
                    id="points-draw"
                    type="number"
                    min={0}
                    value={settings.points.draw}
                    onChange={(e) => field(["points", "draw"], Number(e.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="points-loss">{es.tournaments.settings.pointsLossLabel}</Label>
                  <Input
                    id="points-loss"
                    type="number"
                    min={0}
                    value={settings.points.loss}
                    onChange={(e) => field(["points", "loss"], Number(e.target.value))}
                  />
                </div>
              </div>
              <label className="flex items-center justify-between gap-2">
                <span className="text-sm">{es.tournaments.settings.byeCountsAsWinLabel}</span>
                <Switch
                  checked={settings.points.bye_counts_as_win}
                  onCheckedChange={(checked) => field(["points", "bye_counts_as_win"], checked)}
                />
              </label>
            </div>
          )}

          {showTopTiebreakers && (
            <div className="flex flex-col gap-1.5">
              <Label>{es.tournaments.settings.tiebreakersTitle}</Label>
              <TiebreakerEditor
                value={settings.tiebreakers}
                onChange={(next) => field(["tiebreakers"], next)}
              />
            </div>
          )}

          {showSwissTiebreakers && (
            <div className="flex flex-col gap-1.5">
              <Label>{es.tournaments.settings.tiebreakersTitle}</Label>
              <TiebreakerEditor
                value={settings.swiss.tiebreakers}
                onChange={(next) => field(["swiss", "tiebreakers"], next)}
              />
            </div>
          )}
        </div>
      </details>

      <Button onClick={handleSubmit} disabled={pending}>
        {es.tournaments.new}
      </Button>
    </div>
  );
}
