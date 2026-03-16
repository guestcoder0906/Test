create extension if not exists pgcrypto;

create table if not exists public.concepts (
  id uuid primary key default gen_random_uuid(),
  lat double precision not null,
  lon double precision not null,
  state text not null default 'undiscovered',
  discovered_name text,
  icon_text text,
  rarity_tier text not null default 'Common',
  semantic_weight double precision not null default 0.2,
  spawn_rate_modifier double precision not null default 1.0,
  map_context jsonb not null default '{}'::jsonb,
  osm_name text,
  discovered_by text,
  discovered_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists concepts_expiry_idx on public.concepts (expires_at);
create index if not exists concepts_geo_idx on public.concepts (lat, lon);

alter table public.concepts enable row level security;

create policy "anon read concepts"
on public.concepts
for select
using (true);

create policy "anon insert concepts"
on public.concepts
for insert
with check (true);

create policy "anon update undiscovered concepts"
on public.concepts
for update
using (true)
with check (true);

create policy "anon delete concepts"
on public.concepts
for delete
using (true);
