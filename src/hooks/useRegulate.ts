import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ResetActivity, ResetDirection } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

// Seeded starting points, not prescriptions. They exist so the library is
// never an empty page at the exact moment you are least able to invent one,
// and every field is editable.
//
// The down-regulating set leans on the mechanisms that are actually physical
// rather than cognitive — a long exhale, cold on the face, pushing against
// something — because when you are activated, "think differently about it" is
// the instruction you cannot follow. The up-regulating set leans on input:
// sound, movement, temperature, another person.
export const DEFAULT_RESETS: ResetActivity[] = [
  // hyper → window
  { id: 'reset-exhale', emoji: '🌬', label: 'Long exhale ×5', direction: 'down', how: 'Out for longer than in. Count 4 in, 8 out.', minutes: 2 },
  { id: 'reset-cold',   emoji: '💧', label: 'Cold water on face', direction: 'down', how: 'Wrists and face. Cold on the face especially.', minutes: 1 },
  { id: 'reset-walk',   emoji: '🚶', label: 'Walk, no phone', direction: 'down', how: 'Leave it on the desk. Round the block is enough.', minutes: 5 },
  { id: 'reset-push',   emoji: '🤲', label: 'Push the wall', direction: 'down', how: 'Push hard for 10 seconds, ×3. Gives the activation somewhere to go.', minutes: 2 },
  { id: 'reset-dump',   emoji: '📝', label: 'Dump it on paper', direction: 'down', how: 'Unedited, no order. You are emptying, not organising.', minutes: 5 },
  // hypo → window
  { id: 'reset-music',  emoji: '🎵', label: 'One loud song', direction: 'up', how: 'One you know. Loud enough to feel it.', minutes: 4 },
  { id: 'reset-move',   emoji: '🧍', label: 'Stand up and move', direction: 'up', how: 'Anything that is not sitting. Stairs count.', minutes: 2 },
  { id: 'reset-light',  emoji: '☀️', label: 'Outside, bright light', direction: 'up', how: 'Daylight on your face, even briefly.', minutes: 5 },
  { id: 'reset-person', emoji: '📞', label: 'Text one person', direction: 'up', how: 'Anyone. The point is contact, not the content.', minutes: 2 },
  { id: 'reset-sharp',  emoji: '🍋', label: 'Something sharp', direction: 'up', how: 'Cold drink, mint, sour. Sensory input that is hard to ignore.', minutes: 1 },
];

export function useRegulate() {
  const [activities, setActivities] = useState<ResetActivity[]>(DEFAULT_RESETS);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      if (local.regulate?.activities) setActivities(local.regulate.activities);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          // Whole-list last-writer-wins, matching stuckPresets. A union by id
          // would resurrect activities deleted on another device, which on an
          // editable library reads as the app refusing to forget.
          if (cloud.regulate?.activities) setActivities(cloud.regulate.activities);
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
    const updated = { ...state, regulate: { activities } };
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
  }, [activities, loaded]);

  const addActivity = useCallback(
    (input: { emoji: string; label: string; direction: ResetDirection; how?: string; minutes?: number }) => {
      setActivities((prev) => [
        ...prev,
        {
          id: uuidv4(),
          emoji: input.emoji.trim() || '•',
          label: input.label.trim(),
          direction: input.direction,
          how: input.how?.trim() || undefined,
          minutes: input.minutes,
        },
      ]);
    },
    []
  );

  const updateActivity = useCallback((id: string, patch: Partial<Omit<ResetActivity, 'id'>>) => {
    setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }, []);

  const deleteActivity = useCallback((id: string) => {
    setActivities((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const resetToDefaults = useCallback(() => {
    setActivities(DEFAULT_RESETS);
  }, []);

  const down = useMemo(() => activities.filter((a) => a.direction === 'down'), [activities]);
  const up = useMemo(() => activities.filter((a) => a.direction === 'up'), [activities]);

  /** The activities that move you toward the window from a given zone.
   *  Returns [] for 'window' — nothing to correct when you are already in it. */
  const forZone = useCallback(
    (zone: 'hyper' | 'window' | 'hypo'): ResetActivity[] =>
      zone === 'hyper' ? down : zone === 'hypo' ? up : [],
    [down, up]
  );

  return {
    activities,
    down,
    up,
    forZone,
    loaded,
    addActivity,
    updateActivity,
    deleteActivity,
    resetToDefaults,
  };
}
