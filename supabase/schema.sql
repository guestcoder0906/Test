create extension if not exists pgcrypto;

create table if not exists public.concepts (
  id uuid primary key default gen_random_uuid(),
  lat double precision not null,
  lon double precision not null,
  state text not null default 'undiscovered',
  seed_word text,
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

create table if not exists public.active_cells (
  cell_key text primary key,
  lat double precision not null,
  lon double precision not null,
  last_seen_at timestamptz not null default now(),
  next_respawn_at timestamptz not null default now()
);

create index if not exists concepts_expiry_idx on public.concepts (expires_at);
create index if not exists concepts_geo_idx on public.concepts (lat, lon);
create index if not exists active_cells_seen_idx on public.active_cells (last_seen_at);
create index if not exists active_cells_respawn_idx on public.active_cells (next_respawn_at);

alter table public.concepts enable row level security;
alter table public.active_cells enable row level security;

create policy "anon read concepts"
on public.concepts for select using (true);

create policy "anon insert concepts"
on public.concepts for insert with check (true);

create policy "anon update concepts"
on public.concepts for update using (true) with check (true);

create policy "anon delete concepts"
on public.concepts for delete using (true);

create policy "anon read active_cells"
on public.active_cells for select using (true);

create policy "anon insert active_cells"
on public.active_cells for insert with check (true);

create policy "anon update active_cells"
on public.active_cells for update using (true) with check (true);
