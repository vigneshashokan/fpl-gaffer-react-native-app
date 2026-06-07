# Architecture

## Stack
- **Mobile**: Expo / React Native (this repo).
- **Backend**: Supabase (hosted)
  - **Postgres** + Row Level Security for data and authz.
  - **Auth** for Google / Apple / email (added in issues #13–#15).
  - **Edge Functions** (Deno) for custom server logic.
  - **pg_cron** for scheduled jobs (FPL ingestion lands in issue #20).
- **Region**: `us-east-1` (N. Virginia).

## Why Supabase
Managed BaaS removes the auth / DB / cron toil for a solo project, RLS gives Postgres-native authz next to the data, and Deno-based Edge Functions cover the few custom endpoints we need. If a workload outgrows Edge Functions later, the worker can move to Fly.io / Railway / Render without touching auth or DB.

## Environments
- **Local**: `supabase start` (full Docker stack matching prod).
- **Production**: one hosted Supabase project.

### Future: adding staging
When the app is closer to launch:
1. Create a second Supabase project in the same region; capture its Project Ref + anon key.
2. `supabase db dump --linked > schema.sql` from prod, then apply to staging.
3. Add a `staging` set of GitHub Actions secrets (or rename the existing ones to `_PROD` and add `_STAGING`).
4. Change `deploy-supabase.yml` to target staging on merge to `main`; add a `workflow_dispatch` job that promotes staging → prod.
5. Add an EAS Build `staging` profile injecting the staging URL into `EXPO_PUBLIC_SUPABASE_*`.

## Repo layout

```
fpl-gaffer-react-native-app/
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/         # SQL migrations, applied via `supabase db push`
│  └─ functions/          # Deno Edge Functions, deployed via `supabase functions deploy`
├─ src/
│  └─ lib/supabase.ts     # @supabase/supabase-js client singleton
├─ app.config.ts          # Reads EXPO_PUBLIC_SUPABASE_* into Expo `extra`
├─ .env.example           # Template for the real `.env`
└─ .github/workflows/deploy-supabase.yml
```

## First-time setup
1. Install the Supabase CLI: `brew install supabase/tap/supabase`.
2. Create a Supabase account at https://supabase.com.
3. Create a new project; pick region `us-east-1`; set a strong DB password (save in a password manager).
4. Capture from the dashboard:
   - Project Reference ID (Settings → General).
   - Anon key + Project URL (Settings → API).
5. Create a personal access token (Account → Access Tokens) for CI.
6. Add these GitHub Actions secrets (Settings → Secrets and variables → Actions):
   - `SUPABASE_ACCESS_TOKEN`
   - `SUPABASE_PROJECT_REF`
   - `SUPABASE_DB_PASSWORD`
7. Locally: `cp .env.example .env`, then fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

## Running locally
- `cp .env.example .env` + fill in values from your Supabase project.
- (Optional, for a fully offline backend) `supabase start` to boot a local Postgres + Auth + Edge Functions stack in Docker.
- `npm start` to run the Expo dev server.

## Deploying
- Merge to `main` → GitHub Actions runs `supabase db push` + `supabase functions deploy ping`. Path-filtered to `supabase/**`, so UI-only PRs don't spend CI minutes.
- Mobile app deploys via EAS separately (Phase 5).
