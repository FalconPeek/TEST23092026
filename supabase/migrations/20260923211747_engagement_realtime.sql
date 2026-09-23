-- Live toasts for the badge/notification feed subscribe to postgres_changes on these tables.
-- Realtime evaluates the existing select policies per subscriber, so a client only ever receives
-- its own notifications (notifications_select_own) or badges of players in groups it belongs to
-- (player_badges_select_group_member); badges (the static catalog) is included too since a client
-- resolving a badge_awarded notification's icon/name_key needs it, though it rarely changes.
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.player_badges;
alter publication supabase_realtime add table public.badges;
