// Local version history for mind maps.
//
// This exists because a map is the only thing in the app you can destroy a
// lot of in one keystroke. Delete removes a node AND everything under it,
// and the tree it takes with it can be an afternoon's work. Undo covers the
// same session; this covers everything else — a reload, a crash, a delete
// you only notice was wrong the next day.
//
// Deliberately localStorage and not synced state. A snapshot is a per-device
// safety net, and putting it in the synced blob would push the very payload
// that is already close to the sync ceiling toward it much faster. It also
// means the copy survives the case that matters most: the cloud object
// having already been overwritten with the damage.

import type { MindMap, MindMapNode } from '../types';

const KEY = 'setatime.mapSnapshots';
/** Per map. Twelve is enough to step back through a working session
 *  without turning localStorage into an archive. */
const PER_MAP = 12;
/** Total serialised budget. localStorage is typically 5-10MB and the app's
 *  own state already lives there, so history stays well under a quarter. */
const MAX_BYTES = 1_200_000;

export interface MapSnapshot {
  at: string;
  title: string;
  nodes: MindMapNode[];
  /** Why it was taken — shown in the list, so "before deleting 14 nodes"
   *  is distinguishable from a routine autosave. */
  reason?: string;
}

export type SnapshotStore = Record<string, MapSnapshot[]>;

export function loadSnapshots(): SnapshotStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as SnapshotStore;
  } catch {
    // A corrupt or unreadable store must never take the app down with it —
    // history is a nicety, the map is not.
    return {};
  }
}

function persist(store: SnapshotStore): void {
  // Trim newest-first per map, then drop oldest entries globally until the
  // whole thing fits. Dropping oldest rather than refusing to write keeps
  // the most recent — and most likely useful — history alive.
  const pruned: SnapshotStore = {};
  for (const [id, snaps] of Object.entries(store)) {
    if (snaps.length) pruned[id] = [...snaps].sort((a, b) => b.at.localeCompare(a.at)).slice(0, PER_MAP);
  }

  let text = JSON.stringify(pruned);
  while (text.length > MAX_BYTES) {
    let oldestId: string | null = null;
    let oldestAt = '';
    for (const [id, snaps] of Object.entries(pruned)) {
      const last = snaps[snaps.length - 1];
      if (!last) continue;
      if (!oldestId || last.at < oldestAt) {
        oldestId = id;
        oldestAt = last.at;
      }
    }
    if (!oldestId) break;
    pruned[oldestId].pop();
    if (!pruned[oldestId].length) delete pruned[oldestId];
    text = JSON.stringify(pruned);
  }

  try {
    localStorage.setItem(KEY, text);
  } catch {
    // Out of quota. Halving and retrying once is better than silently
    // keeping nothing at all.
    try {
      const half: SnapshotStore = {};
      for (const [id, snaps] of Object.entries(pruned)) half[id] = snaps.slice(0, 3);
      localStorage.setItem(KEY, JSON.stringify(half));
    } catch {
      // Nothing more to be done; the app carries on without history.
    }
  }
}

/** Record the map as it is right now. Identical consecutive states are not
 *  stored twice, so a routine autosave after no change costs nothing. */
export function snapshotMap(map: MindMap, reason?: string): void {
  const store = loadSnapshots();
  const existing = store[map.id] ?? [];
  const latest = existing[0];
  if (latest && latest.nodes.length === map.nodes.length && JSON.stringify(latest.nodes) === JSON.stringify(map.nodes)) {
    // Same content, so no second copy — but a routine autosave that turns
    // out to be the last good state before a deletion should say so. The
    // timestamp stays: that really is when this state existed.
    if (reason && reason !== 'autosave' && (!latest.reason || latest.reason === 'autosave')) {
      store[map.id] = [{ ...latest, reason }, ...existing.slice(1)];
      persist(store);
    }
    return;
  }
  store[map.id] = [
    { at: new Date().toISOString(), title: map.title, nodes: map.nodes, reason },
    ...existing,
  ];
  persist(store);
}

export function snapshotsFor(mapId: string): MapSnapshot[] {
  return loadSnapshots()[mapId] ?? [];
}

export function forgetSnapshots(mapId: string): void {
  const store = loadSnapshots();
  if (!(mapId in store)) return;
  delete store[mapId];
  persist(store);
}

/** History belonging to maps that no longer exist — how a map deleted
 *  outright gets offered back rather than simply being gone. */
export function orphanedSnapshots(liveIds: Set<string>): { mapId: string; snaps: MapSnapshot[] }[] {
  return Object.entries(loadSnapshots())
    .filter(([id, snaps]) => !liveIds.has(id) && snaps.length > 0)
    .map(([mapId, snaps]) => ({ mapId, snaps }))
    .sort((a, b) => b.snaps[0].at.localeCompare(a.snaps[0].at));
}
