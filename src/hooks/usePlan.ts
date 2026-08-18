import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { DailyPlanTask, DailyPlanSize } from '../types';
import { DAILY_PLAN_CAPS } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

// Local YYYY-MM-DD for the current date. Used as the storage key so
// "today's plan" is the entry under today's key — no reset flow needed.
function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function usePlan() {
  const [days, setDays] = useState<Record<string, DailyPlanTask[]>>({});
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-derive the "today" key each render so the plan tracks midnight
  // rollovers even if the app is left open across days.
  const [todayK, setTodayK] = useState<string>(todayKey);
  useEffect(() => {
    const id = setInterval(() => {
      const k = todayKey();
      setTodayK((prev) => (prev !== k ? k : prev));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setDays(local.plan?.days || {});
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.plan?.days) {
            // Merge by day: for each day, take union of tasks by id.
            // Cloud wins on conflict — plan is small, cloud is the
            // source of truth once devices have synced.
            const merged: Record<string, DailyPlanTask[]> = { ...(local.plan?.days || {}) };
            for (const [k, cloudTasks] of Object.entries(cloud.plan.days)) {
              const localTasks = merged[k] || [];
              const map = new Map<string, DailyPlanTask>();
              for (const t of cloudTasks) map.set(t.id, t);
              for (const t of localTasks) if (!map.has(t.id)) map.set(t.id, t);
              merged[k] = Array.from(map.values());
            }
            setDays(merged);
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
    const updated = { ...state, plan: { days } };
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
  }, [days, loaded]);

  // Today's plan — sorted by size (big → medium → small) then by
  // added time within each size so the layout stays stable.
  const todaysPlan = useMemo(() => {
    const list = days[todayK] || [];
    const order: Record<DailyPlanSize, number> = { big: 0, medium: 1, small: 2 };
    return [...list].sort((a, b) => {
      const s = order[a.size] - order[b.size];
      if (s !== 0) return s;
      return a.addedAt.localeCompare(b.addedAt);
    });
  }, [days, todayK]);

  const counts = useMemo(() => {
    const total  = { big: 0, medium: 0, small: 0 };
    const doneCt = { big: 0, medium: 0, small: 0 };
    for (const t of todaysPlan) {
      total[t.size]++;
      if (t.completedAt) doneCt[t.size]++;
    }
    return { total, done: doneCt };
  }, [todaysPlan]);

  const addToPlan = useCallback((
    size: DailyPlanSize,
    label: string,
    sourceDumpId?: string,
    projectId?: string,
  ): DailyPlanTask | null => {
    const cleanLabel = label.trim();
    if (!cleanLabel) return null;
    const key = todayKey();
    const list = days[key] || [];
    const sizeCount = list.filter((t) => t.size === size).length;
    if (sizeCount >= DAILY_PLAN_CAPS[size]) return null; // cap enforcement
    const task: DailyPlanTask = {
      id: uuidv4(),
      label: cleanLabel,
      size,
      addedAt: new Date().toISOString(),
      sourceDumpId,
      projectId,
    };
    setDays((prev) => ({ ...prev, [key]: [...(prev[key] || []), task] }));
    return task;
    // days is snapshot-referenced inside; safe because setDays uses fn form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  // Update the prep fields (helpByTime / resources) on a plan task.
  // Kept narrow so callers can't accidentally overwrite core fields
  // like size or completion state.
  const updatePlanTask = useCallback((
    id: string,
    updates: Partial<Pick<DailyPlanTask, 'helpByTime' | 'resources' | 'projectId'>>,
  ) => {
    setDays((prev) => {
      const out: Record<string, DailyPlanTask[]> = { ...prev };
      for (const [k, list] of Object.entries(prev)) {
        if (list.some((t) => t.id === id)) {
          out[k] = list.map((t) => {
            if (t.id !== id) return t;
            const next: DailyPlanTask = { ...t };
            if ('helpByTime' in updates) {
              next.helpByTime = updates.helpByTime?.trim() || undefined;
            }
            if ('resources' in updates) {
              const cleaned = (updates.resources || [])
                .map((r) => r.trim())
                .filter((r) => r.length > 0);
              next.resources = cleaned.length > 0 ? cleaned : undefined;
            }
            if ('projectId' in updates) {
              next.projectId = updates.projectId || undefined;
            }
            return next;
          });
        }
      }
      return out;
    });
  }, []);

  const completeTask = useCallback((id: string) => {
    setDays((prev) => {
      const out: Record<string, DailyPlanTask[]> = { ...prev };
      for (const [k, list] of Object.entries(prev)) {
        if (list.some((t) => t.id === id)) {
          out[k] = list.map((t) =>
            t.id === id
              ? { ...t, completedAt: t.completedAt ? undefined : new Date().toISOString() }
              : t
          );
        }
      }
      return out;
    });
  }, []);

  const removeTask = useCallback((id: string) => {
    setDays((prev) => {
      const out: Record<string, DailyPlanTask[]> = {};
      for (const [k, list] of Object.entries(prev)) {
        out[k] = list.filter((t) => t.id !== id);
      }
      return out;
    });
  }, []);

  // Convenience for Underway → Wrap: mark a task as done (idempotent —
  // only writes completedAt if not already set).
  const markPlanTaskDone = useCallback((id: string) => {
    setDays((prev) => {
      const out: Record<string, DailyPlanTask[]> = { ...prev };
      for (const [k, list] of Object.entries(prev)) {
        if (list.some((t) => t.id === id && !t.completedAt)) {
          out[k] = list.map((t) =>
            t.id === id && !t.completedAt
              ? { ...t, completedAt: new Date().toISOString() }
              : t
          );
        }
      }
      return out;
    });
  }, []);

  return {
    todaysPlan,
    counts,
    loaded,
    addToPlan,
    completeTask,
    removeTask,
    markPlanTaskDone,
    updatePlanTask,
  };
}
