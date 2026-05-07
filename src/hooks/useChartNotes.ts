import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ChartNote } from '../types';
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

  return { notes, loaded, createNote, updateNote, deleteNote };
}
