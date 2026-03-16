# Concept Go! (Pokémon Go-inspired web game)

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

## Environment setup
1. Copy `.env.example` to `.env.local` (or configure the same keys in Vercel Project Settings → Environment Variables).
2. Values already filled in for your provided Supabase project are included.
3. Fill in optional/missing values only if you want hosted embedding inference and server-side hardened writes.

### Environment variable notes (what is filled vs. what you must get)
- `VITE_SUPABASE_URL` ✅ already filled.
- `VITE_SUPABASE_PUBLISHABLE_KEY` ✅ already filled.
- `VITE_SUPABASE_PROJECT_ID` ✅ already filled.
- `VITE_SUPABASE_PROJECT_NAME` ✅ already filled.
- `VITE_OVERPASS_API_URL` ✅ already filled (public endpoint).
- `VITE_FREE_DICTIONARY_API_BASE` ✅ already filled (public endpoint).
- `VITE_EMBEDDING_PROVIDER` ⚙️ optional; set to your provider (`voyage`, `huggingface`, etc.).
- `VITE_EMBEDDING_API_URL` ⚙️ optional; obtain from your embedding provider docs.
- `VITE_EMBEDDING_API_KEY` ⚙️ optional; create API key in provider dashboard:
  - Voyage AI: Dashboard → API Keys
  - Hugging Face: Settings → Access Tokens (for Inference API)
- `VITE_EMBEDDING_MODEL` ⚙️ optional; pick a semantic embedding model from provider docs.
- `SUPABASE_SERVICE_ROLE_KEY` 🔒 required only for secure server-side routes:
  - Supabase Dashboard → Project Settings → API → `service_role` key
  - Keep server-side only (never exposed to browsers).
- Game tuning vars (`LARGE_VIEW_METERS`, etc.) ✅ prefilled defaults; adjust to taste.

## Deploy on Vercel
1. Import this repo in Vercel.
2. No build step required (static app).
3. Add env vars from `.env.example` to Vercel (Production/Preview/Development as needed).
4. Ensure Supabase schema is applied from `supabase/schema.sql`.
5. Open app and allow geolocation.

## Supabase config used
- Project: `AudioMap`
- URL: `https://oyxgydfmaocqxictnmou.supabase.co`
- Publishable key configured in `src/main.js`

> For production hardening, move spawn/discover/collect writes to authenticated Vercel API routes with service role key on the server only.
