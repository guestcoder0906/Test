# Concept Atlas (Pokémon Go-inspired web game)

A mobile-first and desktop-friendly shared map game where concepts spawn in the real world and sync globally in realtime via Supabase.

## Stack
- OpenStreetMap tiles + Leaflet map rendering.
- Supabase PostgreSQL + Realtime as global source-of-truth.
- Overpass API for exact coordinate context (`natural`, `amenity`, `historic`, names).
- Free Dictionary API for lexical validation.
- Embedding-like semantic matching (cosine similarity fallback in-browser; can be replaced with Voyage/HuggingFace API).
- Vercel static deployment + cron endpoint.

## Core world rules implemented
- **Large View Concept Range** (`1200m`) renders nearby concepts.
- **Collection Circle Range** (`50m`) gates discover/collect actions.
- Concepts start as `?` for all users.
- First discovery reveals name globally and icon becomes first two letters.
- Collected concepts are deleted globally in realtime.
- Spawn generation:
  - Low-density areas (`<5`) trigger spawn checks.
  - `1-3` new spawns each check.
  - Reuse chance `25-33%`; new concept chance `75-100%`.
  - Lifetime `4-16` hours.
- Rarity tiers derived from map-tag rarity weights + semantic score.
- Letter icon rendering includes a background-removal step with **5% white tolerance**.

## Deploy on Vercel
1. Import this repo in Vercel.
2. No build step required (static app).
3. Ensure Supabase schema is applied from `supabase/schema.sql`.
4. Open app and allow geolocation.

## Supabase config used
- Project: `AudioMap`
- URL: `https://oyxgydfmaocqxictnmou.supabase.co`
- Publishable key configured in `src/main.js`

> For production hardening, move spawn/discover/collect writes to authenticated Vercel API routes with service role key on the server only.
