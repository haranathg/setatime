import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Habit, HabitLogEntry } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

// Local calendar day, "YYYY-MM-DD". ISO date strings sort lexicographically,
// so plain string compares are valid for ordering log entries.
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayKey(): string {
  return dayKey(new Date());
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

export interface HabitStatus {
  doneToday: boolean;
  lastDoneDate: string | null;
  currentStreak: number; // consecutive days, still "alive" through today
  returns: number; // times a vote followed a gap of a missed day or more
}

// Derived, never persisted — votes is the durable evidence number; streaks and
// returns are recomputed from the append-only log so a miss can never subtract.
export function habitStatus(h: Habit): HabitStatus {
  const dates = Array.from(new Set(h.log.map((e) => e.date))).sort();
  const today = todayKey();
  const last = dates.length ? dates[dates.length - 1] : null;
  const doneToday = last === today;

  let returns = 0;
  for (let i = 1; i < dates.length; i++) {
    if (daysBetween(dates[i - 1], dates[i]) > 1) returns++;
  }

  let currentStreak = 0;
  if (dates.length) {
    // Streak stays alive through the rest of today if yesterday was done.
    const anchorGap = daysBetween(last as string, today);
    if (anchorGap <= 1) {
      currentStreak = 1;
      for (let i = dates.length - 1; i > 0; i--) {
        if (daysBetween(dates[i - 1], dates[i]) === 1) currentStreak++;
        else break;
      }
    }
  }

  return { doneToday, lastDoneDate: last, currentStreak, returns };
}

export interface VoteResult {
  votes: number; // the evidence number after this vote
  isReturn: boolean; // coming back after a missed day or more
  alreadyToday: boolean; // already voted today — no double count
}

// Pure: what casting a vote right now would mean for this habit. Used by the
// Focus card for its affirmation, and by recordVote for the actual mutation,
// so the message and the stored state can never disagree.
export function previewVote(h: Habit): VoteResult {
  const today = todayKey();
  if (h.log.some((e) => e.date === today)) {
    return { votes: h.votes, isReturn: false, alreadyToday: true };
  }
  const dates = Array.from(new Set(h.log.map((e) => e.date))).sort();
  const last = dates.length ? dates[dates.length - 1] : null;
  const isReturn = last != null && daysBetween(last, today) > 1;
  return { votes: h.votes + 1, isReturn, alreadyToday: false };
}

function mergeHabits(cloud: Habit[], local: Habit[]): Habit[] {
  // Cloud wins for editable content (name/reason/steps), following the same
  // convention as the brain-dump slice. But votes and the log are the evidence
  // the whole feature exists to protect, so we never let a sync lose them:
  // votes = max across sources, log = union by date.
  const byId = new Map<string, Habit>();
  for (const h of cloud) byId.set(h.id, h);
  for (const h of local) {
    if (!byId.has(h.id)) byId.set(h.id, h);
  }
  for (const h of local) {
    const c = byId.get(h.id);
    if (!c || c === h) continue;
    const logByDate = new Map<string, HabitLogEntry>();
    for (const e of c.log) logByDate.set(e.date, e);
    for (const e of h.log) if (!logByDate.has(e.date)) logByDate.set(e.date, e);
    const log = Array.from(logByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    const uniqueDays = new Set(log.map((e) => e.date)).size;
    byId.set(h.id, {
      ...c,
      log,
      votes: Math.max(c.votes, h.votes, uniqueDays),
    });
  }
  return Array.from(byId.values());
}

export function useHabits() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setHabits(local.habits?.habits || []);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.habits?.habits) {
            setHabits(mergeHabits(cloud.habits.habits, local.habits?.habits || []));
          }
        } catch {
          // sync errors surfaced by useAppState
        }
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const state = loadState();
    const updated = { ...state, habits: { habits } };
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
  }, [habits, loaded]);

  const createHabit = useCallback(
    (input: { name: string; reason: string; activationStep: string; microSteps: string[] }): Habit => {
      const habit: Habit = {
        id: uuidv4(),
        name: input.name.trim(),
        reason: input.reason.trim(),
        activationStep: input.activationStep.trim(),
        microSteps: input.microSteps.map((s) => s.trim()).filter(Boolean),
        votes: 0,
        log: [],
        createdAt: new Date().toISOString(),
      };
      setHabits((prev) => [habit, ...prev]);
      return habit;
    },
    []
  );

  // Planning-mode edits only. votes and log are intentionally not editable here
  // so the evidence number stays monotonic and tamper-resistant.
  const updateHabit = useCallback(
    (
      id: string,
      updates: Partial<Pick<Habit, 'name' | 'reason' | 'activationStep' | 'microSteps' | 'archived'>>
    ) => {
      setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, ...updates } : h)));
    },
    []
  );

  // Doing-mode action. One vote per local day max — keeps the streak/return
  // math honest and the evidence count equal to days-shown-up.
  const recordVote = useCallback((id: string) => {
    const today = todayKey();
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== id) return h;
        if (h.log.some((e) => e.date === today)) return h;
        return {
          ...h,
          votes: h.votes + 1,
          log: [...h.log, { date: today, at: new Date().toISOString() }],
        };
      })
    );
  }, []);

  const archiveHabit = useCallback((id: string) => {
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, archived: true } : h)));
  }, []);

  const unarchiveHabit = useCallback((id: string) => {
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, archived: false } : h)));
  }, []);

  const deleteHabit = useCallback((id: string) => {
    setHabits((prev) => prev.filter((h) => h.id !== id));
  }, []);

  return {
    habits,
    loaded,
    createHabit,
    updateHabit,
    recordVote,
    archiveHabit,
    unarchiveHabit,
    deleteHabit,
  };
}
