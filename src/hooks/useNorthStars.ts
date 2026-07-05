import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { NorthStar, Target, TargetStatus } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

// Cap active stars at 3. Research on goal pursuit (Locke, Gollwitzer, Baumeister)
// converges on 1-3 concurrent goals — more, and follow-through dilutes.
export const MAX_ACTIVE_STARS = 3;
// Same principle one rung down. Three concrete measurable targets per star
// is enough to be real (multiple angles under one anchor) and few enough to
// stay in view.
export const MAX_ACTIVE_TARGETS_PER_STAR = 3;

// A small, cohesive palette. Cool + warm mix so three active stars are
// visually distinguishable without shouting.
export const STAR_COLORS: { id: string; label: string; hex: string; ring: string; bg: string; text: string }[] = [
  { id: 'indigo', label: 'Indigo', hex: '#6366f1', ring: 'ring-indigo-400', bg: 'bg-indigo-50', text: 'text-indigo-700' },
  { id: 'emerald', label: 'Emerald', hex: '#10b981', ring: 'ring-emerald-400', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  { id: 'rose', label: 'Rose', hex: '#f43f5e', ring: 'ring-rose-400', bg: 'bg-rose-50', text: 'text-rose-700' },
  { id: 'amber', label: 'Amber', hex: '#f59e0b', ring: 'ring-amber-400', bg: 'bg-amber-50', text: 'text-amber-700' },
  { id: 'sky', label: 'Sky', hex: '#0ea5e9', ring: 'ring-sky-400', bg: 'bg-sky-50', text: 'text-sky-700' },
  { id: 'violet', label: 'Violet', hex: '#8b5cf6', ring: 'ring-violet-400', bg: 'bg-violet-50', text: 'text-violet-700' },
];

export function colorFor(colorId: string) {
  return STAR_COLORS.find((c) => c.id === colorId) ?? STAR_COLORS[0];
}

export interface NewStarInput {
  name: string;
  why?: string;
  direction?: string;
  color?: string; // defaults to next unused palette color
}

export function useNorthStars() {
  const [stars, setStars] = useState<NorthStar[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setStars(local.northStars?.stars || []);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.northStars?.stars) {
            const merged = new Map<string, NorthStar>();
            for (const s of cloud.northStars.stars) merged.set(s.id, s);
            for (const s of local.northStars?.stars || []) {
              const existing = merged.get(s.id);
              if (!existing || existing.updatedAt < s.updatedAt) merged.set(s.id, s);
            }
            setStars(Array.from(merged.values()));
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
    const updated = { ...state, northStars: { stars } };
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
  }, [stars, loaded]);

  const active = stars.filter((s) => !s.archivedAt);

  const addStar = useCallback(
    (input: NewStarInput): NorthStar | null => {
      // Enforce the 3-active cap. Archived stars don't count.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const currentActive = stars.filter((s) => !s.archivedAt);
      if (currentActive.length >= MAX_ACTIVE_STARS) return null;
      const usedColors = new Set(currentActive.map((s) => s.color));
      const nextColor = input.color ?? (STAR_COLORS.find((c) => !usedColors.has(c.id))?.id ?? STAR_COLORS[0].id);
      const now = new Date().toISOString();
      const star: NorthStar = {
        id: uuidv4(),
        name: input.name.trim(),
        why: input.why?.trim() || undefined,
        direction: input.direction?.trim() || undefined,
        color: nextColor,
        createdAt: now,
        updatedAt: now,
      };
      setStars((prev) => [...prev, star]);
      return star;
    },
    [stars]
  );

  const updateStar = useCallback(
    (id: string, patch: Partial<Omit<NorthStar, 'id' | 'createdAt'>>) => {
      setStars((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s))
      );
    },
    []
  );

  const archiveStar = useCallback((id: string) => {
    setStars((prev) =>
      prev.map((s) => (s.id === id ? { ...s, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : s))
    );
  }, []);

  const unarchiveStar = useCallback((id: string) => {
    setStars((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const { archivedAt: _archivedAt, ...rest } = s;
        return { ...rest, updatedAt: new Date().toISOString() };
      })
    );
  }, []);

  const deleteStar = useCallback((id: string) => {
    setStars((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // ---------- Target CRUD ----------

  const addTarget = useCallback(
    (starId: string, title: string): Target | null => {
      const trimmed = title.trim();
      if (!trimmed) return null;
      let created: Target | null = null;
      setStars((prev) =>
        prev.map((s) => {
          if (s.id !== starId) return s;
          const targets = s.targets ?? [];
          const activeCount = targets.filter((t) => t.status === 'active').length;
          if (activeCount >= MAX_ACTIVE_TARGETS_PER_STAR) return s;
          const now = new Date().toISOString();
          const target: Target = {
            id: uuidv4(),
            title: trimmed,
            status: 'active',
            createdAt: now,
            updatedAt: now,
          };
          created = target;
          return { ...s, targets: [...targets, target], updatedAt: now };
        })
      );
      return created;
    },
    []
  );

  const updateTarget = useCallback(
    (starId: string, targetId: string, patch: Partial<Omit<Target, 'id' | 'createdAt'>>) => {
      const now = new Date().toISOString();
      setStars((prev) =>
        prev.map((s) => {
          if (s.id !== starId) return s;
          const targets = (s.targets ?? []).map((t) =>
            t.id === targetId ? { ...t, ...patch, updatedAt: now } : t
          );
          return { ...s, targets, updatedAt: now };
        })
      );
    },
    []
  );

  const setTargetStatus = useCallback(
    (starId: string, targetId: string, status: TargetStatus) => {
      const now = new Date().toISOString();
      setStars((prev) =>
        prev.map((s) => {
          if (s.id !== starId) return s;
          const targets = (s.targets ?? []).map((t) => {
            if (t.id !== targetId) return t;
            if (status === 'achieved') {
              return { ...t, status, achievedAt: now, updatedAt: now };
            }
            // Reactivating drops any prior achievedAt so accidental completions
            // don't linger as ghost timestamps.
            if (status === 'active') {
              const { achievedAt: _achievedAt, ...rest } = t;
              return { ...rest, status, updatedAt: now };
            }
            return { ...t, status, updatedAt: now };
          });
          return { ...s, targets, updatedAt: now };
        })
      );
    },
    []
  );

  const deleteTarget = useCallback((starId: string, targetId: string) => {
    const now = new Date().toISOString();
    setStars((prev) =>
      prev.map((s) => {
        if (s.id !== starId) return s;
        const targets = (s.targets ?? []).filter((t) => t.id !== targetId);
        return { ...s, targets, updatedAt: now };
      })
    );
  }, []);

  const setNextStep = useCallback(
    (starId: string, targetId: string, text: string) => {
      updateTarget(starId, targetId, { nextStep: text.trim() || undefined });
    },
    [updateTarget]
  );

  return {
    stars,
    active,
    loaded,
    addStar,
    updateStar,
    archiveStar,
    unarchiveStar,
    deleteStar,
    addTarget,
    updateTarget,
    setTargetStatus,
    deleteTarget,
    setNextStep,
  };
}
