# Deploying Picado (M6)

Nothing here has been run yet: production resources are created only with the owner's approval.

## 1. Supabase (cloud project)
1. Create the project (region close to Buenos Aires: `sa-east-1`). The free plan allows 2 active projects.
2. Link and push the schema: `npx supabase link --project-ref <ref>` then `npx supabase db push`.
   - All migrations are idempotent. They create the `club-crests` Storage bucket (public, 512 KB, png/jpeg/webp) and schedule `picado-close-windows` with pg_cron (every 10 min).
   - Enable the **pg_cron** extension first if `db push` complains (Dashboard → Database → Extensions).
3. Run `npx supabase test db --linked`. It needs pgTAP enabled; run it once against the project, then disable it if you want.
4. **Auth** (Dashboard → Authentication):
   - Site URL = `https://<domain>`. Redirect URLs = `https://<domain>/auth/callback`, plus the Vercel preview pattern if wanted.
   - Providers: **Google** and **Discord** (client id/secret from each console; the redirect URI shown by Supabase goes in their consoles).
   - Email: magic link on. Consider turning **email + password signups off**: the password form exists for dev/e2e only.
5. Run the **security advisors** (Dashboard → Advisors). Local audit status: RLS on every table; no client TRUNCATE/REFERENCES/TRIGGER/MAINTAIN (migration `revoke_client_ddl_privileges`); anon can execute no public/private function.

## 2. Vercel
1. Import the repo. Framework: Next.js; build `npm run build`.
2. Environment variables (Production):
   | name | value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
   | `SUPABASE_SECRET_KEY` | `sb_secret_…` (server only) |
   | `NEXT_PUBLIC_SITE_URL` | `https://<domain>/` |
   | `CRON_SECRET` | long random string |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `npx web-push generate-vapid-keys`; subject `mailto:<you>` |
3. Never set `E2E_*` or `DEMO_PASSWORD` in production (`scripts/seed-demo.mts` refuses non-local URLs anyway).

## 3. Match finalization schedule (decided: option A)
pg_cron marks expired matches as  (, every 10 min). Then  (minutes 5, 15, 25…) calls  through **pg_net** with the  bearer. That runs the TypeScript finalizer: reconcile → stats → OpenSkill → cards → badges → notifications → bracket advance.

The job reads two Supabase Vault secrets and does nothing until they exist. Run once in the SQL editor after the first deploy:
\Check it:  should show 200s. Admins can still close a match instantly with "Cerrar partido ahora".

## 4. After the first deploy
- Sign in with Google/Discord, create a group, and install the PWA on a phone (Android: "Instalar app"; iPhone: Share → "Agregar a inicio"). Then enable notifications in `/yo/ajustes`.
- Run the e2e suite against production data **only** on a throwaway project: `E2E_BASE_URL=https://<domain> npx playwright test`. The teardown never deletes remote data.
