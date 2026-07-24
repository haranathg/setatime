import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { CompassEntry, CompassItem } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function useCompass() {
  const [entries, setEntries] = useState<CompassEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setEntries(local.compass?.entries || []);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.compass?.entries) {
            const merged = new Map<string, CompassEntry>();
            for (const e of cloud.compass.entries) merged.set(e.id, e);
            for (const e of local.compass?.entries || []) {
              if (!merged.has(e.id)) merged.set(e.id, e);
            }
            setEntries(Array.from(merged.values()));
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
    const updated = { ...state, compass: { entries } };
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
  }, [entries, loaded]);

  const addEntry = useCallback((items: CompassItem[]): CompassEntry => {
    const entry: CompassEntry = {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      items,
    };
    setEntries((prev) => [entry, ...prev]);
    return entry;
  }, []);

  const deleteEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // Rolling seven-day count for the streak chip on Compass home.
  const weekCount = useMemo(() => {
    const cutoff = Date.now() - WEEK_MS;
    return entries.filter((e) => new Date(e.createdAt).getTime() >= cutoff).length;
  }, [entries]);

  return {
    entries,
    weekCount,
    loaded,
    addEntry,
    deleteEntry,
  };
}
