-- xPts model v1 data foundation (issue #30).
--
-- Two tables:
--   - player_gw_history : per-player, per-fixture history; the training/backtest
--                         set. Spans seasons, so NO FK to players (element ids
--                         reset each season). PK includes fixture_id for DGWs.
--   - projections       : the frozen serving contract written by Plan 3's cron.
--
-- RLS: authenticated SELECT; writes via service_role only (mirrors clubs/players).

----------------------------------------------------------------------
-- player_gw_history
----------------------------------------------------------------------
create table public.player_gw_history (
  season                       text     not null,
  player_id                    integer  not null,           -- FPL element id (season-scoped, NOT a FK)
  fixture_id                   integer  not null,
  gw                           smallint not null,
  position                     text     not null check (position in ('GKP','DEF','MID','FWD')),
  team_id                      smallint not null,
  opponent_team                smallint not null,
  was_home                     boolean  not null,
  minutes                      smallint not null,
  starts                       smallint not null,
  goals_scored                 smallint not null,
  assists                      smallint not null,
  clean_sheets                 smallint not null,
  goals_conceded               smallint not null,
  bonus                        smallint not null,
  bps                          integer  not null,
  total_points                 smallint not null,
  expected_goals               numeric(5,2) not null,
  expected_assists             numeric(5,2) not null,
  expected_goal_involvements   numeric(5,2) not null,
  expected_goals_conceded      numeric(5,2) not null,
  ict_index                    numeric(5,1) not null,
  influence                    numeric(6,1) not null,
  creativity                   numeric(6,1) not null,
  threat                       numeric(6,1) not null,
  defensive_contribution       smallint not null,
  value                        smallint not null,
  updated_at                   timestamptz not null default now(),
  primary key (season, player_id, fixture_id)
);

alter table public.player_gw_history enable row level security;

create policy "player_gw_history: authenticated select" on public.player_gw_history
  for select to authenticated using (true);

grant select on public.player_gw_history to authenticated;

create index player_gw_history_season_gw_idx     on public.player_gw_history (season, gw);
create index player_gw_history_season_player_idx on public.player_gw_history (season, player_id);

----------------------------------------------------------------------
-- projections (frozen serving contract; populated by Plan 3)
----------------------------------------------------------------------
create table public.projections (
  player_id      integer  not null references public.players(id) on delete cascade,
  gw             smallint not null,
  p25            numeric(4,1) not null,
  p50            numeric(4,1) not null,
  p75            numeric(4,1) not null,
  model_version  text     not null,
  computed_at    timestamptz not null default now(),
  primary key (player_id, gw)
);

alter table public.projections enable row level security;

create policy "projections: authenticated select" on public.projections
  for select to authenticated using (true);

grant select on public.projections to authenticated;

create index projections_gw_idx on public.projections (gw);
