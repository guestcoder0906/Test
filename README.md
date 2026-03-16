# Concept Go! (Pokémon Go-inspired web game)

Concept Go! is a fully deployable mobile + desktop web game where globally shared map Concepts are synchronized in real time using Supabase as the source of truth.

## What is fully implemented
- OpenStreetMap/Leaflet live map gameplay.
- Two spatial zones:
  - **Large View Concept Range** (default `1200m`) for visible concepts.
  - **Collection Circle Range** (`50m`) required for discover/collect.
- Global shared state with Supabase Realtime:
  - all undiscovered concepts render as `?`
  - first discover reveals name globally and icon switches to first two letters
  - collect removes concept globally instantly
- Context-grounded generation pipeline:
  - Overpass API fetches nearby `name`, `natural`, `amenity`, `historic`, `landuse`
  - Dictionary API validates candidate words
  - Embedding API (Voyage/HF) ranks semantic proximity (with deterministic fallback if embedding envs are not set)
- Spawn/reuse and lifecycle rules:
  - `75-100%` new concept generation behavior vs `25-33%` reuse
  - rarity (`Common` → `Mythical`) from tag frequency + semantic weight
  - intrinsic spawn modifier
  - global lifetime `4-16` hours
  - depleted zones (`<5 concepts`) respawn `1-3`
  - scheduled world maintenance every `15-20` minutes via Vercel cron + active cell tracking
- Dynamic two-letter icon rendering with transparent white-removal at **5% tolerance**.

## Architecture
### Frontend
- `index.html` + `src/styles.css` + `src/main.js`
- Uses geolocation, Leaflet rendering, and API routes for authoritative discover/collect/spawn.
- Subscribes to Supabase Realtime to update all users immediately.

### Backend (Vercel serverless functions)
- `api/concepts.js` - load nearby concepts, ensure density spawn checks.
- `api/discover.js` - range-check + authoritative discovery.
- `api/collect.js` - range-check + authoritative collection deletion.
- `api/spawn.js` - manual/forced spawn in current area.
- `api/maintain-world.js` - remove expired concepts and respawn for active cells based on next window.
- `api/_lib/game.js` - shared game logic: Overpass, Dictionary, Embeddings, rarity math, spawning, Supabase REST operations.

## Supabase setup
Run SQL in `supabase/schema.sql` to create:
- `public.concepts`
- `public.active_cells`
- indexes + RLS policies

## Environment setup
Copy `.env.example` to `.env.local` for local dev and set same vars in Vercel.

### Env var notes and how to get missing ones
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, project id/name: already provided.

#### How to get the Vite Supabase API key correctly (step-by-step)
1. Log in to Supabase and open your project (`AudioMap`).
2. In the left sidebar, open **Project Settings**.
3. Click **Data API** (or **API**, depending on UI version).
4. In the **Project URL** section, copy the HTTPS URL and set it as `VITE_SUPABASE_URL`.
5. In the **Project API keys** section, copy the **Publishable key** (starts with `sb_publishable_...`).
6. Set that value as `VITE_SUPABASE_PUBLISHABLE_KEY` (client) and `SUPABASE_PUBLISHABLE_KEY` (server runtime alias).
7. Do **not** use deprecated service-role credentials for this app.
8. In local dev, place values in `.env.local`.
9. In Vercel, open **Project → Settings → Environment Variables** and add the same keys to Production/Preview/Development.
10. Redeploy so all serverless functions pick up the updated env values.

- `VITE_EMBEDDING_API_URL`, `VITE_EMBEDDING_API_KEY`, `VITE_EMBEDDING_MODEL`:
  - Voyage: Dashboard/API docs for embeddings endpoint + key + model name.
  - Hugging Face: Inference endpoint URL + Access Token + selected embedding model.
- Overpass + Free Dictionary URLs are prefilled public endpoints.

## Deploy on Vercel
1. Import repository into Vercel.
2. Add all env vars from `.env.example`.
3. Deploy (no build command required).
4. Ensure cron in `vercel.json` remains enabled.
5. Open deployed app on mobile or desktop and allow geolocation.

## Supabase credentials configured in code
- Project: `AudioMap`
- ID: `oyxgydfmaocqxictnmou`
- URL: `https://oyxgydfmaocqxictnmou.supabase.co`
- Publishable key: configured in `src/main.js`
