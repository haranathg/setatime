import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ChartNote, Problem, PlanTask } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

export function useChartNotes() {
  const [notes, setNotes] = useState<ChartNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setNotes(local.chart?.notes || []);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.chart?.notes) {
            const merged = new Map<string, ChartNote>();
            for (const n of cloud.chart.notes) merged.set(n.id, n);
            for (const n of local.chart?.notes || []) {
              const existing = merged.get(n.id);
              if (!existing || existing.updatedAt < n.updatedAt) merged.set(n.id, n);
            }
            setNotes(Array.from(merged.values()));
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
    const updated = { ...state, chart: { notes } };
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
  }, [notes, loaded]);

  const createNote = useCallback((encounterType: ChartNote['encounterType'] = 'daily'): ChartNote => {
    const now = new Date();
    const isoDate = now.toISOString().slice(0, 10);
    const note: ChartNote = {
      id: uuidv4(),
      date: isoDate,
      encounterType,
      subjective: '',
      objective: '',
      assessment: '',
      plan: '',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    setNotes((prev) => [note, ...prev]);
    return note;
  }, []);

  const updateNote = useCallback((id: string, updates: Partial<Omit<ChartNote, 'id' | 'createdAt'>>) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n
      )
    );
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Create a new note seeded from the most recent prior note — a check-in
  // template. Carries forward unresolved problems and incomplete plan tasks
  // (fresh ids, dumpTaskId cleared). Narrative fields stay empty so the user
  // writes today's Subjective/Objective/Assessment/Plan fresh.
  const copyForwardFromLatest = useCallback((): ChartNote | null => {
    const latest = [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!latest) return null;
    const now = new Date();
    const carriedProblems: Problem[] = (latest.problems || [])
      .filter((p) => !p.resolved)
      .map((p) => ({
        id: uuidv4(),
        label: p.label,
        detail: p.detail,
        resolved: false,
        createdAt: now.toISOString(),
      }));
    const carriedTasks: PlanTask[] = (latest.planTasks || [])
      .filter((t) => !t.done)
      .map((t) => ({
        id: uuidv4(),
        text: t.text,
        done: false,
        createdAt: now.toISOString(),
      }));
    const note: ChartNote = {
      id: uuidv4(),
      date: now.toISOString().slice(0, 10),
      encounterType: latest.encounterType,
      subjective: '',
      objective: '',
      assessment: '',
      plan: '',
      problems: carriedProblems.length > 0 ? carriedProblems : undefined,
      planTasks: carriedTasks.length > 0 ? carriedTasks : undefined,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    setNotes((prev) => [note, ...prev]);
    return note;
  }, [notes]);

  return { notes, loaded, createNote, updateNote, deleteNote, copyForwardFromLatest };
}
