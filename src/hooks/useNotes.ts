import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { NoteEntry } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

// Free-form notes / reflections. Same persistence + cloud-sync shape
// as the other slice hooks. Kept intentionally minimal — the whole
// value proposition is "no friction, just capture."

export function useNotes() {
  const [entries, setEntries] = useState<NoteEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setEntries(local.notes?.entries || []);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.notes?.entries) {
            const merged = new Map<string, NoteEntry>();
            for (const n of cloud.notes.entries) merged.set(n.id, n);
            for (const n of local.notes?.entries || []) {
              if (!merged.has(n.id)) merged.set(n.id, n);
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
    const updated = { ...state, notes: { entries } };
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

  const addNote = useCallback((text: string): NoteEntry | null => {
    const clean = text.trim();
    if (!clean) return null;
    const entry: NoteEntry = {
      id: uuidv4(),
      text: clean,
      createdAt: new Date().toISOString(),
    };
    setEntries((prev) => [entry, ...prev]);
    return entry;
  }, []);

  const deleteNote = useCallback((id: string) => {
    setEntries((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const updateNote = useCallback((id: string, text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setEntries((prev) => prev.map((n) => (n.id === id ? { ...n, text: clean } : n)));
  }, []);

  return {
    entries,
    loaded,
    addNote,
    deleteNote,
    updateNote,
  };
}
