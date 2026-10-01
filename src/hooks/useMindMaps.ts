import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { MindMap, MindMapNode, DropPosition } from '../types';
import { subtreeIds, depthsOf } from '../utils/mindMapLayout';
import { snapshotMap, forgetSnapshots } from '../utils/mapSnapshots';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

export function newMap(title: string, opts?: { lectureId?: string; course?: string }): MindMap {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    title: title.trim() || 'Untitled map',
    // The root carries the map's subject, so a new map is already one node
    // deep and the first thing you do is add a branch rather than name a box.
    nodes: [{ id: uuidv4(), text: title.trim() || 'Untitled map', parentId: null }],
    createdAt: now,
    updatedAt: now,
    lectureId: opts?.lectureId,
    course: opts?.course,
  };
}

/** How long two edits of the same thing are treated as one undo step.
 *  Without it every keystroke is its own step and undo becomes useless. */
const COALESCE_MS = 700;
const HISTORY_LIMIT = 60;
/** A routine snapshot at most this often. Destructive actions ignore it. */
const SNAPSHOT_EVERY_MS = 3 * 60 * 1000;

export function useMindMaps() {
  const [maps, setMaps] = useState<MindMap[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Undo history, per map, in memory only. Snapshots are the thing that
  // survives a reload; this is the fast path for "no, not that".
  const pastRef = useRef<Map<string, MindMap[]>>(new Map());
  const futureRef = useRef<Map<string, MindMap[]>>(new Map());
  const lastPushRef = useRef<{ key: string; at: number } | null>(null);
  const [historyTick, setHistoryTick] = useState(0);

  // A mirror of `maps` that can be read outside an updater. Snapshotting the
  // previous state from inside setMaps would be a side effect in a function
  // React is free to call twice.
  const mapsRef = useRef<MindMap[]>([]);
  useEffect(() => {
    mapsRef.current = maps;
  }, [maps]);

  const snapTimesRef = useRef<Map<string, number>>(new Map());
  const snapSeenRef = useRef<Map<string, string>>(new Map());

  /** Remember the map as it stands before a change. `coalesceKey` folds a
   *  run of edits to the same field into one step. */
  const pushHistory = useCallback((mapId: string, coalesceKey?: string) => {
    const current = mapsRef.current.find((m) => m.id === mapId);
    if (!current) return;
    const now = Date.now();
    if (coalesceKey) {
      const last = lastPushRef.current;
      if (last && last.key === coalesceKey && now - last.at < COALESCE_MS) {
        lastPushRef.current = { key: coalesceKey, at: now };
        return;
      }
      lastPushRef.current = { key: coalesceKey, at: now };
    } else {
      lastPushRef.current = null;
    }
    const past = pastRef.current.get(mapId) ?? [];
    past.push(current);
    if (past.length > HISTORY_LIMIT) past.shift();
    pastRef.current.set(mapId, past);
    // Any new edit abandons the redo branch.
    futureRef.current.delete(mapId);
    setHistoryTick((t) => t + 1);
  }, []);

  const undo = useCallback((mapId: string) => {
    const past = pastRef.current.get(mapId);
    if (!past || past.length === 0) return;
    const previous = past.pop()!;
    const current = mapsRef.current.find((m) => m.id === mapId);
    if (current) {
      const future = futureRef.current.get(mapId) ?? [];
      future.push(current);
      futureRef.current.set(mapId, future);
    }
    lastPushRef.current = null;
    setMaps((prev) => prev.map((m) => (m.id === mapId ? previous : m)));
    setHistoryTick((t) => t + 1);
  }, []);

  const redo = useCallback((mapId: string) => {
    const future = futureRef.current.get(mapId);
    if (!future || future.length === 0) return;
    const next = future.pop()!;
    const current = mapsRef.current.find((m) => m.id === mapId);
    if (current) {
      const past = pastRef.current.get(mapId) ?? [];
      past.push(current);
      pastRef.current.set(mapId, past);
    }
    lastPushRef.current = null;
    setMaps((prev) => prev.map((m) => (m.id === mapId ? next : m)));
    setHistoryTick((t) => t + 1);
  }, []);

  const undoDepth = useCallback(
    (mapId: string) => {
      void historyTick;
      return pastRef.current.get(mapId)?.length ?? 0;
    },
    [historyTick]
  );
  const redoDepth = useCallback(
    (mapId: string) => {
      void historyTick;
      return futureRef.current.get(mapId)?.length ?? 0;
    },
    [historyTick]
  );

  /** Write a restore point now, whatever the throttle says. Used before
   *  anything that destroys nodes. */
  const snapshotNow = useCallback((mapId: string, reason: string) => {
    const map = mapsRef.current.find((m) => m.id === mapId);
    if (!map) return;
    snapshotMap(map, reason);
    snapTimesRef.current.set(mapId, Date.now());
    snapSeenRef.current.set(mapId, map.updatedAt);
  }, []);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setMaps(local.mindMaps?.maps || []);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.mindMaps?.maps) {
            // Union by id, newest updatedAt wins. A map edited on the laptop
            // and another started on the phone should both survive.
            const merged = new Map<string, MindMap>();
            for (const m of cloud.mindMaps.maps) merged.set(m.id, m);
            for (const m of local.mindMaps?.maps || []) {
              const mine = merged.get(m.id);
              if (!mine || m.updatedAt > mine.updatedAt) merged.set(m.id, m);
            }
            setMaps(Array.from(merged.values()));
          }
        } catch {
          // sync errors handled elsewhere
        }
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const state = loadState();
    const updated = { ...state, mindMaps: { maps } };
    saveState(updated);

    // A restore point every few minutes per changed map. Cheap, and it is
    // what turns "I lost an afternoon" into "I lost three minutes".
    const now = Date.now();
    for (const m of maps) {
      if (snapSeenRef.current.get(m.id) === m.updatedAt) continue;
      const last = snapTimesRef.current.get(m.id) ?? 0;
      if (now - last < SNAPSHOT_EVERY_MS) continue;
      snapshotMap(m, 'autosave');
      snapTimesRef.current.set(m.id, now);
      snapSeenRef.current.set(m.id, m.updatedAt);
    }

    const key = getSecretKey();
    if (key) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          await syncSave(key, updated);
        } catch {
          // handled elsewhere
        }
      }, 1500);
    }
  }, [maps, loaded]);

  const touch = (m: MindMap): MindMap => ({ ...m, updatedAt: new Date().toISOString() });

  /** What a new node picks up from the map it is added to. */
  const inheritedTag = (m: MindMap): Partial<MindMapNode> =>
    m.workingLabel
      ? { label: m.workingLabel, ...(m.workingLectureId ? { lectureId: m.workingLectureId } : {}) }
      : {};

  const createMap = useCallback((title: string, opts?: { lectureId?: string; course?: string }) => {
    const m = newMap(title, opts);
    setMaps((prev) => [m, ...prev]);
    return m;
  }, []);

  const deleteMap = useCallback(
    (id: string) => {
      // Snapshots are deliberately NOT forgotten here — a deleted map is
      // offered back from the list, which is only possible if its history
      // outlives it.
      snapshotNow(id, 'before deleting the map');
      setMaps((prev) => prev.filter((m) => m.id !== id));
    },
    [snapshotNow]
  );

  /** Drop a map's history for good. Only ever called when the user
   *  dismisses a recoverable map, never as part of deleting one. */
  const discardHistory = useCallback((mapId: string) => {
    forgetSnapshots(mapId);
  }, []);

  const renameMap = useCallback((id: string, title: string) => {
    setMaps((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const nodes = m.nodes.map((n) => (n.parentId === null ? { ...n, text: title } : n));
        return touch({ ...m, title, nodes });
      })
    );
  }, []);

  /** Insert a node under `parentId`, optionally right after a given sibling
   *  so Enter puts the new node next to the one you were on rather than at
   *  the end of the branch. */
  const addNode = useCallback(
    (mapId: string, parentId: string, text = '', afterSiblingId?: string): string => {
      const id = uuidv4();
      pushHistory(mapId);
      setMaps((prev) =>
        prev.map((m) => {
          if (m.id !== mapId) return m;
          // New nodes inherit whatever label you are working under. That is
          // the whole mechanism behind "one tree, many lectures" — you set
          // the label once and then just type.
          const node: MindMapNode = { id, text, parentId, ...inheritedTag(m) };
          if (!afterSiblingId) return touch({ ...m, nodes: [...m.nodes, node] });
          const at = m.nodes.findIndex((n) => n.id === afterSiblingId);
          const nodes = [...m.nodes];
          nodes.splice(at + 1, 0, node);
          return touch({ ...m, nodes });
        })
      );
      return id;
    },
    [pushHistory]
  );

  const updateNode = useCallback(
    (mapId: string, nodeId: string, patch: Partial<Omit<MindMapNode, 'id' | 'parentId'>>) => {
      // Typed fields coalesce into one undo step per burst; structural flags
      // (section, star, collapsed) do not, because each is a deliberate act.
      // Without this a note would push an undo entry per keystroke and blow
      // the history cap inside a single sentence.
      const keys = Object.keys(patch);
      const typed = keys.length === 1 && (keys[0] === 'text' || keys[0] === 'note');
      pushHistory(mapId, typed ? `${keys[0]}:${nodeId}` : undefined);
      setMaps((prev) =>
        prev.map((m) => {
          if (m.id !== mapId) return m;
          const nodes = m.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n));
          // Renaming the root renames the map — they are the same thing.
          const root = nodes.find((n) => n.parentId === null);
          return touch({ ...m, nodes, title: root ? root.text : m.title });
        })
      );
    },
    [pushHistory]
  );

  /** Remove a node and everything under it. The root is never removable —
   *  deleting it would leave a map with no subject. */
  const deleteNode = useCallback((mapId: string, nodeId: string) => {
    const before = mapsRef.current.find((m) => m.id === mapId);
    const going = before ? subtreeIds(before.nodes, nodeId).size : 0;
    // Deleting a node takes its whole subtree. Anything more than the node
    // itself gets a restore point on disk, not just an in-memory undo step,
    // because the reload that loses the undo stack is exactly when you
    // discover the mistake.
    if (going > 1) snapshotNow(mapId, `before deleting ${going} nodes`);
    pushHistory(mapId);
    setMaps((prev) =>
      prev.map((m) => {
        if (m.id !== mapId) return m;
        const target = m.nodes.find((n) => n.id === nodeId);
        if (!target || target.parentId === null) return m;
        const doomed = subtreeIds(m.nodes, nodeId);
        return touch({ ...m, nodes: m.nodes.filter((n) => !doomed.has(n.id)) });
      })
    );
  }, [pushHistory, snapshotNow]);

  /** Re-parent under the node's grandparent (outdent) or its previous
   *  sibling (indent) — the two moves an outline needs. */
  const reparent = useCallback((mapId: string, nodeId: string, newParentId: string) => {
    pushHistory(mapId);
    setMaps((prev) =>
      prev.map((m) => {
        if (m.id !== mapId) return m;
        // Refuse a cycle: you cannot become a child of your own descendant.
        if (subtreeIds(m.nodes, nodeId).has(newParentId)) return m;
        return touch({
          ...m,
          nodes: m.nodes.map((n) => (n.id === nodeId ? { ...n, parentId: newParentId } : n)),
        });
      })
    );
  }, [pushHistory]);

  /** Move a node among its siblings. Sibling order IS array order — the
   *  layout builds each parent's child list by scanning the array — so the
   *  move is a swap of the two siblings' array positions. Descendants live
   *  elsewhere in the array and never need touching, because only the
   *  relative order of the siblings themselves is read. */
  const moveNode = useCallback((mapId: string, nodeId: string, delta: -1 | 1) => {
    pushHistory(mapId);
    setMaps((prev) =>
      prev.map((m) => {
        if (m.id !== mapId) return m;
        const node = m.nodes.find((n) => n.id === nodeId);
        if (!node || node.parentId === null) return m;
        const siblings = m.nodes.filter((n) => n.parentId === node.parentId);
        const at = siblings.findIndex((n) => n.id === nodeId);
        const to = at + delta;
        if (to < 0 || to >= siblings.length) return m;
        const i = m.nodes.findIndex((n) => n.id === nodeId);
        const j = m.nodes.findIndex((n) => n.id === siblings[to].id);
        const nodes = [...m.nodes];
        [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
        return touch({ ...m, nodes });
      })
    );
  }, [pushHistory]);

  /** Move a node to a new place in the tree — the one action behind drag.
   *
   *  `position` is relative to `targetId`: 'child' makes it the target's last
   *  child, 'before'/'after' make it the target's sibling on that side.
   *
   *  Only the node's own array entry moves. Its descendants are found by
   *  parentId and follow it wherever it lands, and sibling order IS array
   *  order, so placing the entry correctly among its new siblings is the
   *  whole job. */
  const moveNodeTo = useCallback(
    (mapId: string, nodeId: string, targetId: string, position: DropPosition) => {
      pushHistory(mapId);
      setMaps((prev) =>
        prev.map((m) => {
          if (m.id !== mapId) return m;
          const node = m.nodes.find((n) => n.id === nodeId);
          const target = m.nodes.find((n) => n.id === targetId);
          if (!node || !target || node.parentId === null) return m;
          if (nodeId === targetId) return m;
          // Never inside yourself: that severs the subtree from the root and
          // leaves it unreachable and unprintable.
          if (subtreeIds(m.nodes, nodeId).has(targetId)) return m;

          const newParentId = position === 'child' ? targetId : target.parentId;
          // The root has no siblings, so there is no before or after it.
          if (newParentId === null) return m;

          const without = m.nodes.filter((n) => n.id !== nodeId);
          let at: number;
          if (position === 'child') {
            const lastChild = without.reduce(
              (acc, n, i) => (n.parentId === targetId ? i : acc),
              without.findIndex((n) => n.id === targetId)
            );
            at = lastChild + 1;
          } else {
            const ti = without.findIndex((n) => n.id === targetId);
            at = position === 'before' ? ti : ti + 1;
          }

          const moved = { ...node, parentId: newParentId };
          const nodes = [...without.slice(0, at), moved, ...without.slice(at)];
          // A drop into a collapsed parent must open it, or what you just
          // moved is invisible and looks lost.
          const opened =
            position === 'child'
              ? nodes.map((n) => (n.id === targetId ? { ...n, collapsed: false } : n))
              : nodes;
          return touch({ ...m, nodes: opened });
        })
      );
    },
    [pushHistory]
  );

  /** Label a node and everything under it — the retrofit path for material
   *  typed before the working label was set, and how an old per-lecture map
   *  keeps its provenance when grafted into a course tree. Clearing the
   *  label also clears the inherited lecture title, or the old tag would
   *  keep showing through. */
  const tagSubtree = useCallback(
    (mapId: string, nodeId: string, label?: string) => {
      pushHistory(mapId);
      setMaps((prev) =>
        prev.map((m) => {
          if (m.id !== mapId) return m;
          const sub = subtreeIds(m.nodes, nodeId);
          return touch({
            ...m,
            nodes: m.nodes.map((n) =>
              sub.has(n.id) ? { ...n, label, lectureTitle: label ? n.lectureTitle : undefined } : n
            ),
          });
        })
      );
    },
    [pushHistory]
  );

  const setWorkingLabel = useCallback(
    (mapId: string, label?: string, lectureId?: string) => {
      setMaps((prev) =>
        prev.map((m) =>
          m.id === mapId
            ? touch({
                ...m,
                workingLabel: label,
                workingLectureId: lectureId,
                workingLectureTitle: label,
              })
            : m
        )
      );
    },
    []
  );

  /** Collapse everything below `depth`, expand everything above it. Passing
   *  Infinity expands the whole tree. The single control that makes a
   *  course-sized map usable: depth 2 is the big picture, depth 1 is the
   *  table of contents. */
  const collapseToDepth = useCallback((mapId: string, depth: number) => {
    pushHistory(mapId);
    setMaps((prev) =>
      prev.map((m) => {
        if (m.id !== mapId) return m;
        const depths = depthsOf(m.nodes);
        return touch({
          ...m,
          nodes: m.nodes.map((n) => ({ ...n, collapsed: (depths.get(n.id) ?? 0) >= depth })),
        });
      })
    );
  }, [pushHistory]);

  /** Drop a scaffold of children under a node in one action. Most topics in
   *  medicine take the same shape, and typing those four headings again for
   *  every disease is the kind of friction that stops a map being made. */
  const insertTemplate = useCallback(
    (mapId: string, parentId: string, labels: string[]): void => {
      pushHistory(mapId);
      setMaps((prev) =>
        prev.map((m) => {
          if (m.id !== mapId) return m;
          const made: MindMapNode[] = labels.map((text) => ({
            id: uuidv4(),
            text,
            parentId,
            ...inheritedTag(m),
          }));
          return touch({ ...m, nodes: [...m.nodes, ...made] });
        })
      );
    },
    [pushHistory]
  );

  /** Find the lecture's place in a course tree, creating it if absent, and
   *  make it the working lecture. This is what "Map it" now does instead of
   *  starting a fresh document every time. */
  const ensureLectureBranch = useCallback(
    (mapId: string, lectureId: string, lectureTitle: string): string => {
      const id = uuidv4();
      setMaps((prev) =>
        prev.map((m) => {
          if (m.id !== mapId) return m;
          const existing = m.nodes.find((n) => n.lectureId === lectureId && n.section);
          if (existing) {
            return touch({
              ...m,
              workingLabel: lectureTitle,
              workingLectureId: lectureId,
              workingLectureTitle: lectureTitle,
            });
          }
          const root = m.nodes.find((n) => n.parentId === null);
          if (!root) return m;
          // A lecture arrives as its own section, because a lecture is
          // exactly the grain you want a printed page to break on.
          const node: MindMapNode = {
            id,
            text: lectureTitle,
            parentId: root.id,
            section: true,
            lectureId,
            label: lectureTitle,
          };
          return touch({
            ...m,
            nodes: [...m.nodes, node],
            workingLabel: lectureTitle,
            workingLectureId: lectureId,
            workingLectureTitle: lectureTitle,
          });
        })
      );
      return id;
    },
    []
  );

  /** Move every node of `sourceId` under a node of `targetId`, then delete
   *  the source. The migration path for the per-lecture maps made before
   *  course trees existed: nothing is retyped and the ids are preserved, so
   *  a map that was already tagged keeps its tags. */
  const graftMap = useCallback((sourceId: string, targetId: string, parentId: string) => {
    snapshotNow(sourceId, 'before moving into another map');
    snapshotNow(targetId, 'before another map was moved in');
    pushHistory(targetId);
    setMaps((prev) => {
      const source = prev.find((m) => m.id === sourceId);
      const target = prev.find((m) => m.id === targetId);
      if (!source || !target || sourceId === targetId) return prev;
      const sourceRoot = source.nodes.find((n) => n.parentId === null);
      if (!sourceRoot) return prev;
      if (!target.nodes.some((n) => n.id === parentId)) return prev;

      // Ids are uuids and so cannot collide across maps; re-pointing the
      // source root at the target is the whole move.
      const tag = !sourceRoot.label && !sourceRoot.lectureTitle ? { label: source.title } : {};
      const moved = source.nodes.map((n) =>
        n.id === sourceRoot.id
          ? { ...n, parentId, section: true, ...tag }
          : { ...n, ...(tag.label && !n.label && !n.lectureTitle ? tag : {}) }
      );
      return prev
        .filter((m) => m.id !== sourceId)
        .map((m) => (m.id === targetId ? touch({ ...m, nodes: [...m.nodes, ...moved] }) : m));
    });
  }, [pushHistory, snapshotNow]);

  /** Put a map back to a recorded state. The current state becomes an undo
   *  step, so restoring the wrong version is itself reversible. */
  const restoreSnapshot = useCallback(
    (mapId: string, nodes: MindMapNode[], title: string) => {
      const exists = mapsRef.current.some((m) => m.id === mapId);
      if (exists) {
        snapshotNow(mapId, 'before restoring a version');
        pushHistory(mapId);
        setMaps((prev) =>
          prev.map((m) => (m.id === mapId ? touch({ ...m, nodes, title }) : m))
        );
        return mapId;
      }
      // The map itself was deleted: rebuild it around the recorded nodes,
      // keeping its id so its remaining history still belongs to it.
      const now = new Date().toISOString();
      const revived: MindMap = {
        id: mapId,
        title,
        nodes,
        createdAt: now,
        updatedAt: now,
      };
      setMaps((prev) => [revived, ...prev]);
      return mapId;
    },
    [pushHistory, snapshotNow]
  );

  const sorted = useMemo(
    () => [...maps].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [maps]
  );

  return {
    maps: sorted,
    loaded,
    createMap,
    deleteMap,
    renameMap,
    addNode,
    updateNode,
    deleteNode,
    reparent,
    moveNode,
    moveNodeTo,
    tagSubtree,
    setWorkingLabel,
    collapseToDepth,
    insertTemplate,
    ensureLectureBranch,
    graftMap,
    undo,
    redo,
    undoDepth,
    redoDepth,
    restoreSnapshot,
    discardHistory,
  };
}
