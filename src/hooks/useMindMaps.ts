import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { MindMap, MindMapNode } from '../types';
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
          const node: MindMapNode = { id, text, parentId };
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
        const doomed = new Set<string>([nodeId]);
        let grew = true;
        while (grew) {
          grew = false;
          for (const n of m.nodes) {
            if (n.parentId && doomed.has(n.parentId) && !doomed.has(n.id)) {
              doomed.add(n.id);
              grew = true;
            }
          }
        }
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
        const descendants = new Set<string>([nodeId]);
        let grew = true;
        while (grew) {
          grew = false;
          for (const n of m.nodes) {
            if (n.parentId && descendants.has(n.parentId) && !descendants.has(n.id)) {
              descendants.add(n.id);
              grew = true;
            }
          }
        }
        if (descendants.has(newParentId)) return m;
        return touch({
          ...m,
          nodes: m.nodes.map((n) => (n.id === nodeId ? { ...n, parentId: newParentId } : n)),
        });
      })
    );
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
  };
}
