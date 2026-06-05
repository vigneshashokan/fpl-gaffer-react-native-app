-- Smoke-test table proving the DB is reachable from the app via the anon key.
-- Removed once real tables land in issue #11.
create table if not exists public.health (
  id   int  primary key,
  note text not null
);

insert into public.health (id, note)
values (1, 'ok')
on conflict (id) do nothing;

alter table public.health enable row level security;

create policy "health read for anon"
  on public.health
  for select
  using (true);
