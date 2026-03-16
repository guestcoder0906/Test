import { GAME_CONFIG, getNearbyConcepts, json, spawnInArea, upsertActiveCell } from './_lib/game.js';

export default async function handler(req, res) {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const meters = Number(req.query.meters);
    const shouldSpawn = req.query.spawn !== 'false';
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return json(res, 400, { error: 'lat and lon query params are required' });
    }

    const viewMeters = Number.isFinite(meters) && meters > 0
      ? Math.min(meters, GAME_CONFIG.largeViewMeters)
      : GAME_CONFIG.largeViewMeters;

    const minConceptsTarget = Number.isFinite(meters) && meters > 0
      ? Math.max(6, Math.round((GAME_CONFIG.minConceptsPerArea * viewMeters) / GAME_CONFIG.largeViewMeters))
      : GAME_CONFIG.minConceptsPerArea;

    await upsertActiveCell(lat, lon);
    const concepts = await getNearbyConcepts(lat, lon, viewMeters);

    if (shouldSpawn && concepts.length < minConceptsTarget) {
      await spawnInArea(lat, lon, { targetCount: minConceptsTarget });
    }

    const refreshed = shouldSpawn ? await getNearbyConcepts(lat, lon, viewMeters) : concepts;
    return json(res, 200, { concepts: refreshed, config: GAME_CONFIG });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
}
