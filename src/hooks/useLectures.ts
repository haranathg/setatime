import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { LectureItem } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';
import { parseICS } from '../utils/icalImport';

export type PassNumber = 1 | 2 | 3;

export interface ImportSummary {
  added: number;
  updated: number;
  unchanged: number;
  skipped: number;
  recurring: number;
  total: number;
}

const PASS_FIELD: Record<PassNumber, 'pass1At' | 'pass2At' | 'pass3At'> = {
  1: 'pass1At',
  2: 'pass2At',
  3: 'pass3At',
};

export function passCount(item: LectureItem): number {
  return (item.pass1At ? 1 : 0) + (item.pass2At ? 1 : 0) + (item.pass3At ? 1 : 0);
}

export function useLectures() {
  const [items, setItems] = useState<LectureItem[]>([]);
  const [lastImportedAt, setLastImportedAt] = useState<string | undefined>();
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setItems(local.lectures?.items || []);
      setLastImportedAt(local.lectures?.lastImportedAt);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.lectures?.items) {
            // Union by id, preferring whichever side has more passes
            // recorded. Ticking a pass on the laptop and another on the
            // phone before either syncs should keep both, not let the
            // later writer erase the earlier one.
            const merged = new Map<string, LectureItem>();
            for (const i of local.lectures?.items || []) merged.set(i.id, i);
            for (const c of cloud.lectures.items) {
              const mine = merged.get(c.id);
              if (!mine) {
                merged.set(c.id, c);
                continue;
              }
              merged.set(c.id, {
                ...c,
                pass1At: mine.pass1At || c.pass1At,
                pass2At: mine.pass2At || c.pass2At,
                pass3At: mine.pass3At || c.pass3At,
                hidden: mine.hidden || c.hidden,
              });
            }
            setItems(Array.from(merged.values()));
          }
          if (cloud.lectures?.lastImportedAt) setLastImportedAt(cloud.lectures.lastImportedAt);
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
    const updated = { ...state, lectures: { items, lastImportedAt } };
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
  }, [items, lastImportedAt, loaded]);

  /**
   * Merge an .ics file into the list.
   *
   * The feed owns title/time/location; you own the pass checkmarks and
   * whether a row is hidden. Events that vanish from a later export are
   * kept rather than deleted — a reshuffled schedule shouldn't silently
   * throw away a record of study you actually did.
   */
  const importICS = useCallback((text: string): ImportSummary => {
    const { events, skipped } = parseICS(text);
    let added = 0;
    let updated = 0;
    let unchanged = 0;
    const now = new Date().toISOString();

    setItems((prev) => {
      const byId = new Map(prev.map((i) => [i.id, i]));
      for (const ev of events) {
        const existing = byId.get(ev.uid);
        if (!existing) {
          byId.set(ev.uid, {
            id: ev.uid,
            title: ev.title,
            start: ev.start,
            end: ev.end,
            location: ev.location,
            allDay: ev.allDay || undefined,
            recurring: ev.recurring || undefined,
            importedAt: now,
          });
          added++;
          continue;
        }
        const changed =
          existing.title !== ev.title ||
          existing.start !== ev.start ||
          existing.end !== ev.end ||
          existing.location !== ev.location;
        if (changed) updated++;
        else unchanged++;
        byId.set(ev.uid, {
          ...existing,
          title: ev.title,
          start: ev.start,
          end: ev.end,
          location: ev.location,
          allDay: ev.allDay || undefined,
          recurring: ev.recurring || undefined,
        });
      }
      return Array.from(byId.values());
    });

    setLastImportedAt(now);
    return {
      added,
      updated,
      unchanged,
      skipped: skipped.length,
      recurring: events.filter((e) => e.recurring).length,
      total: events.length,
    };
  }, []);

  const togglePass = useCallback((id: string, pass: PassNumber) => {
    const field = PASS_FIELD[pass];
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, [field]: i[field] ? undefined : new Date().toISOString() } : i
      )
    );
  }, []);

  const setHidden = useCallback((id: string, hidden: boolean) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, hidden: hidden || undefined } : i)));
  }, []);

  const removeAll = useCallback(() => {
    setItems([]);
    setLastImportedAt(undefined);
  }, []);

  const visible = useMemo(
    () => [...items].filter((i) => !i.hidden).sort((a, b) => a.start.localeCompare(b.start)),
    [items]
  );
  const hiddenItems = useMemo(
    () => [...items].filter((i) => i.hidden).sort((a, b) => a.start.localeCompare(b.start)),
    [items]
  );

  const stats = useMemo(() => {
    let untouched = 0;
    let inProgress = 0;
    let complete = 0;
    for (const i of visible) {
      const n = passCount(i);
      if (n === 0) untouched++;
      else if (n < 3) inProgress++;
      else complete++;
    }
    return { untouched, inProgress, complete, total: visible.length };
  }, [visible]);

  return {
    items,
    visible,
    hiddenItems,
    stats,
    lastImportedAt,
    loaded,
    importICS,
    togglePass,
    setHidden,
    removeAll,
  };
}
