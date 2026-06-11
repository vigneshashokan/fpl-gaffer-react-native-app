#!/usr/bin/env bash
#
# End-to-end smoke test for the fpl-ingest Edge Function.
#
# Requirements:
#   - `supabase start` is running (Postgres + Edge runtime on localhost).
#   - `supabase db reset` has been run so migrations are applied.
#   - The fpl-ingest function is being served (`supabase functions serve fpl-ingest`).
#
# What it does:
#   1. Calls ?source=bootstrap&force=1 (bypass calendar gate)
#   2. Calls ?source=fixtures
#   3. Calls ?source=fixtures AGAIN (should skip via content hash)
#   4. Reads ingestion_runs for the most recent rows and prints them.
#
# This script hits the LIVE FPL API. It's intentional: integration test.

set -euo pipefail

BASE="${SUPABASE_URL:-http://localhost:54321}"
ANON="${SUPABASE_ANON_KEY:-}"

if [ -z "$ANON" ]; then
  echo "SUPABASE_ANON_KEY is not set. Get it from: supabase status"
  exit 1
fi

invoke() {
  local qs="$1"
  echo "→ POST $BASE/functions/v1/fpl-ingest?$qs"
  curl -sS -X POST \
    "$BASE/functions/v1/fpl-ingest?$qs" \
    -H "Authorization: Bearer $ANON" \
    -H "Content-Type: application/json" \
    -d '{}' \
  | tee /dev/stderr
  echo ''
}

invoke 'source=bootstrap&force=1'
invoke 'source=fixtures'
invoke 'source=fixtures'  # Expect: status=skipped, reason=no content change

echo ''
echo '--- Most recent ingestion_runs ---'
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -c "
  select source, status, skip_reason, rows_upserted, content_hash is not null as has_hash
    from public.ingestion_runs
    order by started_at desc
    limit 5;
"
