import { json, readJsonBody, spawnInArea, upsertActiveCell } from './_lib/game.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const { lat, lon, force } = await readJsonBody(req);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return json(res, 400, { error: 'lat and lon required' });
    }
    await upsertActiveCell(lat, lon);
    const result = await spawnInArea(lat, lon, { force: !!force });
    return json(res, 200, result);
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
}
