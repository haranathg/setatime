import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { MindMap, MindMapNode } from '../types';
import { subtreeIds, depthsOf } from '../utils/mindMapLayout';
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

export function useMindMaps() {
  const [maps, setMaps] = useState<MindMap[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const createMap = useCallback((title: string, opts?: { lectureId?: string; course?: string }) => {
    const m = newMap(title, opts);
    setMaps((prev) => [m, ...prev]);
    return m;
  }, []);

  const deleteMap = useCallback((id: string) => {
    setMaps((prev) => prev.filter((m) => m.id !== id));
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
      setMaps((prev) =>
        prev.map((m) => {
          if (m.id !== mapId) return m;
          // New nodes inherit whichever lecture you are working under, which
          // is the whole mechanism behind "one tree, many lectures": you set
          // the working lecture once and then just type.
          const node: MindMapNode = {
            id,
            text,
            parentId,
            ...(m.workingLectureId
              ? { lectureId: m.workingLectureId, lectureTitle: m.workingLectureTitle }
              : {}),
          };
          if (!afterSiblingId) return touch({ ...m, nodes: [...m.nodes, node] });
          const at = m.nodes.findIndex((n) => n.id === afterSiblingId);
          const nodes = [...m.nodes];
          nodes.splice(at + 1, 0, node);
          return touch({ ...m, nodes });
        })
      );
      return id;
    },
    []
  );

  const updateNode = useCallback(
    (mapId: string, nodeId: string, patch: Partial<Omit<MindMapNode, 'id' | 'parentId'>>) => {
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
    []
  );

  /** Remove a node and everything under it. The root is never removable —
   *  deleting it would leave a map with no subject. */
  const deleteNode = useCallback((mapId: string, nodeId: string) => {
    setMaps((prev) =>
      prev.map((m) => {
        if (m.id !== mapId) return m;
        const target = m.nodes.find((n) => n.id === nodeId);
        if (!target || target.parentId === null) return m;
        const doomed = subtreeIds(m.nodes, nodeId);
        return touch({ ...m, nodes: m.nodes.filter((n) => !doomed.has(n.id)) });
      })
    );
  }, []);

  /** Re-parent under the node's grandparent (outdent) or its previous
   *  sibling (indent) — the two moves an outline needs. */
  const reparent = useCallback((mapId: string, nodeId: string, newParentId: string) => {
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
  }, []);

  /** Move a node among its siblings. Sibling order IS array order — the
   *  layout builds each parent's child list by scanning the array — so the
   *  move is a swap of the two siblings' array positions. Descendants live
   *  elsewhere in the array and never need touching, because only the
   *  relative order of the siblings themselves is read. */
  const moveNode = useCallback((mapId: string, nodeId: string, delta: -1 | 1) => {
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
  }, []);

  /** Tag a node and everything under it with a lecture — the retrofit path
   *  for material typed before the working lecture was set, and how an old
   *  per-lecture map keeps its provenance when grafted into a course tree. */
  const tagSubtree = useCallback(
    (mapId: string, nodeId: string, lectureId?: string, lectureTitle?: string) => {
      setMaps((prev) =>
        prev.map((m) => {
          if (m.id !== mapId) return m;
          const sub = subtreeIds(m.nodes, nodeId);
          return touch({
            ...m,
            nodes: m.nodes.map((n) =>
              sub.has(n.id) ? { ...n, lectureId, lectureTitle } : n
            ),
          });
        })
      );
    },
    []
  );

  const setWorkingLecture = useCallback(
    (mapId: string, lectureId?: string, lectureTitle?: string) => {
      setMaps((prev) =>
        prev.map((m) =>
          m.id === mapId ? touch({ ...m, workingLectureId: lectureId, workingLectureTitle: lectureTitle }) : m
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
  }, []);

  /** Drop a scaffold of children under a node in one action. Most topics in
   *  medicine take the same shape, and typing those four headings again for
   *  every disease is the kind of friction that stops a map being made. */
  const insertTemplate = useCallback(
    (mapId: string, parentId: string, labels: string[]): void => {
      setMaps((prev) =>
        prev.map((m) => {
          if (m.id !== mapId) return m;
          const tag = m.workingLectureId
            ? { lectureId: m.workingLectureId, lectureTitle: m.workingLectureTitle }
            : {};
          const made: MindMapNode[] = labels.map((text) => ({
            id: uuidv4(),
            text,
            parentId,
            ...tag,
          }));
          return touch({ ...m, nodes: [...m.nodes, ...made] });
        })
      );
    },
    []
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
            return touch({ ...m, workingLectureId: lectureId, workingLectureTitle: lectureTitle });
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
            lectureTitle,
          };
          return touch({
            ...m,
            nodes: [...m.nodes, node],
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
    setMaps((prev) => {
      const source = prev.find((m) => m.id === sourceId);
      const target = prev.find((m) => m.id === targetId);
      if (!source || !target || sourceId === targetId) return prev;
      const sourceRoot = source.nodes.find((n) => n.parentId === null);
      if (!sourceRoot) return prev;
      if (!target.nodes.some((n) => n.id === parentId)) return prev;

      // Ids are uuids and so cannot collide across maps; re-pointing the
      // source root at the target is the whole move.
      const tag =
        source.lectureId && !sourceRoot.lectureId
          ? { lectureId: source.lectureId, lectureTitle: source.title }
          : {};
      const moved = source.nodes.map((n) =>
        n.id === sourceRoot.id
          ? { ...n, parentId, section: true, ...tag }
          : { ...n, ...(tag.lectureId && !n.lectureId ? tag : {}) }
      );
      return prev
        .filter((m) => m.id !== sourceId)
        .map((m) => (m.id === targetId ? touch({ ...m, nodes: [...m.nodes, ...moved] }) : m));
    });
  }, []);

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
    tagSubtree,
    setWorkingLecture,
    collapseToDepth,
    insertTemplate,
    ensureLectureBranch,
    graftMap,
  };
}
