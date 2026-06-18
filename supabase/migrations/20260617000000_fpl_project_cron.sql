-- Cron schedule for the xPts serving function (issue #30).
--
-- 'fpl-project': daily 04:00 UTC — after the bootstrap (02:00) and fixtures
-- (03:00) ingest jobs, so it reads fresh players/fixtures. The function reads
-- the current-season player_gw_history window, applies the committed
-- xpts-v1.json artifact, and upserts the projections table. It degrades
-- gracefully (no upcoming fixture -> no row), so it is safe to run year-round.
--
-- Reuses the Vault secrets seeded for fpl-ingest (see docs/architecture.md).

select cron.schedule(
  'fpl-project',
  '0 4 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
               || '/functions/v1/fpl-project',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
