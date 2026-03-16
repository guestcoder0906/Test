import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const SUPABASE_URL = 'https://oyxgydfmaocqxictnmou.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_9l3BSqU-mIdYLEgZB2Pv2Q_UUZXU385';

const map = L.map('map', { zoomControl: false }).setView([0, 0], 2);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const statusEl = document.getElementById('status');
const detailsEl = document.getElementById('details');
const collectedModal = document.getElementById('collectedModal');
const collectedConceptNameEl = document.getElementById('collectedConceptName');
const collectedConceptRarityEl = document.getElementById('collectedConceptRarity');
const closeCollectedModalBtn = document.getElementById('closeCollectedModalBtn');
const discoverBtn = document.getElementById('discoverBtn');
const collectBtn = document.getElementById('collectBtn');
const spawnBtn = document.getElementById('spawnBtn');
const adminModeToggle = document.getElementById('adminModeToggle');

const playerId = localStorage.getItem('concept-go-player-id') ?? crypto.randomUUID();
localStorage.setItem('concept-go-player-id', playerId);

let player = null;
let selectedConcept = null;
let config = { largeViewMeters: 1200, collectionMeters: 50 };
let adminMode = false;
let adminPassword = '';
let playerMarker;
let viewCircle;
let collectionCircle;
const markers = new Map();
let latestLoadToken = 0;

const LOAD_CHUNK_STEP_METERS = 350;

if (adminModeToggle) {
  adminModeToggle.checked = false;
  adminModeToggle.addEventListener('change', () => {
    if (adminModeToggle.checked) {
      const enteredPassword = window.prompt('Enter admin password');
      if (!enteredPassword) {
        adminModeToggle.checked = false;
        adminMode = false;
        adminPassword = '';
        detailsEl.textContent = 'Admin mode stays off (password required).';
      } else {
        adminMode = true;
        adminPassword = enteredPassword;
        detailsEl.textContent = 'Admin mode enabled for this session.';
      }
    } else {
      adminMode = false;
      adminPassword = '';
      detailsEl.textContent = 'Admin mode disabled.';
    }
    updateActionState();
  });
}


function hideCollectedModal() {
  if (!collectedModal) return;
  collectedModal.hidden = true;
}

function showCollectedModal(concept) {
  if (!collectedModal || !concept) return;
  collectedConceptNameEl.textContent = concept.discoveredName || 'Unknown Concept';
  collectedConceptRarityEl.textContent = concept.rarityTier || 'Unknown rarity';
  collectedModal.hidden = false;
}

if (closeCollectedModalBtn) {
  closeCollectedModalBtn.addEventListener('click', hideCollectedModal);
}

if (collectedModal) {
  collectedModal.addEventListener('click', (event) => {
    if (event.target === collectedModal) hideCollectedModal();
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') hideCollectedModal();
});

function buildLetterIcon(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 96, 96);
  ctx.fillStyle = '#3d5afe';
  ctx.beginPath();
  ctx.arc(48, 48, 36, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.slice(0, 2).toUpperCase(), 48, 49);

  const imageData = ctx.getImageData(0, 0, 96, 96);
  const threshold = 255 - Math.floor(255 * 0.05);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i];
    const g = imageData.data[i + 1];
    const b = imageData.data[i + 2];
    if (r >= threshold && g >= threshold && b >= threshold) {
      imageData.data[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  return L.icon({ iconUrl: canvas.toDataURL('image/png'), iconSize: [56, 56], iconAnchor: [28, 28] });
}

function conceptIcon(concept) {
  if (!concept.discovered_name) {
    return L.divIcon({ className: 'question-icon', html: '?', iconSize: [56, 56], iconAnchor: [28, 28] });
  }
  return buildLetterIcon((concept.icon_text || concept.discovered_name).slice(0, 2));
}

function distanceToSelected() {
  if (!player || !selectedConcept) return Infinity;
  return map.distance([player.lat, player.lon], [selectedConcept.lat, selectedConcept.lon]);
}

function updateActionState() {
  const distance = distanceToSelected();
  const inCollectionRange = distance <= config.collectionMeters;
  const hasSelected = Boolean(selectedConcept);
  const isDiscovered = Boolean(selectedConcept?.discovered_name);

  discoverBtn.disabled = !hasSelected || !inCollectionRange || isDiscovered;

  const canCollect = hasSelected && isDiscovered && (inCollectionRange || adminMode);
  collectBtn.disabled = !canCollect;
}

function renderDetails(concept) {
  const name = concept.discovered_name || 'Unknown Concept';
  detailsEl.textContent = `${name} • ${concept.rarity_tier} • ${Math.round(distanceToSelected())}m away${adminMode ? ' • ADMIN' : ''}`;
}

function syncPlayerMarker() {
  if (!player) return;
  const latlng = [player.lat, player.lon];
  if (!playerMarker) {
    playerMarker = L.circleMarker(latlng, { radius: 8, color: '#2d9cdb', fillColor: '#2d9cdb', fillOpacity: 1 }).addTo(map);
    viewCircle = L.circle(latlng, { radius: config.largeViewMeters, color: '#3d5afe', fillOpacity: 0.05 }).addTo(map);
    collectionCircle = L.circle(latlng, { radius: config.collectionMeters, color: '#00c853', fillOpacity: 0.1 }).addTo(map);
    map.setView(latlng, 16);
  } else {
    playerMarker.setLatLng(latlng);
    viewCircle.setLatLng(latlng).setRadius(config.largeViewMeters);
    collectionCircle.setLatLng(latlng).setRadius(config.collectionMeters);
  }
}

function reconcileMarkers(concepts, incomingIds) {
  for (const [id, marker] of markers.entries()) {
    if (!incomingIds.has(id)) {
      marker.remove();
      markers.delete(id);
    }
  }

  for (const concept of concepts) {
    if (markers.has(concept.id)) {
      const m = markers.get(concept.id);
      m.concept = concept;
      m.setIcon(conceptIcon(concept));
      continue;
    }
    const marker = L.marker([concept.lat, concept.lon], { icon: conceptIcon(concept), keyboard: true, riseOnHover: true }).addTo(map);
    marker.concept = concept;
    marker.on('click', () => {
      selectedConcept = marker.concept;
      renderDetails(selectedConcept);
      updateActionState();
    });
    markers.set(concept.id, marker);
  }
}

async function fetchConceptChunk(radiusMeters, shouldSpawn) {
  const q = new URLSearchParams({
    lat: String(player.lat),
    lon: String(player.lon),
    meters: String(radiusMeters),
    spawn: shouldSpawn ? 'true' : 'false',
  });
  const response = await fetch(`/api/concepts?${q}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Failed to load concepts');
  return payload;
}

async function loadConcepts() {
  if (!player) return;
  const loadToken = ++latestLoadToken;

  const radii = [];
  for (let meters = LOAD_CHUNK_STEP_METERS; meters < config.largeViewMeters; meters += LOAD_CHUNK_STEP_METERS) {
    radii.push(meters);
  }
  radii.push(config.largeViewMeters);

  const conceptsById = new Map();

  for (let i = 0; i < radii.length; i++) {
    const isFirstChunk = i === 0;
    const radiusMeters = radii[i];
    const payload = await fetchConceptChunk(radiusMeters, isFirstChunk);

    if (loadToken !== latestLoadToken) return;

    config = payload.config;

    for (const concept of payload.concepts || []) {
      conceptsById.set(concept.id, concept);
    }

    const concepts = [...conceptsById.values()];
    const incomingIds = new Set(conceptsById.keys());
    reconcileMarkers(concepts, incomingIds);

    statusEl.textContent = `Player ${player.lat.toFixed(5)}, ${player.lon.toFixed(5)} | View ${config.largeViewMeters}m | Collect ${config.collectionMeters}m | Loaded ${concepts.length} concepts`;

    if (selectedConcept) {
      selectedConcept = conceptsById.get(selectedConcept.id) || null;
      if (selectedConcept) renderDetails(selectedConcept);
    }

    syncPlayerMarker();
    updateActionState();
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Request failed');
  return payload;
}

discoverBtn.addEventListener('click', async () => {
  if (!selectedConcept || !player) return;
  try {
    await postJson('/api/discover', {
      conceptId: selectedConcept.id,
      playerId,
      playerLat: player.lat,
      playerLon: player.lon,
      adminMode,
    });
    await loadConcepts();
  } catch (error) {
    detailsEl.textContent = `Discover failed: ${error.message}`;
  }
});

collectBtn.addEventListener('click', async () => {
  if (!selectedConcept || !player) return;
  try {
    const payload = await postJson('/api/collect', {
      conceptId: selectedConcept.id,
      playerLat: player.lat,
      playerLon: player.lon,
      adminMode,
      adminPassword,
    });
    selectedConcept = null;
    detailsEl.textContent = 'Collected globally.';
    showCollectedModal(payload.concept);
    await loadConcepts();
  } catch (error) {
    detailsEl.textContent = `Collect failed: ${error.message}`;
  }
});

spawnBtn.addEventListener('click', async () => {
  if (!player) return;
  try {
    await postJson('/api/spawn', { lat: player.lat, lon: player.lon, force: true });
    await loadConcepts();
  } catch (error) {
    detailsEl.textContent = `Spawn failed: ${error.message}`;
  }
});

navigator.geolocation.watchPosition(
  async ({ coords }) => {
    player = { lat: coords.latitude, lon: coords.longitude };
    syncPlayerMarker();
    await loadConcepts();
  },
  async (err) => {
    statusEl.textContent = `Geolocation unavailable (${err.message}) using fallback.`;
    player = { lat: 40.758, lon: -73.9855 };
    syncPlayerMarker();
    await loadConcepts();
  },
  { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
);

supabase
  .channel('concepts-live')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'concepts' }, () => loadConcepts())
  .subscribe();

setInterval(() => {
  if (player) loadConcepts();
}, 30000);
