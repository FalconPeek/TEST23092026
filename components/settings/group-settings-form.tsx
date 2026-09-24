"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { es } from "@/messages/es";
import { updateGroup } from "@/lib/actions/groups";
import {
  defaultGroupSettings,
  groupSettingsSchema,
  type GroupSettings,
} from "@/lib/settings/group";

const TEAM_SIZES = [5, 6, 7, 8, 9, 11] as const;

function setIn(obj: unknown, path: string[], value: unknown): unknown {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  const record = (obj ?? {}) as Record<string, unknown>;
  return { ...record, [head]: setIn(record[head], rest, value) };
}

function getIn(obj: unknown, path: string[]): unknown {
  return path.reduce<unknown>((acc, key) => {
    if (acc === null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function humanize(key: string): string {
  const words = key.split("_");
  return words[0]!.charAt(0).toUpperCase() + words[0]!.slice(1) + (words.length > 1 ? " " + words.slice(1).join(" ") : "");
}

// Only the fields whose schema actually chains both a min and a max; a zod issue only ever
// carries the one bound it violated, so a single-bounded field (most of them: .positive(),
// .min() alone, …) falls back to the generic `fieldInvalid` copy instead of a fabricated range.
const FIELD_RANGES: Record<string, [number, number]> = {
  "windows.report_hours": [1, 24 * 14],
  "windows.rating_hours": [1, 24 * 14],
  "rating.spectator_weight": [0, 1],
  "tiers.silver_min": [1, 99],
  "tiers.gold_min": [1, 99],
  "tiers.special_min": [1, 99],
  "rating.default_mean": [1, 99],
  "rating.collusion_weight": [0, 1],
  "rating.form.center": [1, 10],
  "rating.form.primary_attr_count": [1, 29],
};

function zodIssueMessage(dotted: string, code: string): string {
  if (code === "invalid_type") return es.errors.fieldRequired;
  if (code === "too_small" || code === "too_big") {
    const range = FIELD_RANGES[dotted];
    if (range) return es.errors.fieldRange(range[0], range[1]);
  }
  return es.errors.fieldInvalid;
}

type NumericField = { path: string[]; dotted: string; label: string };

const RATING_COMMON_PATHS = new Set(["rating.spectator_weight", "rating.min_raters"]);

function collectNumericFields(obj: Record<string, unknown>, prefix: string[]): NumericField[] {
  const out: NumericField[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = [...prefix, key];
    const dotted = path.join(".");
    if (RATING_COMMON_PATHS.has(dotted)) continue;
    if (typeof value === "number") {
      out.push({ path, dotted, label: humanize(key) });
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      out.push(...collectNumericFields(value as Record<string, unknown>, path));
    }
  }
  return out;
}

export function GroupSettingsForm({
  groupId,
  initialName,
  initialSettings,
}: {
  groupId: string;
  initialName: string;
  initialSettings: GroupSettings;
}) {
  const [name, setName] = useState(initialName);
  const [settings, setSettings] = useState<GroupSettings>(initialSettings);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rawValues, setRawValues] = useState<Record<string, string>>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function field(path: string[], value: unknown) {
    setSettings((prev) => setIn(prev, path, value) as GroupSettings);
  }

  /** A cleared number input keeps its empty string here instead of silently becoming 0 in
   * `settings` -- handleSubmit blocks with `groupSettings.required` while any path is empty. */
  function numberValue(path: string[]): string {
    const dotted = path.join(".");
    return dotted in rawValues ? rawValues[dotted]! : String(getIn(settings, path));
  }

  function numberField(path: string[], raw: string) {
    const dotted = path.join(".");
    setRawValues((prev) => ({ ...prev, [dotted]: raw }));
    const trimmed = raw.trim();
    if (trimmed === "") return;
    const n = Number(trimmed);
    if (!Number.isNaN(n)) field(path, n);
  }

  function handleReset() {
    setSettings(defaultGroupSettings);
    setRawValues({});
    setErrors({});
  }

  function handleSubmit() {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setErrors({ name: es.errors.validation });
      return;
    }
    const requiredErrors: Record<string, string> = {};
    for (const [dotted, raw] of Object.entries(rawValues)) {
      if (raw.trim() === "") requiredErrors[dotted] = es.groupSettings.required;
    }
    if (Object.keys(requiredErrors).length > 0) {
      setErrors(requiredErrors);
      toast.error(es.errors.validation);
      return;
    }
    const parsed = groupSettingsSchema.safeParse(settings);
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
      const result = await updateGroup({ groupId, name: trimmedName, settings: parsed.data });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.groups.updated);
      router.refresh();
    });
  }

  const advancedFields = collectNumericFields(settings.rating as unknown as Record<string, unknown>, ["rating"]);

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="group-settings-name">{es.groupSettings.nameLabel}</Label>
        <Input id="group-settings-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>{es.groupSettings.teamSizeLabel}</Label>
          <p className="text-xs text-muted-foreground">{es.groupSettings.teamSizeHelp}</p>
          <Select
            value={String(settings.default_team_size)}
            onValueChange={(v) => field(["default_team_size"], Number(v))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEAM_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}v{size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-hours">{es.groupSettings.reportHoursLabel}</Label>
          <p className="text-xs text-muted-foreground">{es.groupSettings.reportHoursHelp}</p>
          <Input
            id="report-hours"
            type="number"
            value={numberValue(["windows", "report_hours"])}
            onChange={(e) => numberField(["windows", "report_hours"], e.target.value)}
          />
          {errors["windows.report_hours"] && (
            <p className="text-sm text-destructive">{errors["windows.report_hours"]}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rating-hours">{es.groupSettings.ratingHoursLabel}</Label>
          <p className="text-xs text-muted-foreground">{es.groupSettings.ratingHoursHelp}</p>
          <Input
            id="rating-hours"
            type="number"
            value={numberValue(["windows", "rating_hours"])}
            onChange={(e) => numberField(["windows", "rating_hours"], e.target.value)}
          />
          {errors["windows.rating_hours"] && (
            <p className="text-sm text-destructive">{errors["windows.rating_hours"]}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="spectator-weight">{es.groupSettings.spectatorWeightLabel}</Label>
          <p className="text-xs text-muted-foreground">{es.groupSettings.spectatorWeightHelp}</p>
          <Input
            id="spectator-weight"
            type="number"
            step="0.05"
            min={0}
            max={1}
            value={numberValue(["rating", "spectator_weight"])}
            onChange={(e) => numberField(["rating", "spectator_weight"], e.target.value)}
          />
          {errors["rating.spectator_weight"] && (
            <p className="text-sm text-destructive">{errors["rating.spectator_weight"]}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="min-raters">{es.groupSettings.minRatersLabel}</Label>
          <p className="text-xs text-muted-foreground">{es.groupSettings.minRatersHelp}</p>
          <Input
            id="min-raters"
            type="number"
            min={1}
            value={numberValue(["rating", "min_raters"])}
            onChange={(e) => numberField(["rating", "min_raters"], e.target.value)}
          />
          {errors["rating.min_raters"] && <p className="text-sm text-destructive">{errors["rating.min_raters"]}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="revote-days">{es.groupSettings.revoteDaysLabel}</Label>
          <p className="text-xs text-muted-foreground">{es.groupSettings.revoteDaysHelp}</p>
          <Input
            id="revote-days"
            type="number"
            min={0}
            value={numberValue(["scouting", "revote_days"])}
            onChange={(e) => numberField(["scouting", "revote_days"], e.target.value)}
          />
          {errors["scouting.revote_days"] && (
            <p className="text-sm text-destructive">{errors["scouting.revote_days"]}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="silver-min">{es.groupSettings.silverMinLabel}</Label>
          <Input
            id="silver-min"
            type="number"
            min={1}
            max={99}
            value={numberValue(["tiers", "silver_min"])}
            onChange={(e) => numberField(["tiers", "silver_min"], e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gold-min">{es.groupSettings.goldMinLabel}</Label>
          <Input
            id="gold-min"
            type="number"
            min={1}
            max={99}
            value={numberValue(["tiers", "gold_min"])}
            onChange={(e) => numberField(["tiers", "gold_min"], e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="special-min">{es.groupSettings.specialMinLabel}</Label>
          <Input
            id="special-min"
            type="number"
            min={1}
            max={99}
            value={numberValue(["tiers", "special_min"])}
            onChange={(e) => numberField(["tiers", "special_min"], e.target.value)}
          />
        </div>
        {errors.tiers && <p className="text-sm text-destructive sm:col-span-2">{errors.tiers}</p>}
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex items-center justify-between gap-2">
          <span className="text-sm">{es.groupSettings.spectatorsCanRateLabel}</span>
          <Switch
            checked={settings.spectators_can_rate}
            onCheckedChange={(checked) => field(["spectators_can_rate"], checked)}
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-sm">{es.groupSettings.specialOnMvpLabel}</span>
          <Switch
            checked={settings.tiers.special_on_last_match_mvp}
            onCheckedChange={(checked) => field(["tiers", "special_on_last_match_mvp"], checked)}
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-sm">{es.groupSettings.requireSharedMatchLabel}</span>
          <Switch
            checked={settings.scouting.require_shared_match}
            onCheckedChange={(checked) => field(["scouting", "require_shared_match"], checked)}
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-sm">{es.groupSettings.badgesEnabledLabel}</span>
          <Switch checked={settings.badges_enabled} onCheckedChange={(checked) => field(["badges_enabled"], checked)} />
        </label>
      </div>

      <details open={advancedOpen} onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer text-sm font-medium">{es.groupSettings.advancedTitle}</summary>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">{es.groupSettings.advancedHelp}</p>
        {errors.rating && <p className="mb-2 text-sm text-destructive">{errors.rating}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {advancedFields.map((f) => (
            <div key={f.dotted} className="flex flex-col gap-1">
              <Label htmlFor={`adv-${f.dotted}`}>{es.groupSettings.advanced[f.dotted] ?? f.label}</Label>
              <Input
                id={`adv-${f.dotted}`}
                type="number"
                step="any"
                value={numberValue(f.path)}
                onChange={(e) => numberField(f.path, e.target.value)}
              />
              {errors[f.dotted] && <p className="text-sm text-destructive">{errors[f.dotted]}</p>}
            </div>
          ))}
        </div>
      </details>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={handleReset} disabled={pending}>
          {es.groupSettings.resetDefaults}
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={pending}>
          {es.common.save}
        </Button>
      </div>
    </div>
  );
}
