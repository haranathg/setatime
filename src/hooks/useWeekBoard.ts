import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { WeekBoardItem } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Drop timestamps older than this get pruned on save so the list can't
// grow forever. We only display the trailing 7-day count anyway.
const DROPS_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

export function useWeekBoard() {
  const [items, setItems] = useState<WeekBoardItem[]>([]);
  const [drops, setDrops] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setItems(local.weekBoard?.items || []);
      setDrops(local.weekBoard?.drops || []);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.weekBoard) {
            if (cloud.weekBoard.items) {
              const merged = new Map<string, WeekBoardItem>();
              for (const i of cloud.weekBoard.items) merged.set(i.id, i);
              for (const i of local.weekBoard?.items || []) {
                if (!merged.has(i.id)) merged.set(i.id, i);
              }
              setItems(Array.from(merged.values()));
            }
            if (cloud.weekBoard.drops) {
              // Union of both drop lists; dedupe by timestamp string.
              const set = new Set<string>([
                ...(local.weekBoard?.drops || []),
                ...cloud.weekBoard.drops,
              ]);
              setDrops(Array.from(set));
            }
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
    // Prune drops older than DROPS_KEEP_MS before persisting.
    const cutoff = Date.now() - DROPS_KEEP_MS;
    const prunedDrops = drops.filter((iso) => new Date(iso).getTime() >= cutoff);

    const state = loadState();
    const updated = { ...state, weekBoard: { items, drops: prunedDrops } };
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
  }, [items, drops, loaded]);

  const addItem = useCallback((label: string): WeekBoardItem | null => {
    const clean = label.trim();
    if (!clean) return null;
    const item: WeekBoardItem = {
      id: uuidv4(),
      label: clean,
      addedAt: new Date().toISOString(),
    };
    setItems((prev) => [...prev, item]);
    return item;
  }, []);

  // Remove without counting as a drop (used when promoting to plan).
  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // Explicit drop — increments the "protected capacity" counter. The
  // caller doesn't need to also call removeItem.
  const dropItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setDrops((prev) => [...prev, new Date().toISOString()]);
  }, []);

  // Trailing 7-day drop count — the number surfaced on the header
  // as the "dropped this week" positive stat.
  const dropsThisWeek = useMemo(() => {
    const cutoff = Date.now() - WEEK_MS;
    return drops.filter((iso) => new Date(iso).getTime() >= cutoff).length;
  }, [drops]);

  return {
    items,
    dropsThisWeek,
    loaded,
    addItem,
    removeItem,
    dropItem,
  };
}
