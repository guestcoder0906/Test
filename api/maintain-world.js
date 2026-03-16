import { GAME_CONFIG, json, sbFetch, spawnInArea } from './_lib/game.js';

export default async function handler(req, res) {
  try {
    const nowIso = new Date().toISOString();

    const expired = await sbFetch('concepts', {
      method: 'DELETE',
      query: `expires_at=lt.${encodeURIComponent(nowIso)}&select=id`,
    });

    const activeCells = await sbFetch('active_cells', {
      query: `select=*&last_seen_at=gt.${encodeURIComponent(new Date(Date.now() - 24 * 3600 * 1000).toISOString())}&order=last_seen_at.desc&limit=40`,
    });

    let spawned = 0;
    for (const cell of activeCells) {
      const nextRespawnAt = cell.next_respawn_at ? new Date(cell.next_respawn_at).getTime() : 0;
      if (Date.now() < nextRespawnAt) continue;

      const result = await spawnInArea(cell.lat, cell.lon);
      spawned += result.spawned;

      const minutes = GAME_CONFIG.respawnMinMinutes + Math.random() * (GAME_CONFIG.respawnMaxMinutes - GAME_CONFIG.respawnMinMinutes);
      const nextAt = new Date(Date.now() + minutes * 60000).toISOString();
      await sbFetch('active_cells', {
        method: 'PATCH',
        query: `cell_key=eq.${encodeURIComponent(cell.cell_key)}`,
        body: { next_respawn_at: nextAt, last_seen_at: nowIso },
      });
    }

    return json(res, 200, {
      ok: true,
      expiredRemoved: expired.length,
      activeCellsChecked: activeCells.length,
      spawned,
      message: 'Concept Go! world maintenance complete.',
    });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
}
