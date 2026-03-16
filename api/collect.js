import { GAME_CONFIG, haversineMeters, isAdminPasswordValid, json, readJsonBody, sbFetch } from './_lib/game.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const { conceptId, playerLat, playerLon, adminMode, adminPassword } = await readJsonBody(req);
    if (!conceptId || !Number.isFinite(playerLat) || !Number.isFinite(playerLon)) {
      return json(res, 400, { error: 'conceptId, playerLat, playerLon required' });
    }

    const conceptRows = await sbFetch('concepts', { query: `select=*&id=eq.${conceptId}&limit=1` });
    const concept = conceptRows[0];
    if (!concept) return json(res, 404, { error: 'Concept not found' });
    if (!concept.discovered_name) return json(res, 400, { error: 'Concept must be discovered before collection' });

    const dist = haversineMeters(playerLat, playerLon, concept.lat, concept.lon);
    const inCollectionRange = dist <= GAME_CONFIG.collectionMeters;
    const adminAllowed = Boolean(adminMode) && isAdminPasswordValid(adminPassword);

    if (!(inCollectionRange || adminAllowed)) {
      return json(res, 403, {
        error: `Player must be within ${GAME_CONFIG.collectionMeters}m (or use admin mode)`,
        distance: dist,
      });
    }

    await sbFetch('concepts', { method: 'DELETE', query: `id=eq.${conceptId}` });
    return json(res, 200, {
      collected: true,
      conceptId,
      concept: {
        discoveredName: concept.discovered_name,
        rarityTier: concept.rarity_tier,
      },
    });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
}
