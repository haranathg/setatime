import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { GardenEntry, GardenCategory } from '../types';
import { getSecretKey, getAuthHashAsync, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

const AI_API_URL = import.meta.env.VITE_AI_API_URL || '/api/ai-breakdown';

// Cheap aggregate of what categories exist already, so we can send them
// to the AI as a "prefer these if they fit" hint. Shape matches what the
// Lambda expects.
type CategorySummary = { primary: string; subs: string[] };
function summarizeCategories(entries: GardenEntry[]): CategorySummary[] {
  const map = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!e.category?.primary) continue;
    const key = e.category.primary;
    if (!map.has(key)) map.set(key, new Set());
    if (e.category.sub) map.get(key)!.add(e.category.sub);
  }
  return Array.from(map.entries()).map(([primary, subs]) => ({
    primary,
    subs: Array.from(subs),
  }));
}

export function useGarden() {
  const [entries, setEntries] = useState<GardenEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref mirror so the async categorizer always sees the latest list when
  // computing existingCategories; avoids a race where multiple logs in
  // quick succession all send an empty category list.
  const entriesRef = useRef<GardenEntry[]>([]);
  useEffect(() => { entriesRef.current = entries; }, [entries]);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setEntries(local.garden?.entries || []);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.garden?.entries) {
            const merged = new Map<string, GardenEntry>();
            for (const e of cloud.garden.entries) merged.set(e.id, e);
            for (const e of local.garden?.entries || []) {
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
    const updated = { ...state, garden: { entries } };
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

  // Kick off AI categorization for an entry. On success, set the category;
  // on failure, mark the entry and capture the server's error message so
  // the UI can show it. Non-blocking.
  const categorize = useCallback(async (id: string, text: string) => {
    try {
      const authHash = await getAuthHashAsync();
      const existingCategories = summarizeCategories(entriesRef.current);
      const response = await fetch(AI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'categorize-action',
          text,
          existingCategories,
          authHash,
        }),
      });
      if (!response.ok) {
        const raw = await response.text().catch(() => '');
        let errMsg = raw;
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.error === 'string') errMsg = parsed.error;
        } catch {
          // non-JSON body; keep the raw text
        }
        throw new Error(`HTTP ${response.status}: ${(errMsg || 'AI call failed').slice(0, 400)}`);
      }
      const data = await response.json();
      if (!data.primary) throw new Error('No primary category returned');
      const category: GardenCategory = { primary: data.primary };
      if (data.sub) category.sub = data.sub;
      setEntries((prev) => prev.map((e) => (
        e.id === id
          ? { ...e, category, categorizationFailed: false, categorizationError: undefined }
          : e
      )));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Categorization failed';
      setEntries((prev) => prev.map((e) => (
        e.id === id
          ? { ...e, categorizationFailed: true, categorizationError: message }
          : e
      )));
    }
  }, []);

  const addEntry = useCallback((text: string): GardenEntry | null => {
    const clean = text.trim();
    if (!clean) return null;
    const entry: GardenEntry = {
      id: uuidv4(),
      text: clean,
      createdAt: new Date().toISOString(),
    };
    setEntries((prev) => [entry, ...prev]);
    // Kick off categorization in the background. Entry stays visible
    // as "pending" until the AI responds.
    void categorize(entry.id, clean);
    return entry;
  }, [categorize]);

  const retryCategorize = useCallback((id: string) => {
    const entry = entriesRef.current.find((e) => e.id === id);
    if (!entry) return;
    // Mark as pending again
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, categorizationFailed: false, category: undefined } : e)));
    void categorize(id, entry.text);
  }, [categorize]);

  const deleteEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // Set / change a category manually. Also allows clearing by passing
  // undefined — useful if the AI miscategorizes and the user wants to
  // let it redo.
  const setCategory = useCallback((id: string, category: GardenCategory | undefined) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, category, categorizationFailed: false } : e)));
  }, []);

  // ---------- Derived memos ----------

  // Today's entries (local day).
  const todaysEntries = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    return entries.filter((e) => {
      const ed = new Date(e.createdAt);
      return ed.getFullYear() === y && ed.getMonth() === m && ed.getDate() === d;
    });
  }, [entries]);

  // Category counts for the current year (what the user is building this
  // "year of"). Primary category → { total, subs: Map<sub, count> }.
  const yearCategoryCounts = useMemo(() => {
    const year = new Date().getFullYear();
    const counts = new Map<string, { total: number; subs: Map<string, number> }>();
    for (const e of entries) {
      if (new Date(e.createdAt).getFullYear() !== year) continue;
      if (!e.category?.primary) continue;
      if (!counts.has(e.category.primary)) {
        counts.set(e.category.primary, { total: 0, subs: new Map() });
      }
      const bucket = counts.get(e.category.primary)!;
      bucket.total++;
      if (e.category.sub) {
        bucket.subs.set(e.category.sub, (bucket.subs.get(e.category.sub) || 0) + 1);
      }
    }
    return counts;
  }, [entries]);

  const yearTotal = useMemo(() => {
    const year = new Date().getFullYear();
    return entries.filter((e) => new Date(e.createdAt).getFullYear() === year).length;
  }, [entries]);

  // Current streak: consecutive local days ending today with ≥1 entry.
  const streak = useMemo(() => {
    if (entries.length === 0) return 0;
    // Build a Set of YYYY-MM-DD strings
    const days = new Set<string>();
    for (const e of entries) {
      const d = new Date(e.createdAt);
      const y = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      const dd = d.getDate().toString().padStart(2, '0');
      days.add(`${y}-${m}-${dd}`);
    }
    const key = (d: Date) => {
      const y = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      const dd = d.getDate().toString().padStart(2, '0');
      return `${y}-${m}-${dd}`;
    };
    let count = 0;
    const cursor = new Date();
    // If today has no entry yet, the streak is yesterday's run (don't
    // penalize until the day ends).
    if (!days.has(key(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (days.has(key(cursor))) {
      count++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }, [entries]);

  // Per-day counts for the current year — for the calendar heatmap.
  // Returns a Map keyed by YYYY-MM-DD.
  const yearDayCounts = useMemo(() => {
    const year = new Date().getFullYear();
    const map = new Map<string, number>();
    for (const e of entries) {
      const d = new Date(e.createdAt);
      if (d.getFullYear() !== year) continue;
      const y = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      const dd = d.getDate().toString().padStart(2, '0');
      const key = `${y}-${m}-${dd}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [entries]);

  return {
    entries,
    todaysEntries,
    yearCategoryCounts,
    yearTotal,
    yearDayCounts,
    streak,
    loaded,
    addEntry,
    retryCategorize,
    setCategory,
    deleteEntry,
  };
}
