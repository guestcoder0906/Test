import { GAME_CONFIG, getNearbyConcepts, json, spawnInArea, upsertActiveCell } from './_lib/game.js';

export default async function handler(req, res) {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return json(res, 400, { error: 'lat and lon query params are required' });
    }

    await upsertActiveCell(lat, lon);
    const concepts = await getNearbyConcepts(lat, lon, GAME_CONFIG.largeViewMeters);

    if (concepts.length < 5) {
      await spawnInArea(lat, lon);
    }

    const refreshed = await getNearbyConcepts(lat, lon, GAME_CONFIG.largeViewMeters);
    return json(res, 200, { concepts: refreshed, config: GAME_CONFIG });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
}
