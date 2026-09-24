// Pure builder: turns one of the 9 notification kinds (public.notifications.kind, see
// 20260923211711_notifications_tables.sql) + its parameters into the {title, body, url} payload
// lib/server/notifications.ts stores in notifications.payload and forwards to web push.
//
// Copy source: CLAUDE.md requires "UI strings only from messages/es.ts", but M5 is new and the
// Worker (who owns messages/es.ts) hasn't added a `notifications` section yet. Rather than invent
// throwaway English text or duplicate copy that would immediately drift, every builder below reads
// `es.notifications.<kind>` FIRST and only falls back to the minimal Spanish copy in
// FALLBACK_STRINGS when that key is absent -- so the moment the Worker adds
// `es.notifications.<kind>: (params) => ({ title, body })` (same shape as FALLBACK_STRINGS, same
// function-returning-object pattern already used elsewhere in es.ts, e.g. `matches.title`), this
// file picks it up with no code change. `es` is declared `as const` without an index signature, so
// the lookup goes through `unknown` -- this is the one place that's deliberately loose, guarded by
// a runtime shape check (isStringsTable) rather than a compile-time type.
import { es } from "@/messages/es";
import { formatDateTime } from "@/lib/format";

// Runtime array (not just a type) so callers that need every kind at runtime -- lib/actions/
// engagement.ts's updateNotificationPrefs zod validation, most notably -- have a single source of
// truth instead of re-listing the 9 values (must stay in sync with public.notifications' kind
// check constraint / private.notification_kinds() in 20260923211711_notifications_tables.sql /
// 20260923211719_notifications_rpcs.sql).
export const NOTIFICATION_KINDS = [
  "match_scheduled",
  "report_pending",
  "rating_pending",
  "match_finalized",
  "match_disputed",
  "tournament_generated",
  "tournament_match_ready",
  "badge_awarded",
  "card_updated",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface NotificationPayload {
  title: string;
  body: string;
  url: string;
}

interface Copy {
  title: string;
  body: string;
}

export interface MatchScheduledParams {
  groupName: string;
  scheduledAt: Date;
  url: string;
}
export interface ReportPendingParams {
  url: string;
}
export interface RatingPendingParams {
  url: string;
}
export interface MatchFinalizedParams {
  team1Goals: number;
  team2Goals: number;
  url: string;
}
export interface MatchDisputedParams {
  reasonCount: number;
  url: string;
}
export interface TournamentGeneratedParams {
  tournamentName: string;
  url: string;
}
export interface TournamentMatchReadyParams {
  round: number;
  url: string;
}
export interface BadgeAwardedParams {
  badgeCode: string;
  url: string;
}
export interface CardUpdatedParams {
  url: string;
}

type StringsTable = {
  match_scheduled: (p: { groupName: string; scheduledAt: string }) => Copy;
  report_pending: (p: Record<string, never>) => Copy;
  rating_pending: (p: Record<string, never>) => Copy;
  match_finalized: (p: { team1Goals: number; team2Goals: number }) => Copy;
  match_disputed: (p: { reasonCount: number }) => Copy;
  tournament_generated: (p: { tournamentName: string }) => Copy;
  tournament_match_ready: (p: { round: number }) => Copy;
  badge_awarded: (p: { badgeCode: string }) => Copy;
  card_updated: (p: Record<string, never>) => Copy;
};

function isStringsTable(value: unknown): value is Partial<StringsTable> {
  return typeof value === "object" && value !== null;
}

/** Provisional Spanish copy (voseo, matching the rest of the app) used only until
 * `es.notifications` exists. Deliberately minimal -- this is infrastructure, not final UX copy;
 * see the final report for the exact keys/shape the Worker should add to messages/es.ts. */
const FALLBACK_STRINGS: StringsTable = {
  match_scheduled: ({ groupName, scheduledAt }) => ({
    title: "Partido programado",
    body: `${groupName} tiene un partido nuevo para el ${scheduledAt}.`,
  }),
  report_pending: () => ({
    title: "Cargá el resultado",
    body: "Terminó el partido: cargá el resultado y las estadísticas.",
  }),
  rating_pending: () => ({
    title: "Votá el partido",
    body: "Calificá a tus compañeros y rivales de este partido.",
  }),
  match_finalized: ({ team1Goals, team2Goals }) => ({
    title: "Partido finalizado",
    body: `Resultado final: ${team1Goals} - ${team2Goals}.`,
  }),
  match_disputed: ({ reasonCount }) => ({
    title: "Partido en disputa",
    body: reasonCount === 1 ? "Hay un problema con los datos cargados." : `Hay ${reasonCount} problemas con los datos cargados.`,
  }),
  tournament_generated: ({ tournamentName }) => ({
    title: "Se armó el fixture",
    body: `Ya está listo el cuadro de ${tournamentName}.`,
  }),
  tournament_match_ready: ({ round }) => ({
    title: "Nuevo partido de torneo",
    body: `Tu partido de la ronda ${round} ya está listo para jugarse.`,
  }),
  badge_awarded: ({ badgeCode }) => ({
    title: "¡Nueva insignia!",
    body: `Ganaste la insignia ${badgeCode}.`,
  }),
  card_updated: () => ({
    title: "Tu carta cambió",
    body: "Tu carta se actualizó con los últimos votos.",
  }),
};

function stringsFor<K extends NotificationKind>(kind: K): StringsTable[K] {
  const table = (es as unknown as { notifications?: unknown }).notifications;
  if (isStringsTable(table)) {
    const fn = table[kind];
    if (typeof fn === "function") return fn as StringsTable[K];
  }
  return FALLBACK_STRINGS[kind];
}

export function matchScheduledPayload(params: MatchScheduledParams): NotificationPayload {
  const { title, body } = stringsFor("match_scheduled")({ groupName: params.groupName, scheduledAt: formatDateTime(params.scheduledAt) });
  return { title, body, url: params.url };
}

export function reportPendingPayload(params: ReportPendingParams): NotificationPayload {
  const { title, body } = stringsFor("report_pending")({});
  return { title, body, url: params.url };
}

export function ratingPendingPayload(params: RatingPendingParams): NotificationPayload {
  const { title, body } = stringsFor("rating_pending")({});
  return { title, body, url: params.url };
}

export function matchFinalizedPayload(params: MatchFinalizedParams): NotificationPayload {
  const { title, body } = stringsFor("match_finalized")({ team1Goals: params.team1Goals, team2Goals: params.team2Goals });
  return { title, body, url: params.url };
}

export function matchDisputedPayload(params: MatchDisputedParams): NotificationPayload {
  const { title, body } = stringsFor("match_disputed")({ reasonCount: params.reasonCount });
  return { title, body, url: params.url };
}

export function tournamentGeneratedPayload(params: TournamentGeneratedParams): NotificationPayload {
  const { title, body } = stringsFor("tournament_generated")({ tournamentName: params.tournamentName });
  return { title, body, url: params.url };
}

export function tournamentMatchReadyPayload(params: TournamentMatchReadyParams): NotificationPayload {
  const { title, body } = stringsFor("tournament_match_ready")({ round: params.round });
  return { title, body, url: params.url };
}

export function badgeAwardedPayload(params: BadgeAwardedParams): NotificationPayload {
  const { title, body } = stringsFor("badge_awarded")({ badgeCode: params.badgeCode });
  return { title, body, url: params.url };
}

export function cardUpdatedPayload(params: CardUpdatedParams): NotificationPayload {
  const { title, body } = stringsFor("card_updated")({});
  return { title, body, url: params.url };
}
