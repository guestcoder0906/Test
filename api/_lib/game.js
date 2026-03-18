const EARTH_RADIUS_M = 6371000;

export const GAME_CONFIG = {
  largeViewMeters: Number(process.env.LARGE_VIEW_METERS || 1000),
  collectionMeters: Number(process.env.COLLECTION_METERS || 50),
  respawnMinMinutes: Number(process.env.RESPAWN_MIN_INTERVAL_MINUTES || 15),
  respawnMaxMinutes: Number(process.env.RESPAWN_MAX_INTERVAL_MINUTES || 20),
  lifetimeMinHours: Number(process.env.CONCEPT_LIFETIME_MIN_HOURS || 4),
  lifetimeMaxHours: Number(process.env.CONCEPT_LIFETIME_MAX_HOURS || 16),
  minConceptsPerArea: Number(process.env.MIN_CONCEPTS_PER_AREA || 36),
  maxSpawnCyclesPerCheck: Number(process.env.MAX_SPAWN_CYCLES_PER_CHECK || 8),
};

export function json(res, code, body) {
  res.status(code).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

export function getEnv() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://oyxgydfmaocqxictnmou.supabase.co';
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_9l3BSqU-mIdYLEgZB2Pv2Q_UUZXU385';
  return {
    supabaseUrl,
    supabaseKey,
    overpassUrl: process.env.VITE_OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter',
    dictionaryBase: process.env.VITE_FREE_DICTIONARY_API_BASE || 'https://api.dictionaryapi.dev/api/v2/entries/en',
    embeddingProvider: process.env.VITE_EMBEDDING_PROVIDER || 'voyage',
    embeddingUrl: process.env.VITE_EMBEDDING_API_URL || '',
    embeddingKey: process.env.VITE_EMBEDDING_API_KEY || '',
    embeddingModel: process.env.VITE_EMBEDDING_MODEL || '',
  };
}


export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

export function isAdminPasswordValid(password) {
  const expectedPassword = String(process.env.PASSWORD || '');
  return Boolean(expectedPassword) && String(password || '') === expectedPassword;
}

export function postgrestUrl(base, path, query = '') {
  return `${base}/rest/v1/${path}${query ? `?${query}` : ''}`;
}

export async function sbFetch(path, { method = 'GET', query = '', body, headers = {} } = {}) {
  const { supabaseUrl, supabaseKey } = getEnv();
  const url = postgrestUrl(supabaseUrl, path, query);
  const response = await fetch(url, {
    method,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Supabase error ${response.status}: ${txt}`);
  }
  if (response.status === 204) return [];
  return response.json();
}

export function isSupabaseMissingTableError(error, tableName) {
  const message = String(error?.message || '');
  return message.includes('PGRST205') && message.includes(`public.${tableName}`);
}

export function haversineMeters(aLat, aLon, bLat, bLon) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function bbox(lat, lon, meters) {
  const latDelta = meters / 111320;
  const lonDelta = meters / (111320 * Math.cos((lat * Math.PI) / 180));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLon: lon - lonDelta,
    maxLon: lon + lonDelta,
  };
}

export async function getNearbyConcepts(lat, lon, meters = GAME_CONFIG.largeViewMeters) {
  const b = bbox(lat, lon, meters);
  const nowIso = new Date().toISOString();
  const query = [
    'select=*',
    `lat=gte.${b.minLat}`,
    `lat=lte.${b.maxLat}`,
    `lon=gte.${b.minLon}`,
    `lon=lte.${b.maxLon}`,
    `expires_at=gt.${encodeURIComponent(nowIso)}`,
    'order=created_at.desc',
  ].join('&');
  return sbFetch('concepts', { query });
}

const GENERIC_TOKEN_BLACKLIST = new Set([
  'and', 'area', 'avenue', 'building', 'highway', 'landuse', 'level', 'local', 'main', 'nearby', 'north', 'path',
  'place', 'public', 'residential', 'road', 'service', 'south', 'street', 'the', 'unknown', 'way', 'west', 'yes',
]);

const PRIORITY_CONTEXT_KEYS = [
  'amenity', 'leisure', 'tourism', 'historic', 'natural', 'sport', 'shop', 'public_transport', 'railway', 'landuse', 'building', 'highway',
];

function tokenizeValue(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[:/_-]+/g, ' ')
    .split(/[^a-z]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function isGenericToken(value) {
  const normalized = String(value || '').toLowerCase().trim();
  return !normalized || GENERIC_TOKEN_BLACKLIST.has(normalized);
}

function contextSpecificityScore(tags = {}) {
  let score = 0;
  for (const [key, value] of Object.entries(tags)) {
    const keyWeight = Math.max(PRIORITY_CONTEXT_KEYS.length - PRIORITY_CONTEXT_KEYS.indexOf(key), 1);
    if (PRIORITY_CONTEXT_KEYS.includes(key) && !isGenericToken(value)) score += 8 + keyWeight;
    else if (key === 'name' && !isGenericToken(value)) score += 6;
    else if (!isGenericToken(value)) score += 2;
  }
  return score;
}

export function pickPrimaryContext(contextItems, fallbackLat, fallbackLon) {
  if (!contextItems.length) {
    return { name: '', tags: { place: 'local' }, lat: fallbackLat, lon: fallbackLon };
  }

  return [...contextItems].sort((a, b) => {
    const aSpecificity = contextSpecificityScore(a.tags || {});
    const bSpecificity = contextSpecificityScore(b.tags || {});
    if (aSpecificity !== bSpecificity) return bSpecificity - aSpecificity;
    const aDistance = haversineMeters(fallbackLat, fallbackLon, a.lat ?? fallbackLat, a.lon ?? fallbackLon);
    const bDistance = haversineMeters(fallbackLat, fallbackLon, b.lat ?? fallbackLat, b.lon ?? fallbackLon);
    return aDistance - bDistance;
  })[0];
}

export function buildContextText(contextItems) {
  const parts = [];
  for (const item of contextItems) {
    if (item.name && !isGenericToken(item.name)) parts.push(item.name);
    for (const [key, value] of Object.entries(item.tags || {})) {
      if (!isGenericToken(value) || PRIORITY_CONTEXT_KEYS.includes(key)) {
        parts.push(`${key}:${value}`);
      }
    }
  }
  return parts.join(' ');
}

export function getReusableConceptNames(names = []) {
  return names
    .map((name) => String(name || '').toLowerCase().trim())
    .filter((name) => name && !isGenericToken(name) && !['residential', 'building', 'highway', 'road', 'street', 'service'].includes(name));
}

export function buildNameFrequencyMap(names = []) {
  const frequencies = new Map();
  for (const name of names) {
    const normalized = String(name || '').toLowerCase().trim();
    if (!normalized) continue;
    frequencies.set(normalized, (frequencies.get(normalized) || 0) + 1);
  }
  return frequencies;
}

export function pickLeastRepeatedName(candidates, frequencyMap, blockedNames = new Set()) {
  const normalizedBlocked = new Set([...blockedNames].map((name) => String(name || '').toLowerCase().trim()).filter(Boolean));
  const ranked = [...new Set(candidates.map((name) => String(name || '').toLowerCase().trim()).filter(Boolean))]
    .filter((name) => !normalizedBlocked.has(name))
    .sort((a, b) => {
      const frequencyDiff = (frequencyMap.get(a) || 0) - (frequencyMap.get(b) || 0);
      if (frequencyDiff !== 0) return frequencyDiff;
      return a.localeCompare(b);
    });

  return ranked[0] || null;
}

export async function getContextFromOverpass(lat, lon) {
  const { overpassUrl } = getEnv();
  const query = `[out:json][timeout:20];(nwr(around:80,${lat},${lon})[name];nwr(around:120,${lat},${lon})["amenity"];nwr(around:120,${lat},${lon})["leisure"];nwr(around:120,${lat},${lon})["tourism"];nwr(around:120,${lat},${lon})["historic"];nwr(around:120,${lat},${lon})["natural"];nwr(around:120,${lat},${lon})["sport"];nwr(around:120,${lat},${lon})["shop"];nwr(around:120,${lat},${lon})["public_transport"];nwr(around:120,${lat},${lon})["railway"];nwr(around:120,${lat},${lon})["landuse"];nwr(around:120,${lat},${lon})["building"];nwr(around:120,${lat},${lon})["highway"];);out tags center 100;`;
  const response = await fetch(overpassUrl, { method: 'POST', body: query });
  if (!response.ok) throw new Error(`Overpass failed ${response.status}`);
  const data = await response.json();
  return (data.elements || []).map((e) => ({
    name: e.tags?.name || '',
    tags: e.tags || {},
    lat: e.lat ?? e.center?.lat ?? lat,
    lon: e.lon ?? e.center?.lon ?? lon,
  }));
}

export async function dictionaryValidate(word) {
  const cleaned = (word || '').toLowerCase().replace(/[^a-z-]/g, '');
  if (cleaned.length < 4) return null;
  const { dictionaryBase } = getEnv();
  const response = await fetch(`${dictionaryBase}/${encodeURIComponent(cleaned)}`);
  if (!response.ok) return null;
  const data = await response.json();
  if (!Array.isArray(data) || !data[0]?.meanings?.length) return null;
  return cleaned;
}

export function buildTokenPool(contextItems) {
  const prioritized = [];
  const fallback = [];
  const seen = new Set();

  const addToken = (token, target) => {
    const normalized = String(token || '').toLowerCase().trim();
    if (!normalized || seen.has(normalized) || isGenericToken(normalized)) return;
    seen.add(normalized);
    target.push(normalized);
  };

  for (const item of contextItems) {
    if (item.name) {
      for (const word of tokenizeValue(item.name)) addToken(word, prioritized);
    }
    for (const [key, value] of Object.entries(item.tags || {})) {
      const target = PRIORITY_CONTEXT_KEYS.includes(key) ? prioritized : fallback;
      for (const word of tokenizeValue(value)) addToken(word, target);
      if (PRIORITY_CONTEXT_KEYS.includes(key) && !isGenericToken(value)) addToken(value, prioritized);
    }
  }

  return [...prioritized, ...fallback];
}

export async function embedTexts(texts) {
  const { embeddingUrl, embeddingKey, embeddingModel, embeddingProvider } = getEnv();
  if (!embeddingUrl || !embeddingKey || !embeddingModel) return null;

  if (embeddingProvider.toLowerCase() === 'voyage') {
    const response = await fetch(embeddingUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${embeddingKey}` },
      body: JSON.stringify({ model: embeddingModel, input: texts }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return (data.data || []).map((x) => x.embedding);
  }

  if (embeddingProvider.toLowerCase() === 'huggingface') {
    const response = await fetch(embeddingUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${embeddingKey}` },
      body: JSON.stringify({ inputs: texts, options: { wait_for_model: true } }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (Array.isArray(data) && Array.isArray(data[0]) && typeof data[0][0] === 'number') {
      return data;
    }
    return null;
  }

  return null;
}

function textVecApprox(text) {
  const v = new Array(24).fill(0);
  const t = text.toLowerCase();
  for (let i = 0; i < t.length; i++) v[i % v.length] += t.charCodeAt(i) / 255;
  return v;
}

function cosine(a, b) {
  let dot = 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    ma += a[i] ** 2;
    mb += b[i] ** 2;
  }
  return dot / (Math.sqrt(ma) * Math.sqrt(mb) || 1);
}

export async function bestSemanticWord(contextText, words) {
  if (!words.length) return { word: 'horizon', score: 0.5 };
  const emb = await embedTexts([contextText, ...words]);
  if (emb && emb.length === words.length + 1) {
    const c = emb[0];
    let best = words[0];
    let bestScore = -1;
    for (let i = 0; i < words.length; i++) {
      const score = cosine(c, emb[i + 1]);
      if (score > bestScore) {
        bestScore = score;
        best = words[i];
      }
    }
    return { word: best, score: bestScore };
  }

  const c = textVecApprox(contextText);
  let best = words[0];
  let bestScore = -1;
  for (const w of words) {
    const score = cosine(c, textVecApprox(w));
    if (score > bestScore) {
      bestScore = score;
      best = w;
    }
  }
  return { word: best, score: bestScore };
}

export function rarityFromTags(tags = {}, semanticScore = 0.4) {
  const rarityWeights = {
    'highway:residential': 0.1,
    'highway:footway': 0.16,
    'building:yes': 0.12,
    'landuse:residential': 0.14,
    'landuse:forest': 0.38,
    'amenity:school': 0.28,
    'amenity:library': 0.5,
    'amenity:marketplace': 0.56,
    'amenity:place_of_worship': 0.66,
    'amenity:theatre': 0.62,
    'amenity:clock': 0.44,
    'leisure:park': 0.3,
    'leisure:playground': 0.38,
    'tourism:viewpoint': 0.62,
    'tourism:museum': 0.74,
    'historic:monument': 0.68,
    'historic:ruins': 0.8,
    'natural:wood': 0.34,
    'natural:water': 0.44,
    'natural:peak': 0.78,
    'natural:glacier': 0.9,
    'natural:volcano': 0.98,
    'shop:books': 0.4,
    'sport:skateboard': 0.48,
    'sport:climbing': 0.58,
  };
  const entries = Object.entries(tags);
  let tagScore = 0.12;
  let specificityBonus = 0;
  for (const [k, v] of entries) {
    const normalized = `${k}:${v}`;
    tagScore += rarityWeights[normalized] ?? (PRIORITY_CONTEXT_KEYS.includes(k) && !isGenericToken(v) ? 0.24 : 0.1);
    if (!isGenericToken(v)) specificityBonus += PRIORITY_CONTEXT_KEYS.includes(k) ? 0.035 : 0.01;
  }
  tagScore = Math.min((tagScore / Math.max(entries.length + 0.8, 1)) + specificityBonus, 1);
  const score = Math.min((tagScore * 0.85) + (Math.max(0, semanticScore) * 0.15), 1);

  if (score > 0.92) return { tier: 'Mythical', score };
  if (score > 0.8) return { tier: 'Legendary', score };
  if (score > 0.66) return { tier: 'Epic', score };
  if (score > 0.5) return { tier: 'Rare', score };
  if (score > 0.3) return { tier: 'Uncommon', score };
  return { tier: 'Common', score };
}

export function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

export function randomInt(min, max) {
  return Math.floor(randomBetween(min, max + 1));
}

export function expiresAtIso() {
  const h = randomInt(GAME_CONFIG.lifetimeMinHours, GAME_CONFIG.lifetimeMaxHours);
  return new Date(Date.now() + h * 3600 * 1000).toISOString();
}

export async function upsertActiveCell(lat, lon) {
  const key = `${lat.toFixed(2)}:${lon.toFixed(2)}`;
  const now = new Date().toISOString();
  try {
    await sbFetch('active_cells', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: { cell_key: key, lat, lon, last_seen_at: now, next_respawn_at: now },
    });
  } catch (error) {
    if (isSupabaseMissingTableError(error, 'active_cells')) return;
    throw error;
  }
}

export async function spawnInArea(lat, lon, opts = {}) {
  const targetCount = Number(opts.targetCount || GAME_CONFIG.minConceptsPerArea);
  let current = await getNearbyConcepts(lat, lon, GAME_CONFIG.largeViewMeters);
  if (current.length >= targetCount && !opts.force) return { spawned: 0, existing: current.length, targetCount };

  const discovered = await sbFetch('concepts', {
    query: 'select=discovered_name&discovered_name=not.is.null&limit=300',
  });
  const knownNames = getReusableConceptNames(discovered.map((d) => d.discovered_name).filter(Boolean));
  const nameFrequencyMap = buildNameFrequencyMap([
    ...knownNames,
    ...current.map((concept) => concept.discovered_name || concept.seed_word).filter(Boolean),
  ]);

  let spawned = 0;
  let cycles = 0;
  const reservedNames = new Set(current.map((concept) => concept.discovered_name || concept.seed_word).filter(Boolean).map((name) => String(name).toLowerCase()));

  while (current.length + spawned < targetCount && cycles < GAME_CONFIG.maxSpawnCyclesPerCheck) {
    cycles += 1;
    const spawnCount = randomInt(2, 4);

    for (let i = 0; i < spawnCount && current.length + spawned < targetCount; i++) {
      const angle = randomBetween(0, Math.PI * 2);
      const distance = randomBetween(50, GAME_CONFIG.largeViewMeters);
      const nLat = lat + (Math.cos(angle) * distance) / 111320;
      const nLon = lon + (Math.sin(angle) * distance) / (111320 * Math.cos((lat * Math.PI) / 180));

      let context = [];
      try {
        context = await getContextFromOverpass(nLat, nLon);
      } catch {
        context = [{ name: '', tags: { leisure: 'park', place: 'local' }, lat: nLat, lon: nLon }];
      }

      const tokens = buildTokenPool(context);
      const validated = [];
      for (const t of tokens.slice(0, 45)) {
        const ok = await dictionaryValidate(t);
        if (ok) validated.push(ok);
        if (validated.length > 24) break;
      }
      const fallbackWords = ['play', 'garden', 'harbor', 'grove', 'summit', 'orbit', 'forge', 'meadow', 'gallery', 'canopy'];
      const brandNewPool = validated.length ? [...new Set(validated)] : fallbackWords;

      const reuseChance = randomBetween(0.04, 0.1);
      let selectedWord;
      let semantic = 0.2;
      const contextText = buildContextText(context);
      if (knownNames.length && Math.random() < reuseChance) {
        selectedWord = pickLeastRepeatedName(knownNames, nameFrequencyMap, reservedNames);
      }

      if (!selectedWord) {
        const uniqueCandidate = pickLeastRepeatedName(brandNewPool, nameFrequencyMap, reservedNames);
        const picked = await bestSemanticWord(contextText, uniqueCandidate ? [uniqueCandidate, ...brandNewPool] : brandNewPool);
        selectedWord = picked.word;
        semantic = picked.score;
      }

      selectedWord = (selectedWord || brandNewPool[0] || 'meadow').toLowerCase();
      reservedNames.add(selectedWord);
      nameFrequencyMap.set(selectedWord, (nameFrequencyMap.get(selectedWord) || 0) + 1);

      const mainCtx = pickPrimaryContext(context, nLat, nLon);
      const rarity = rarityFromTags(mainCtx.tags, semantic);
      const spawnRateModifier = Number((0.5 + rarity.score * 1.5).toFixed(3));

      await sbFetch('concepts', {
        method: 'POST',
        body: {
          lat: nLat,
          lon: nLon,
          state: 'undiscovered',
          rarity_tier: rarity.tier,
          semantic_weight: Number(Math.max(0, semantic).toFixed(4)),
          spawn_rate_modifier: spawnRateModifier,
          map_context: mainCtx.tags,
          osm_name: mainCtx.name || null,
          seed_word: selectedWord,
          discovered_name: null,
          icon_text: null,
          expires_at: expiresAtIso(),
        },
      });
      spawned++;
    }
  }

  return { spawned, existing: current.length, targetCount, cycles };
}
