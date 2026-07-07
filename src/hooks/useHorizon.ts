import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { HorizonEra, HorizonState } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

// Reasonable + optimistic default. Avoids the "you've already burned through
// your good years" feeling in mid-life without being unrealistic. User-editable
// in the Horizon settings gear.
const DEFAULT_LIFESPAN = 90;

// Small nautical palette for era colors. Kept intentionally short — the point
// is to distinguish 3-6 concurrent-ish eras, not to have infinite variety.
export const ERA_COLORS: {
  id: string;
  label: string;
  hex: string;
  bg: string;
  text: string;
  ring: string;
}[] = [
  { id: 'indigo', label: 'Indigo', hex: '#6366f1', bg: 'bg-indigo-100', text: 'text-indigo-700', ring: 'ring-indigo-400' },
  { id: 'sky', label: 'Sky', hex: '#0ea5e9', bg: 'bg-sky-100', text: 'text-sky-700', ring: 'ring-sky-400' },
  { id: 'emerald', label: 'Emerald', hex: '#10b981', bg: 'bg-emerald-100', text: 'text-emerald-700', ring: 'ring-emerald-400' },
  { id: 'amber', label: 'Amber', hex: '#f59e0b', bg: 'bg-amber-100', text: 'text-amber-700', ring: 'ring-amber-400' },
  { id: 'rose', label: 'Rose', hex: '#f43f5e', bg: 'bg-rose-100', text: 'text-rose-700', ring: 'ring-rose-400' },
  { id: 'violet', label: 'Violet', hex: '#8b5cf6', bg: 'bg-violet-100', text: 'text-violet-700', ring: 'ring-violet-400' },
];

export function colorFor(colorId: string) {
  return ERA_COLORS.find((c) => c.id === colorId) ?? ERA_COLORS[0];
}

export interface NewEraInput {
  name: string;
  color?: string;              // defaults to next unused palette color
  startDate: string;           // "YYYY-MM-DD"
  endDate?: string;
  isEstimated?: boolean;
  description?: string;
}

export function useHorizon() {
  const [state, setState] = useState<HorizonState>({
    birthDate: undefined,
    lifespanYears: DEFAULT_LIFESPAN,
    eras: [],
  });
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      const seed: HorizonState = local.horizon
        ? {
            birthDate: local.horizon.birthDate,
            lifespanYears: local.horizon.lifespanYears ?? DEFAULT_LIFESPAN,
            eras: local.horizon.eras ?? [],
          }
        : { birthDate: undefined, lifespanYears: DEFAULT_LIFESPAN, eras: [] };
      setState(seed);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.horizon) {
            // Cloud wins on settings (birthDate, lifespan). Era list: union by id.
            const merged = new Map<string, HorizonEra>();
            for (const e of cloud.horizon.eras ?? []) merged.set(e.id, e);
            for (const e of seed.eras) {
              const existing = merged.get(e.id);
              if (!existing || existing.updatedAt < e.updatedAt) merged.set(e.id, e);
            }
            setState({
              birthDate: cloud.horizon.birthDate ?? seed.birthDate,
              lifespanYears: cloud.horizon.lifespanYears ?? seed.lifespanYears,
              eras: Array.from(merged.values()),
            });
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
    const local = loadState();
    const updated = { ...local, horizon: state };
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
  }, [state, loaded]);

  const setBirthDate = useCallback((birthDate: string | undefined) => {
    setState((prev) => ({ ...prev, birthDate }));
  }, []);

  const setLifespan = useCallback((years: number) => {
    const clamped = Math.max(30, Math.min(120, Math.round(years)));
    setState((prev) => ({ ...prev, lifespanYears: clamped }));
  }, []);

  const addEra = useCallback((input: NewEraInput): HorizonEra => {
    const usedColors = new Set(state.eras.map((e) => e.color));
    const nextColor = input.color ?? (ERA_COLORS.find((c) => !usedColors.has(c.id))?.id ?? ERA_COLORS[0].id);
    const now = new Date().toISOString();
    const era: HorizonEra = {
      id: uuidv4(),
      name: input.name.trim(),
      color: nextColor,
      startDate: input.startDate,
      endDate: input.endDate,
      isEstimated: input.isEstimated,
      description: input.description?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    setState((prev) => ({ ...prev, eras: [...prev.eras, era] }));
    return era;
  }, [state.eras]);

  const updateEra = useCallback(
    (id: string, patch: Partial<Omit<HorizonEra, 'id' | 'createdAt'>>) => {
      const now = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        eras: prev.eras.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: now } : e)),
      }));
    },
    []
  );

  const deleteEra = useCallback((id: string) => {
    setState((prev) => ({ ...prev, eras: prev.eras.filter((e) => e.id !== id) }));
  }, []);

  return {
    state,
    loaded,
    setBirthDate,
    setLifespan,
    addEra,
    updateEra,
    deleteEra,
  };
}
