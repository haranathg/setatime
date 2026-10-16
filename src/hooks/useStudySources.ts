import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { StudySource } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

/** Monday-based ISO-ish week key, so a week's progress survives the weekend
 *  the way a study week actually runs. */
export function weekKeyOf(d = new Date()): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  // getDay(): 0 is Sunday, which belongs to the week that just ended.
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export const DEFAULT_SOURCES: Omit<StudySource, 'id'>[] = [
  { name: 'Qbank', minutesPerWeek: 300, sessionMinutes: 60, active: true },
  { name: 'Anki', minutesPerWeek: 210, sessionMinutes: 30, active: true },
];

export function useStudySources() {
  const [sources, setSources] = useState<StudySource[]>([]);
  const [done, setDone] = useState<Record<string, Record<string, number>>>({});
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setSources(local.studySources?.sources || []);
      setDone(local.studySources?.done || {});
      setLoaded(true);
      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.studySources?.sources) setSources(cloud.studySources.sources);
          if (cloud.studySources?.done) setDone(cloud.studySources.done);
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
    const updated = { ...state, studySources: { sources, done } };
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
  }, [sources, done, loaded]);

  const addSource = useCallback((s: Omit<StudySource, 'id'>) => {
    setSources((prev) => [...prev, { ...s, id: uuidv4() }]);
  }, []);

  const updateSource = useCallback((id: string, patch: Partial<Omit<StudySource, 'id'>>) => {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const removeSource = useCallback((id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const seedDefaults = useCallback(() => {
    setSources((prev) => (prev.length ? prev : DEFAULT_SOURCES.map((s) => ({ ...s, id: uuidv4() }))));
  }, []);

  /** Log time against a source for the week it happened in. */
  const logMinutes = useCallback((id: string, minutes: number, when = new Date()) => {
    const wk = weekKeyOf(when);
    setDone((prev) => ({
      ...prev,
      [wk]: { ...(prev[wk] ?? {}), [id]: Math.max(0, (prev[wk]?.[id] ?? 0) + minutes) },
    }));
  }, []);

  /** Minutes still owed this week, per source. */
  const remainingThisWeek = useCallback(
    (when = new Date()): { source: StudySource; remaining: number }[] => {
      const wk = done[weekKeyOf(when)] ?? {};
      return sources
        .filter((s) => s.active)
        .map((s) => ({ source: s, remaining: Math.max(0, s.minutesPerWeek - (wk[s.id] ?? 0)) }));
    },
    [sources, done]
  );

  return {
    sources, done, loaded,
    addSource, updateSource, removeSource, seedDefaults,
    logMinutes, remainingThisWeek, weekKey: weekKeyOf(),
  };
}
