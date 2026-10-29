import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { CalendarSource } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';
import { BLOCK_COLORS_RAW } from '../constants';

// A record of the calendars you have imported.
//
// Kept separately from the blocks themselves so a re-import can tell its own
// blocks from everything else, and so removing a calendar can take its
// sessions with it without touching anything you put on the grid yourself.

/** The calendar's own block palette, in order. Drawn from it rather than
 *  invented so an imported block is painted by the same rules as every
 *  other block, in both light and dark. The swatch you pick in the import
 *  sheet is therefore the colour you actually get. */
export const SOURCE_COLORS = BLOCK_COLORS_RAW;

export function useCalendarSources() {
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setSources(local.calendarSources?.sources || []);
      setLoaded(true);
      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.calendarSources?.sources) setSources(cloud.calendarSources.sources);
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
    const updated = { ...state, calendarSources: { sources } };
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
  }, [sources, loaded]);

  /** Match an incoming file to a calendar already imported, so dragging in
   *  this month's export updates last month's rather than doubling it. */
  const findByName = useCallback(
    (name: string) => sources.find((s) => s.name.toLowerCase() === name.toLowerCase()),
    [sources]
  );

  const upsert = useCallback(
    (name: string, patch: Partial<CalendarSource>): CalendarSource => {
      const existing = sources.find((s) => s.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        const next = { ...existing, ...patch };
        setSources((prev) => prev.map((s) => (s.id === existing.id ? next : s)));
        return next;
      }
      const made: CalendarSource = {
        id: uuidv4(),
        name,
        color: SOURCE_COLORS[sources.length % SOURCE_COLORS.length],
        ...patch,
      };
      setSources((prev) => [...prev, made]);
      return made;
    },
    [sources]
  );

  const remove = useCallback((id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const setColor = useCallback((id: string, color: string) => {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, color } : s)));
  }, []);

  return { sources, loaded, findByName, upsert, remove, setColor };
}
