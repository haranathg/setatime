import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { StateLogEntry, StateFeeling } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

// The number of recent reason-tags to surface as autocomplete chips under
// the "Because…" input. Bumped high enough to feel useful, low enough to
// stay legible.
const RECENT_TAG_LIMIT = 12;

function localDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function useStateLog() {
  const [entries, setEntries] = useState<StateLogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setEntries(local.stateLog?.entries || []);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.stateLog?.entries) {
            const merged = new Map<string, StateLogEntry>();
            for (const e of cloud.stateLog.entries) merged.set(e.id, e);
            for (const e of local.stateLog?.entries || []) {
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
    const updated = { ...state, stateLog: { entries } };
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

  const addEntry = useCallback(
    (feeling: StateFeeling, reasons: string[], note?: string): StateLogEntry => {
      const normalized = reasons
        .map((r) => r.trim().toLowerCase())
        .filter((r) => r.length > 0)
        // Dedupe within this entry so ["run", "run"] doesn't double-weight later.
        .filter((r, i, arr) => arr.indexOf(r) === i);
      const entry: StateLogEntry = {
        id: uuidv4(),
        loggedAt: new Date().toISOString(),
        feeling,
        reasons: normalized,
        note: note?.trim() || undefined,
      };
      setEntries((prev) => [entry, ...prev]);
      return entry;
    },
    []
  );

  const updateEntry = useCallback(
    (id: string, patch: Partial<Omit<StateLogEntry, 'id' | 'loggedAt'>>) => {
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    },
    []
  );

  const deleteEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // Today's entries, newest first — used by the TodayView strip's compact
  // "already logged today" view.
  const todaysEntries = useMemo(() => {
    const today = localDateKey(new Date().toISOString());
    return entries
      .filter((e) => localDateKey(e.loggedAt) === today)
      .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  }, [entries]);

  // Recent unique reason tags across all entries, most-recently-used first.
  // Surfaced as autocomplete chips so the user re-uses their own vocabulary
  // (which is what makes correlations meaningful later).
  const recentReasons = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const e of entries) {
      for (const r of e.reasons) {
        if (seen.has(r)) continue;
        seen.add(r);
        out.push(r);
        if (out.length >= RECENT_TAG_LIMIT) return out;
      }
    }
    return out;
  }, [entries]);

  return {
    entries,
    todaysEntries,
    recentReasons,
    loaded,
    addEntry,
    updateEntry,
    deleteEntry,
  };
}
