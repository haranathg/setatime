import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { DailyPlanTask, DailyPlanSize, PlanPhoto } from '../types';
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

// Tomorrow's local YYYY-MM-DD — the day you're planning when you write
// tonight's list.
function tomorrowKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Drop photos for days that have already ended. This is the "discard once
// the day is done" rule, and it's also what keeps the synced blob small
// enough to be safe — so it runs on load and before every save rather than
// on a timer that a backgrounded tab might never fire.
function prunePhotos(
  photos: Record<string, PlanPhoto>,
  today: string,
): Record<string, PlanPhoto> {
  const out: Record<string, PlanPhoto> = {};
  for (const [k, v] of Object.entries(photos)) {
    if (k >= today) out[k] = v;
  }
  return out;
}

export function usePlan() {
  const [days, setDays] = useState<Record<string, DailyPlanTask[]>>({});
  const [photos, setPhotos] = useState<Record<string, PlanPhoto>>({});
  // Set when a write is rejected for size; surfaced by the UI and cleared
  // on the next successful photo write.
  const [photoError, setPhotoError] = useState<string | null>(null);
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
      setPhotos(prunePhotos(local.plan?.photos || {}, todayKey()));
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
          // Photos are a single small map keyed by date; last-writer-wins
          // on the whole map is right here — merging would resurrect a
          // photo whose day has already been swept on another device.
          if (cloud.plan?.photos) {
            setPhotos(prunePhotos(cloud.plan.photos, todayKey()));
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
    const pruned = prunePhotos(photos, todayKey());
    const updated = { ...state, plan: { days, photos: pruned } };
    const ok = saveState(updated);
    if (!ok) {
      // Almost always the photo — it's the only bulky thing here. Drop it
      // and retry so the rest of the plan still persists.
      setPhotoError('Not enough storage for that photo — it was not saved.');
      setPhotos({});
      saveState({ ...state, plan: { days, photos: {} } });
      return;
    }

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
  }, [days, photos, loaded]);

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

  // ---- Plan photos ----

  const todaysPhoto = photos[todayK];
  const tomorrowsPhoto = photos[tomorrowKey()];

  // `when` is a local YYYY-MM-DD. The UI offers today and tomorrow; the
  // hook doesn't care which, so a future week view needs no change here.
  const setPhoto = useCallback((when: string, dataUrl: string) => {
    setPhotoError(null);
    setPhotos((prev) => ({ ...prev, [when]: { dataUrl, addedAt: new Date().toISOString() } }));
  }, []);

  const removePhoto = useCallback((when: string) => {
    setPhotos((prev) => {
      const out = { ...prev };
      delete out[when];
      return out;
    });
  }, []);

  const clearPhotoError = useCallback(() => setPhotoError(null), []);

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
    todaysPhoto,
    tomorrowsPhoto,
    todayKey: todayK,
    tomorrowKey: tomorrowKey(),
    setPhoto,
    removePhoto,
    photoError,
    clearPhotoError,
  };
}
