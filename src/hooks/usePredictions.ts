import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { PredictionEntry, PredictionMode, PredictionEmotion } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface NewEntryInput {
  mode: PredictionMode;
  situation: string;
  prediction: string;
  confidence: number;
  emotions: PredictionEmotion[];
  emotionIntensity: number;
  firstMove: string;
  // Deep-mode optionals
  evidenceFor?: string;
  evidenceAgainst?: string;
  behavioralPull?: string;
  oneYearProjection?: string;
  valuesAction?: string;
  experiment?: string;
  experimentWhenWhere?: string;
  // Optional override; defaults to 24h after createdAt
  reflectionDueAt?: string;
}

export interface ReflectionInput {
  outcome: string;
  predictionAccurate: PredictionEntry['predictionAccurate'];
  shouldHaveBeenConfidence?: number;
  surprise?: number;
  insight?: string;
  trustFuturePredictionsMore?: PredictionEntry['trustFuturePredictionsMore'];
}

export function usePredictions() {
  const [entries, setEntries] = useState<PredictionEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setEntries(local.predictions?.entries || []);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.predictions?.entries) {
            const merged = new Map<string, PredictionEntry>();
            for (const e of cloud.predictions.entries) merged.set(e.id, e);
            for (const e of local.predictions?.entries || []) {
              const existing = merged.get(e.id);
              if (!existing || existing.updatedAt < e.updatedAt) merged.set(e.id, e);
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
    const updated = { ...state, predictions: { entries } };
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

  const addEntry = useCallback((input: NewEntryInput): PredictionEntry => {
    const now = new Date();
    const due = input.reflectionDueAt ?? new Date(now.getTime() + ONE_DAY_MS).toISOString();
    const entry: PredictionEntry = {
      id: uuidv4(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      mode: input.mode,
      situation: input.situation,
      prediction: input.prediction,
      confidence: clamp01_100(input.confidence),
      emotions: input.emotions,
      emotionIntensity: clamp01_100(input.emotionIntensity),
      firstMove: input.firstMove,
      evidenceFor: input.evidenceFor,
      evidenceAgainst: input.evidenceAgainst,
      behavioralPull: input.behavioralPull,
      oneYearProjection: input.oneYearProjection,
      valuesAction: input.valuesAction,
      experiment: input.experiment,
      experimentWhenWhere: input.experimentWhenWhere,
      reflectionDueAt: due,
    };
    setEntries((prev) => [entry, ...prev]);
    return entry;
  }, []);

  const updateEntry = useCallback(
    (id: string, patch: Partial<Omit<PredictionEntry, 'id' | 'createdAt'>>) => {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e
        )
      );
    },
    []
  );

  const recordReflection = useCallback((id: string, input: ReflectionInput) => {
    const now = new Date().toISOString();
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              ...input,
              shouldHaveBeenConfidence:
                input.shouldHaveBeenConfidence === undefined
                  ? undefined
                  : clamp01_100(input.shouldHaveBeenConfidence),
              surprise:
                input.surprise === undefined ? undefined : clamp01_100(input.surprise),
              reflectedAt: now,
              updatedAt: now,
            }
          : e
      )
    );
  }, []);

  const deleteEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // Derived stats for the dashboard. Memoize so PredictionLabView can read
  // them without recomputing on every render.
  const stats = useMemo(() => {
    const total = entries.length;
    const reflected = entries.filter((e) => !!e.reflectedAt);
    const tested = reflected.length;
    const inaccurate = reflected.filter((e) => e.predictionAccurate === 'no').length;
    const partial = reflected.filter((e) => e.predictionAccurate === 'partly').length;
    const accurate = reflected.filter((e) => e.predictionAccurate === 'yes').length;
    const inaccuratePct = tested === 0 ? 0 : Math.round((inaccurate / tested) * 100);
    const partialPct = tested === 0 ? 0 : Math.round((partial / tested) * 100);
    const accuratePct = tested === 0 ? 0 : Math.round((accurate / tested) * 100);

    const emotionCounts = new Map<PredictionEmotion, number>();
    for (const e of entries) {
      for (const em of e.emotions) emotionCounts.set(em, (emotionCounts.get(em) || 0) + 1);
    }
    const topEmotions = [...emotionCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5);

    return {
      total,
      tested,
      inaccuratePct,
      partialPct,
      accuratePct,
      topEmotions,
    };
  }, [entries]);

  // Entries whose reflection is due and not yet recorded. Sorted oldest-due
  // first so the most overdue surface first.
  const overdueReflections = useMemo(() => {
    const now = new Date().toISOString();
    return entries
      .filter((e) => !e.reflectedAt && e.reflectionDueAt <= now)
      .sort((a, b) => a.reflectionDueAt.localeCompare(b.reflectionDueAt));
  }, [entries]);

  return {
    entries,
    loaded,
    addEntry,
    updateEntry,
    recordReflection,
    deleteEntry,
    stats,
    overdueReflections,
  };
}

function clamp01_100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}
