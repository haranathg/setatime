import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { UnderwaySession } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

// A local day key derived from a timestamp — used to bucket sessions into
// "today" without pulling in date-fns just for this.
function localDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Rolling seven-day cutoff — anything with startedAt within the last
// 7*24h counts as "this week." Simpler than calendar-week math and it's
// what the streak chip surfaces.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function useUnderway() {
  const [sessions, setSessions] = useState<UnderwaySession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setSessions(local.underway?.sessions || []);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.underway?.sessions) {
            const merged = new Map<string, UnderwaySession>();
            for (const s of cloud.underway.sessions) merged.set(s.id, s);
            for (const s of local.underway?.sessions || []) {
              if (!merged.has(s.id)) merged.set(s.id, s);
            }
            setSessions(Array.from(merged.values()));
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
    const updated = { ...state, underway: { sessions } };
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
  }, [sessions, loaded]);

  const addSession = useCallback(
    (input: Omit<UnderwaySession, 'id'>): UnderwaySession => {
      const s: UnderwaySession = { id: uuidv4(), ...input };
      setSessions((prev) => [s, ...prev]);
      return s;
    },
    []
  );

  const deleteSession = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Sessions started today, newest first.
  const todaysSessions = useMemo(() => {
    const today = localDateKey(new Date().toISOString());
    return sessions
      .filter((s) => localDateKey(s.startedAt) === today)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [sessions]);

  // Sessions within the last 7 days — powers the streak chip.
  const weekCount = useMemo(() => {
    const cutoff = Date.now() - WEEK_MS;
    return sessions.filter((s) => new Date(s.startedAt).getTime() >= cutoff).length;
  }, [sessions]);

  // Recent distinct task labels for the Start-now quick chips. Cap so the
  // chip row doesn't turn into a task list.
  const recentTaskLabels = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of sessions) {
      const norm = s.taskLabel.trim();
      const key = norm.toLowerCase();
      if (!norm || seen.has(key)) continue;
      seen.add(key);
      out.push(norm);
      if (out.length >= 5) break;
    }
    return out;
  }, [sessions]);

  return {
    sessions,
    todaysSessions,
    weekCount,
    recentTaskLabels,
    loaded,
    addSession,
    deleteSession,
  };
}
