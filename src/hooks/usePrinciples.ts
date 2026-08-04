import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { PrincipleEntry } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

// Same slice/hook shape as useNotes / useCompass / useUnderway —
// localStorage + debounced cloud sync + id-based merge.

export function usePrinciples() {
  const [entries, setEntries] = useState<PrincipleEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setEntries(local.principles?.entries || []);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.principles?.entries) {
            const merged = new Map<string, PrincipleEntry>();
            for (const e of cloud.principles.entries) merged.set(e.id, e);
            for (const e of local.principles?.entries || []) {
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
    const updated = { ...state, principles: { entries } };
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

  const addPrinciple = useCallback(
    (input: { regret?: string; value?: string; action: string }): PrincipleEntry | null => {
      const action = input.action.trim();
      if (!action) return null;
      const entry: PrincipleEntry = {
        id: uuidv4(),
        regret: input.regret?.trim() || undefined,
        value: input.value?.trim() || undefined,
        action,
        createdAt: new Date().toISOString(),
      };
      setEntries((prev) => [entry, ...prev]);
      return entry;
    },
    []
  );

  const updatePrinciple = useCallback(
    (id: string, updates: Partial<Pick<PrincipleEntry, 'regret' | 'value' | 'action'>>) => {
      setEntries((prev) =>
        prev.map((e) => {
          if (e.id !== id) return e;
          const next: PrincipleEntry = {
            ...e,
            regret: updates.regret !== undefined ? (updates.regret.trim() || undefined) : e.regret,
            value: updates.value !== undefined ? (updates.value.trim() || undefined) : e.value,
            action: updates.action !== undefined ? updates.action.trim() || e.action : e.action,
          };
          return next;
        })
      );
    },
    []
  );

  const deletePrinciple = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return {
    entries,
    loaded,
    addPrinciple,
    updatePrinciple,
    deletePrinciple,
  };
}
