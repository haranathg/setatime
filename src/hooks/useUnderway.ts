import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { UnderwaySession, UnderwayPinnedResource, StuckPreset } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

// A local day key derived from a timestamp — used to bucket sessions into
// "today" without pulling in date-fns just for this.
function localDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Rolling seven-day cutoff — anything with startedAt within the last
// 7*24h counts as "this week." Simpler than calendar-week math and it's
// what the streak chip surfaces.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// The default behavioral-activation reminder shown on the Stuck screen
// until the user writes their own. Deliberately compact — the mantra
// has to be readable in one glance when overwhelmed.
const DEFAULT_MANTRA =
  'Action precedes motivation. When stuck, start ridiculously small — 2 minutes counts.';

// The starting set of Stuck chips. Ids are fixed strings rather than
// uuids so two devices seeding independently converge on the same six
// rows instead of ending up with twelve.
export const DEFAULT_STUCK_PRESETS: StuckPreset[] = [
  { id: 'preset-just-start',  emoji: '⚡', label: 'Just start it',   task: 'just start what I was doing' },
  { id: 'preset-walk',        emoji: '🚶', label: 'Walk 2 min',      task: 'take a 2-minute walk' },
  { id: 'preset-water',       emoji: '💧', label: 'Water + stretch', task: 'drink water and stretch' },
  { id: 'preset-text',        emoji: '📩', label: 'Text one person', task: 'text one person I care about' },
  { id: 'preset-tiny-task',   emoji: '🧹', label: 'One tiny task',   task: "do one 2-minute task that's bugging me" },
  { id: 'preset-read',        emoji: '📖', label: 'Read one page',   task: 'read one page of something I care about' },
];

// Auto-pick an emoji for a pinned resource based on URL/label hints.
// Kept dumb — hosts that clearly imply a medium get a matching glyph,
// everything else falls back to a generic link icon.
export function guessResourceEmoji(url: string, label: string): string {
  const u = url.toLowerCase();
  const l = label.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be') || u.includes('vimeo.com')) return '🎥';
  if (u.endsWith('.pdf') || u.includes('.pdf?') || u.includes('.pdf#') || l.includes('pdf')) return '📄';
  if (u.includes('spotify.com') || u.includes('music.apple.com') || u.includes('soundcloud')) return '🎵';
  if (u.includes('docs.google.com')) return '📝';
  if (u.includes('notion.so') || u.includes('notion.site')) return '📓';
  if (u.includes('github.com')) return '💻';
  return '🔗';
}

export function useUnderway() {
  const [sessions, setSessions] = useState<UnderwaySession[]>([]);
  const [mantra, setMantraState] = useState<string>(DEFAULT_MANTRA);
  const [pinnedResources, setPinnedResources] = useState<UnderwayPinnedResource[]>([]);
  const [stuckPresets, setStuckPresets] = useState<StuckPreset[]>(DEFAULT_STUCK_PRESETS);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setSessions(local.underway?.sessions || []);
      if (local.underway?.mantra) setMantraState(local.underway.mantra);
      if (local.underway?.pinnedResources) setPinnedResources(local.underway.pinnedResources);
      if (local.underway?.stuckPresets) setStuckPresets(local.underway.stuckPresets);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.underway?.sessions) {
            const merged = new Map<string, UnderwaySession>();
            for (const s of cloud.underway.sessions) merged.set(s.id, s);
            for (const s of local.underway?.sessions || []) {
              if (!merged.has(s.id)) merged.set(s.id, s);
            }
            setSessions(Array.from(merged.values()));
          }
          // Cloud mantra wins over local if present — mantra is a single
          // value, no merge needed; simpler is fine.
          if (cloud.underway?.mantra) setMantraState(cloud.underway.mantra);
          // Same policy for pinned resources — small curated list, cloud
          // is the source of truth once the device has synced.
          if (cloud.underway?.pinnedResources) {
            const merged = new Map<string, UnderwayPinnedResource>();
            for (const r of cloud.underway.pinnedResources) merged.set(r.id, r);
            for (const r of local.underway?.pinnedResources || []) {
              if (!merged.has(r.id)) merged.set(r.id, r);
            }
            setPinnedResources(Array.from(merged.values()));
          }
          // Whole-list last-writer-wins rather than a union merge. A
          // union would resurrect presets deleted on another device,
          // which is precisely the edit people make most here. The list
          // is small and rarely edited, so losing a concurrent tweak is
          // the cheaper failure.
          if (cloud.underway?.stuckPresets) {
            setStuckPresets(cloud.underway.stuckPresets);
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
    const updated = { ...state, underway: { sessions, mantra, pinnedResources, stuckPresets } };
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
  }, [sessions, mantra, pinnedResources, stuckPresets, loaded]);

  // Setter for the user's BA mantra. Passing an empty string reverts to
  // the default so the surface never shows a blank card.
  const setMantra = useCallback((m: string) => {
    const trimmed = m.trim();
    setMantraState(trimmed || DEFAULT_MANTRA);
  }, []);

  // Add a pinned resource. The URL is normalized (http/https prefix added
  // if the user omitted it) and the emoji is auto-picked when not given,
  // so the Add form stays two fields.
  const addPinnedResource = useCallback((input: { label: string; url: string; emoji?: string }): UnderwayPinnedResource | null => {
    const label = input.label.trim();
    let url = input.url.trim();
    if (!label || !url) return null;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const emoji = input.emoji?.trim() || guessResourceEmoji(url, label);
    const r: UnderwayPinnedResource = { id: uuidv4(), label, url, emoji };
    setPinnedResources((prev) => [...prev, r]);
    return r;
  }, []);

  const deletePinnedResource = useCallback((id: string) => {
    setPinnedResources((prev) => prev.filter((r) => r.id !== id));
  }, []);

  // ---- Stuck presets ----

  const addStuckPreset = useCallback((input: { emoji?: string; label: string }): StuckPreset | null => {
    const label = input.label.trim();
    if (!label) return null;
    const preset: StuckPreset = {
      id: uuidv4(),
      emoji: input.emoji?.trim() || '•',
      label,
    };
    setStuckPresets((prev) => [...prev, preset]);
    return preset;
  }, []);

  // Editing a preset rewrites `task` to match the new label, so a chip
  // never silently starts a session named something else. The seeded
  // defaults keep their original phrasing until they're edited.
  const updateStuckPreset = useCallback((id: string, updates: { emoji?: string; label?: string }) => {
    setStuckPresets((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const label = updates.label?.trim() || p.label;
        return {
          ...p,
          emoji: updates.emoji?.trim() || p.emoji,
          label,
          task: label,
        };
      })
    );
  }, []);

  const deleteStuckPreset = useCallback((id: string) => {
    setStuckPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const resetStuckPresets = useCallback(() => {
    setStuckPresets(DEFAULT_STUCK_PRESETS);
  }, []);

  const addSession = useCallback(
    (input: Omit<UnderwaySession, 'id'>): UnderwaySession => {
      const s: UnderwaySession = { id: uuidv4(), ...input };
      setSessions((prev) => [s, ...prev]);
      return s;
    },
    []
  );

  const deleteSession = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Sessions started today, newest first.
  const todaysSessions = useMemo(() => {
    const today = localDateKey(new Date().toISOString());
    return sessions
      .filter((s) => localDateKey(s.startedAt) === today)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [sessions]);

  // Sessions within the last 7 days — powers the streak chip.
  const weekCount = useMemo(() => {
    const cutoff = Date.now() - WEEK_MS;
    return sessions.filter((s) => new Date(s.startedAt).getTime() >= cutoff).length;
  }, [sessions]);

  // Recent distinct task labels for the Start-now quick chips. Cap so the
  // chip row doesn't turn into a task list.
  const recentTaskLabels = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of sessions) {
      const norm = s.taskLabel.trim();
      const key = norm.toLowerCase();
      if (!norm || seen.has(key)) continue;
      seen.add(key);
      out.push(norm);
      if (out.length >= 5) break;
    }
    return out;
  }, [sessions]);

  return {
    sessions,
    todaysSessions,
    weekCount,
    recentTaskLabels,
    mantra,
    pinnedResources,
    loaded,
    addSession,
    deleteSession,
    setMantra,
    addPinnedResource,
    deletePinnedResource,
    stuckPresets,
    addStuckPreset,
    updateStuckPreset,
    deleteStuckPreset,
    resetStuckPresets,
  };
}
