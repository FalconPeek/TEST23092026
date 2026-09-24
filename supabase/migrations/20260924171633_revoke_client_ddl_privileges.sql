-- The project's default privileges give anon/authenticated TRUNCATE, REFERENCES, TRIGGER and
-- MAINTAIN on every new public table. The Data API can't issue those, but TRUNCATE ignores RLS
-- and none of them is needed by clients, so strip them (defense in depth; also flagged by the
-- Supabase security advisor). Table DML stays governed by the explicit per-table GRANTs.
revoke truncate, references, trigger, maintain on all tables in schema public from anon, authenticated;
revoke usage, select, update on all sequences in schema public from anon, authenticated;

-- Future tables created by migrations (owner: postgres) must not regain them.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select, update on sequences from anon, authenticated;
