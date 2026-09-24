// Pure builder: turns one of the 9 notification kinds (public.notifications.kind, see
// 20260923211711_notifications_tables.sql) + its parameters into the {title, body, url} payload
// lib/server/notifications.ts stores in notifications.payload and forwards to web push.
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

export function matchScheduledPayload(params: MatchScheduledParams): NotificationPayload {
  const { title, body } = es.notifications.match_scheduled({
    groupName: params.groupName,
    scheduledAt: formatDateTime(params.scheduledAt),
  });
  return { title, body, url: params.url };
}

export function reportPendingPayload(params: ReportPendingParams): NotificationPayload {
  const { title, body } = es.notifications.report_pending();
  return { title, body, url: params.url };
}

export function ratingPendingPayload(params: RatingPendingParams): NotificationPayload {
  const { title, body } = es.notifications.rating_pending();
  return { title, body, url: params.url };
}

export function matchFinalizedPayload(params: MatchFinalizedParams): NotificationPayload {
  const { title, body } = es.notifications.match_finalized({
    team1Goals: params.team1Goals,
    team2Goals: params.team2Goals,
  });
  return { title, body, url: params.url };
}

export function matchDisputedPayload(params: MatchDisputedParams): NotificationPayload {
  const { title, body } = es.notifications.match_disputed({ reasonCount: params.reasonCount });
  return { title, body, url: params.url };
}

export function tournamentGeneratedPayload(params: TournamentGeneratedParams): NotificationPayload {
  const { title, body } = es.notifications.tournament_generated({ tournamentName: params.tournamentName });
  return { title, body, url: params.url };
}

export function tournamentMatchReadyPayload(params: TournamentMatchReadyParams): NotificationPayload {
  const { title, body } = es.notifications.tournament_match_ready({ round: params.round });
  return { title, body, url: params.url };
}

/** The badge catalog's name (es.badges[code].name), never the raw code, ends up in the payload. */
export function badgeAwardedPayload(params: BadgeAwardedParams): NotificationPayload {
  const entry = (es.badges as unknown as Record<string, { name: string; description: string } | undefined>)[
    params.badgeCode
  ];
  const { title, body } = es.notifications.badge_awarded({ badgeName: entry?.name ?? params.badgeCode });
  return { title, body, url: params.url };
}

export function cardUpdatedPayload(params: CardUpdatedParams): NotificationPayload {
  const { title, body } = es.notifications.card_updated();
  return { title, body, url: params.url };
}
