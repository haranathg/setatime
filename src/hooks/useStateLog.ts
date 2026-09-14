import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { StateLogEntry, StateFeeling, RegulationZone } from '../types';
import { effectiveZone } from '../types';
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

  const normalizeReasons = (reasons: string[]) =>
    reasons
      .map((r) => r.trim().toLowerCase())
      .filter((r) => r.length > 0)
      .filter((r, i, arr) => arr.indexOf(r) === i);

  // Add an entry on the window-of-tolerance axis. Older entries keep whatever
  // legacy shape they were written with; read paths go through effectiveZone.
  const addEntry = useCallback(
    (input: { zone: RegulationZone; reasons: string[]; note?: string }): StateLogEntry => {
      const entry: StateLogEntry = {
        id: uuidv4(),
        loggedAt: new Date().toISOString(),
        zone: input.zone,
        reasons: normalizeReasons(input.reasons),
        note: input.note?.trim() || undefined,
      };
      setEntries((prev) => [entry, ...prev]);
      return entry;
    },
    []
  );

  // Legacy path — kept so any surface still emitting the 3-bucket feeling
  // (Horizon's contemplation prompt) doesn't need to change. 'off' is mapped
  // to hypo rather than hyper: the old vocabulary described flatness, not
  // activation, so reading it as activation would be inventing data.
  const addEntryLegacy = useCallback(
    (feeling: StateFeeling, reasons: string[], note?: string): StateLogEntry => {
      const zone: RegulationZone = feeling === 'off' ? 'hypo' : 'window';
      const entry: StateLogEntry = {
        id: uuidv4(),
        loggedAt: new Date().toISOString(),
        zone,
        reasons: normalizeReasons(reasons),
        note: note?.trim() || undefined,
      };
      setEntries((prev) => [entry, ...prev]);
      return entry;
    },
    []
  );

  /** Record that a reset was tapped from a given entry. Stored by label so
   *  the record survives the activity being renamed or deleted later. */
  const markResetUsed = useCallback((id: string, label: string) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, resetsUsed: e.resetsUsed?.includes(label) ? e.resetsUsed : [...(e.resetsUsed ?? []), label] }
          : e
      )
    );
  }, []);

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

  // How often each reset has actually been tapped, and from which zone. This
  // is the loop the library exists for: over time it shows which of your own
  // moves you really reach for, rather than which ones sounded good.
  const resetUsage = useMemo(() => {
    const counts = new Map<string, { total: number; hyper: number; hypo: number }>();
    for (const e of entries) {
      if (!e.resetsUsed?.length) continue;
      const z = effectiveZone(e);
      for (const label of e.resetsUsed) {
        const cur = counts.get(label) ?? { total: 0, hyper: 0, hypo: 0 };
        cur.total += 1;
        if (z === 'hyper') cur.hyper += 1;
        else if (z === 'hypo') cur.hypo += 1;
        counts.set(label, cur);
      }
    }
    return counts;
  }, [entries]);

  return {
    entries,
    todaysEntries,
    recentReasons,
    resetUsage,
    loaded,
    addEntry,
    addEntryLegacy,
    updateEntry,
    deleteEntry,
    markResetUsed,
  };
}
