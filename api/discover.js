import {
  GAME_CONFIG,
  getContextFromOverpass,
  buildTokenPool,
  dictionaryValidate,
  bestSemanticWord,
  buildContextText,
  buildNameFrequencyMap,
  getReusableConceptNames,
  haversineMeters,
  isAdminPasswordValid,
  json,
  pickLeastRepeatedName,
  pickPrimaryContext,
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
      context = [{ name: '', tags: concept.map_context || { leisure: 'park', place: 'local' }, lat: concept.lat, lon: concept.lon }];
    }

    const discovered = await sbFetch('concepts', {
      query: 'select=discovered_name&discovered_name=not.is.null&limit=500',
    });
    const existingNames = getReusableConceptNames(discovered.map((d) => d.discovered_name).filter(Boolean));
    const nameFrequencyMap = buildNameFrequencyMap(existingNames);

    const mainCtx = pickPrimaryContext(context, concept.lat, concept.lon);
    const tokens = buildTokenPool([mainCtx, ...context]);
    const validated = [];
    for (const token of tokens.slice(0, 40)) {
      const ok = await dictionaryValidate(token);
      if (ok) validated.push(ok);
      if (validated.length > 22) break;
    }
    const pool = validated.length ? [...new Set(validated)] : ['play', 'garden', 'gallery', 'grove', 'summit', 'orbit', 'harbor', 'meadow'];

    const reuseChance = 0.04 + Math.random() * 0.06;
    const contextText = buildContextText([mainCtx, ...context]);
    let finalWord;
    if (existingNames.length && Math.random() < reuseChance) {
      finalWord = pickLeastRepeatedName(existingNames, nameFrequencyMap) || existingNames[0];
    } else {
      const uniqueCandidate = pickLeastRepeatedName(pool, nameFrequencyMap);
      finalWord = (await bestSemanticWord(contextText, uniqueCandidate ? [uniqueCandidate, ...pool] : pool)).word;
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
