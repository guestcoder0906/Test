import {
  GAME_CONFIG,
  getContextFromOverpass,
  buildTokenPool,
  dictionaryValidate,
  bestSemanticWord,
  haversineMeters,
  isAdminPasswordValid,
  json,
  readJsonBody,
  sbFetch,
} from './_lib/game.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const { conceptId, playerId, playerLat, playerLon, adminMode, adminPassword } = await readJsonBody(req);
    if (!conceptId || !playerId || !Number.isFinite(playerLat) || !Number.isFinite(playerLon)) {
      return json(res, 400, { error: 'conceptId, playerId, playerLat, playerLon required' });
    }

    const conceptRows = await sbFetch('concepts', { query: `select=*&id=eq.${conceptId}&limit=1` });
    const concept = conceptRows[0];
    if (!concept) return json(res, 404, { error: 'Concept not found' });
    if (concept.discovered_name) return json(res, 200, { concept, alreadyDiscovered: true });

    const dist = haversineMeters(playerLat, playerLon, concept.lat, concept.lon);
    const adminAllowed = Boolean(adminMode) && isAdminPasswordValid(adminPassword);
    const collectionMeters = adminAllowed ? Math.max(GAME_CONFIG.collectionMeters, 1000) : GAME_CONFIG.collectionMeters;
    if (dist > collectionMeters) {
      return json(res, 403, {
        error: `Player outside ${collectionMeters}m range${adminAllowed ? ' while admin mode is active' : ''}`,
        distance: dist,
      });
    }

    let context = [];
    try {
      context = await getContextFromOverpass(concept.lat, concept.lon);
    } catch {
      context = [{ name: '', tags: concept.map_context || { highway: 'residential' } }];
    }

    const discovered = await sbFetch('concepts', {
      query: 'select=discovered_name&discovered_name=not.is.null&limit=500',
    });
    const existingNames = discovered.map((d) => d.discovered_name).filter(Boolean).map((x) => x.toLowerCase());

    const tokens = buildTokenPool(context);
    const validated = [];
    for (const token of tokens.slice(0, 40)) {
      const ok = await dictionaryValidate(token);
      if (ok) validated.push(ok);
      if (validated.length > 22) break;
    }
    const pool = validated.length ? [...new Set(validated)] : ['sanctuary', 'growth', 'oasis', 'horizon', 'archive', 'ember'];

    const reuseChance = 0.25 + Math.random() * 0.08;
    let finalWord;
    if (existingNames.length && Math.random() < reuseChance) {
      finalWord = existingNames[Math.floor(Math.random() * existingNames.length)];
    } else {
      const contextText = context
        .flatMap((i) => [i.name, ...Object.entries(i.tags || {}).map(([k, v]) => `${k}:${v}`)])
        .join(' ');
      finalWord = (await bestSemanticWord(contextText, pool)).word;
    }

    const updated = await sbFetch('concepts', {
      method: 'PATCH',
      query: `id=eq.${conceptId}&discovered_name=is.null`,
      body: {
        state: 'discovered',
        discovered_name: finalWord,
        icon_text: finalWord.slice(0, 2).toUpperCase(),
        discovered_by: playerId,
        discovered_at: new Date().toISOString(),
      },
    });

    return json(res, 200, { concept: updated[0] || concept, discovered: true });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
}
