import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Thought, ThoughtStatus } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

export function useInbox() {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setThoughts(local.inbox?.thoughts || []);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.inbox?.thoughts) {
            const merged = new Map<string, Thought>();
            for (const t of cloud.inbox.thoughts) merged.set(t.id, t);
            for (const t of local.inbox?.thoughts || []) {
              const existing = merged.get(t.id);
              // local wins if it's been triaged more recently than cloud
              const localStamp = t.triagedAt || t.capturedAt;
              const existingStamp = existing ? (existing.triagedAt || existing.capturedAt) : '';
              if (!existing || existingStamp < localStamp) merged.set(t.id, t);
            }
            setThoughts(Array.from(merged.values()));
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
    const updated = { ...state, inbox: { thoughts } };
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
  }, [thoughts, loaded]);

  const captureThought = useCallback((text: string): Thought | null => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const thought: Thought = {
      id: uuidv4(),
      text: trimmed,
      capturedAt: new Date().toISOString(),
      status: 'inbox',
    };
    setThoughts((prev) => [thought, ...prev]);
    return thought;
  }, []);

  const triageThought = useCallback(
    (id: string, status: ThoughtStatus, futureSurfaceDate?: string) => {
      setThoughts((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                status,
                triagedAt: new Date().toISOString(),
                futureSurfaceDate: status === 'future' ? futureSurfaceDate : undefined,
              }
            : t
        )
      );
    },
    []
  );

  const updateThought = useCallback(
    (id: string, updates: Partial<Pick<Thought, 'text' | 'tags' | 'promotedToTaskId' | 'futureSurfaceDate'>>) => {
      setThoughts((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    },
    []
  );

  const deleteThought = useCallback((id: string) => {
    setThoughts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return {
    thoughts,
    loaded,
    captureThought,
    triageThought,
    updateThought,
    deleteThought,
  };
}
