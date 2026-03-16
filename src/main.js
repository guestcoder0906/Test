import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const SUPABASE_URL = 'https://oyxgydfmaocqxictnmou.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_9l3BSqU-mIdYLEgZB2Pv2Q_UUZXU385';

const LARGE_VIEW_METERS = 1200;
const COLLECTION_METERS = 50;

const map = L.map('map', { zoomControl: false }).setView([0, 0], 2);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const statusEl = document.getElementById('status');
const detailsEl = document.getElementById('details');
const discoverBtn = document.getElementById('discoverBtn');
const collectBtn = document.getElementById('collectBtn');
const spawnBtn = document.getElementById('spawnBtn');

let playerLatLng = null;
let selectedConcept = null;
let playerMarker;
let viewCircle;
let collectionCircle;
const markers = new Map();

const playerId = localStorage.getItem('concept-go-player-id') ?? crypto.randomUUID();
localStorage.setItem('concept-go-player-id', playerId);

function metersToLat(m) {
  return m / 111320;
}

function metersToLon(m, lat) {
  return m / (111320 * Math.cos((lat * Math.PI) / 180));
}

function distanceMeters(a, b) {
  return map.distance([a.lat, a.lng], [b.lat, b.lng]);
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function approxCosine(a, b) {
  const vec = (txt) => {
    const values = new Array(12).fill(0);
    for (let i = 0; i < txt.length; i++) {
      values[i % values.length] += txt.charCodeAt(i) / 255;
    }
    return values;
  };
  const va = vec(a.toLowerCase());
  const vb = vec(b.toLowerCase());
  let dot = 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < va.length; i++) {
    dot += va[i] * vb[i];
    ma += va[i] ** 2;
    mb += vb[i] ** 2;
  }
  return dot / (Math.sqrt(ma) * Math.sqrt(mb) || 1);
}

async function fetchDictionaryWord(word) {
  const cleaned = word.toLowerCase().replace(/[^a-z-]/g, '');
  if (!cleaned || cleaned.length < 4) return null;
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleaned)}`);
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data) || !data[0]?.meanings?.length) return null;
    return cleaned;
  } catch {
    return null;
  }
}

function computeRarity(tags) {
  const keys = Object.keys(tags ?? {});
  if (!keys.length) return { tier: 'Common', score: 0.15 };
  const rarityWeights = {
    'highway:residential': 0.1,
    'amenity:marketplace': 0.55,
    'natural:wood': 0.35,
    'historic:ruins': 0.78,
    'natural:volcano': 1,
    'amenity:place_of_worship': 0.72,
    'landuse:forest': 0.45,
    'historic:monument': 0.65,
  };

  let score = 0.2;
  for (const [k, v] of Object.entries(tags)) {
    score += rarityWeights[`${k}:${v}`] ?? 0.18;
  }
  score = Math.min(score / (keys.length + 0.5), 1);
  if (score > 0.9) return { tier: 'Mythical', score };
  if (score > 0.75) return { tier: 'Legendary', score };
  if (score > 0.55) return { tier: 'Epic', score };
  if (score > 0.35) return { tier: 'Rare', score };
  return { tier: 'Common', score };
}

function buildLetterIcon(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 80;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#3d5afe';
  ctx.beginPath();
  ctx.arc(40, 40, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.slice(0, 2).toUpperCase(), 40, 41);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  // 5% white tolerance removal
  const threshold = 255 - Math.floor(255 * 0.05);
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (r >= threshold && g >= threshold && b >= threshold) {
      data[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  return L.icon({
    iconUrl: canvas.toDataURL('image/png'),
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function conceptIcon(concept) {
  if (!concept.discovered_name) {
    return L.divIcon({ className: 'question-icon', html: '?' });
  }
  return buildLetterIcon(concept.icon_text || concept.discovered_name.slice(0, 2));
}

function conceptDetails(concept) {
  const known = concept.discovered_name ? concept.discovered_name : 'Unknown Concept';
  return `${known} • ${concept.rarity_tier} • expires ${new Date(concept.expires_at).toLocaleTimeString()}`;
}

async function fetchNearbyConcepts() {
  if (!playerLatLng) return;
  const latDelta = metersToLat(LARGE_VIEW_METERS);
  const lonDelta = metersToLon(LARGE_VIEW_METERS, playerLatLng.lat);

  const { data, error } = await supabase
    .from('concepts')
    .select('*')
    .gt('expires_at', new Date().toISOString())
    .gte('lat', playerLatLng.lat - latDelta)
    .lte('lat', playerLatLng.lat + latDelta)
    .gte('lon', playerLatLng.lng - lonDelta)
    .lte('lon', playerLatLng.lng + lonDelta)
    .order('created_at', { ascending: false });

  if (error) {
    statusEl.textContent = `Supabase error: ${error.message}`;
    return;
  }

  for (const [id, marker] of markers.entries()) {
    if (!data.find((item) => item.id === id)) {
      marker.remove();
      markers.delete(id);
    }
  }

  data.forEach((concept) => {
    const existing = markers.get(concept.id);
    if (existing) {
      existing.setIcon(conceptIcon(concept));
      existing.concept = concept;
      return;
    }
    const marker = L.marker([concept.lat, concept.lon], { icon: conceptIcon(concept) }).addTo(map);
    marker.concept = concept;
    marker.on('click', () => {
      selectedConcept = marker.concept;
      detailsEl.textContent = conceptDetails(selectedConcept);
      updateActionState();
    });
    markers.set(concept.id, marker);
  });

  if (data.length < 5) {
    await spawnConceptsIfNeeded(data.length);
  }
}

async function extractMapContext(lat, lon) {
  const q = `[out:json][timeout:15];(nwr(around:90,${lat},${lon})[name];nwr(around:120,${lat},${lon})["natural"];nwr(around:120,${lat},${lon})["amenity"];nwr(around:120,${lat},${lon})["historic"];);out tags center 40;`;
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: q,
  });
  const data = await response.json();
  const elements = data.elements ?? [];

  return elements.map((e) => ({
    name: e.tags?.name || '',
    tags: e.tags || {},
    lat: e.lat ?? e.center?.lat ?? lat,
    lon: e.lon ?? e.center?.lon ?? lon,
  }));
}

async function chooseConceptWord(contextItems, existingNames) {
  const reuseChance = 0.25 + Math.random() * 0.08;
  if (existingNames.length && Math.random() < reuseChance) {
    return existingNames[getRandomInt(0, existingNames.length - 1)].toLowerCase();
  }

  const tokens = new Set();
  for (const item of contextItems) {
    if (item.name) item.name.split(/\s+/).forEach((t) => tokens.add(t));
    for (const [k, v] of Object.entries(item.tags)) {
      tokens.add(k);
      tokens.add(v);
      tokens.add(`${k}_${v}`);
    }
  }

  const validated = [];
  for (const token of tokens) {
    if (validated.length > 16) break;
    const valid = await fetchDictionaryWord(token);
    if (valid) validated.push(valid);
  }

  const defaultWords = ['sanctuary', 'growth', 'echo', 'ember', 'horizon', 'oasis', 'market'];
  const pool = validated.length ? validated : defaultWords;
  const contextString = contextItems
    .flatMap((i) => [i.name, ...Object.entries(i.tags).map(([k, v]) => `${k}:${v}`)])
    .join(' ') || 'urban landscape';

  let best = pool[0];
  let bestScore = -Infinity;
  for (const word of pool) {
    const score = approxCosine(contextString, word);
    if (score > bestScore) {
      bestScore = score;
      best = word;
    }
  }

  return best;
}

async function spawnConceptsIfNeeded(currentCount) {
  if (!playerLatLng || currentCount >= 5) return;

  const spawnCount = getRandomInt(1, 3);
  const { data: existing } = await supabase
    .from('concepts')
    .select('discovered_name')
    .not('discovered_name', 'is', null)
    .limit(120);

  const existingNames = (existing ?? []).map((r) => r.discovered_name).filter(Boolean);

  for (let i = 0; i < spawnCount; i++) {
    const bearing = Math.random() * Math.PI * 2;
    const dist = getRandomInt(120, LARGE_VIEW_METERS);
    const lat = playerLatLng.lat + metersToLat(Math.cos(bearing) * dist);
    const lon = playerLatLng.lng + metersToLon(Math.sin(bearing) * dist, playerLatLng.lat);

    let contexts = [];
    try {
      contexts = await extractMapContext(lat, lon);
    } catch {
      contexts = [{ name: '', tags: { highway: 'residential' }, lat, lon }];
    }

    const chosen = contexts[0] ?? { tags: { highway: 'residential' } };
    const name = await chooseConceptWord(contexts, existingNames);
    const rarity = computeRarity(chosen.tags);
    const spawnModifier = Number((0.5 + rarity.score * 1.5).toFixed(2));

    const hours = getRandomInt(4, 16);
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

    await supabase.from('concepts').insert({
      lat,
      lon,
      state: 'undiscovered',
      discovered_name: null,
      icon_text: null,
      rarity_tier: rarity.tier,
      semantic_weight: Number(rarity.score.toFixed(3)),
      spawn_rate_modifier: spawnModifier,
      map_context: chosen.tags,
      osm_name: chosen.name || null,
      expires_at: expiresAt,
    });
  }
}

function updateActionState() {
  if (!playerLatLng || !selectedConcept) {
    discoverBtn.disabled = true;
    collectBtn.disabled = true;
    return;
  }
  const distance = distanceMeters(playerLatLng, { lat: selectedConcept.lat, lng: selectedConcept.lon });
  const inRange = distance <= COLLECTION_METERS;
  discoverBtn.disabled = !inRange || Boolean(selectedConcept.discovered_name);
  collectBtn.disabled = !inRange || !Boolean(selectedConcept.discovered_name);
}

discoverBtn.addEventListener('click', async () => {
  if (!selectedConcept) return;
  const contexts = await extractMapContext(selectedConcept.lat, selectedConcept.lon).catch(() => []);
  const { data: existing } = await supabase
    .from('concepts')
    .select('discovered_name')
    .not('discovered_name', 'is', null)
    .limit(100);
  const conceptName = await chooseConceptWord(contexts, (existing ?? []).map((x) => x.discovered_name).filter(Boolean));

  const { error } = await supabase
    .from('concepts')
    .update({
      state: 'discovered',
      discovered_name: conceptName,
      icon_text: conceptName.slice(0, 2).toUpperCase(),
      discovered_by: playerId,
      discovered_at: new Date().toISOString(),
    })
    .eq('id', selectedConcept.id)
    .is('discovered_name', null);

  if (error) detailsEl.textContent = `Discover failed: ${error.message}`;
});

collectBtn.addEventListener('click', async () => {
  if (!selectedConcept) return;
  const { error } = await supabase
    .from('concepts')
    .delete()
    .eq('id', selectedConcept.id);

  if (error) {
    detailsEl.textContent = `Collect failed: ${error.message}`;
  } else {
    detailsEl.textContent = 'Collected globally. Removed for all players.';
    selectedConcept = null;
    updateActionState();
  }
});

spawnBtn.addEventListener('click', async () => {
  const count = markers.size;
  await spawnConceptsIfNeeded(count);
  await fetchNearbyConcepts();
});

function updatePlayerMarker(lat, lng) {
  const latlng = L.latLng(lat, lng);
  playerLatLng = latlng;
  if (!playerMarker) {
    playerMarker = L.circleMarker(latlng, {
      radius: 8,
      color: '#2d9cdb',
      fillColor: '#2d9cdb',
      fillOpacity: 1,
    }).addTo(map);

    viewCircle = L.circle(latlng, { radius: LARGE_VIEW_METERS, color: '#3d5afe', fillOpacity: 0.05 }).addTo(map);
    collectionCircle = L.circle(latlng, { radius: COLLECTION_METERS, color: '#00c853', fillOpacity: 0.1 }).addTo(map);
    map.setView(latlng, 16);
  } else {
    playerMarker.setLatLng(latlng);
    viewCircle.setLatLng(latlng);
    collectionCircle.setLatLng(latlng);
  }
  statusEl.textContent = `Player: ${lat.toFixed(5)}, ${lng.toFixed(5)} | Visible range ${LARGE_VIEW_METERS}m | Collect range ${COLLECTION_METERS}m`;
  updateActionState();
}

navigator.geolocation.watchPosition(
  ({ coords }) => {
    updatePlayerMarker(coords.latitude, coords.longitude);
    fetchNearbyConcepts();
  },
  (error) => {
    statusEl.textContent = `Geolocation unavailable (${error.message}). Using fallback location.`;
    updatePlayerMarker(40.758, -73.9855);
    fetchNearbyConcepts();
  },
  { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
);

supabase
  .channel('concepts-realtime')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'concepts' }, () => fetchNearbyConcepts())
  .subscribe();

setInterval(async () => {
  if (!playerLatLng) return;
  const nowIso = new Date().toISOString();
  await supabase.from('concepts').delete().lt('expires_at', nowIso);
  await fetchNearbyConcepts();
}, 4 * 60 * 1000);
