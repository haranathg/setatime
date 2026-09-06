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

const DAY_MS = 86_400_000;

// Expanding intervals between passes. Pass 1 is due as soon as the lecture
// has actually happened; each later pass waits longer than the last, which
// is the whole point of spacing them rather than doing three in an evening.
export const PASS_GAP_DAYS = { toSecond: 2, toThird: 7 };

/** Has this lecture actually happened yet? Nothing can be reviewed before
 *  it is delivered — which is exactly what the flat "to start" bucket used
 *  to get wrong, mixing a three-week-old backlog with next month. */
export function isDelivered(item: LectureItem, now = Date.now()): boolean {
  return new Date(item.start).getTime() <= now;
}

/** When the next pass becomes due, or null when all three are done. */
export function nextDueAt(item: LectureItem): number | null {
  const start = new Date(item.start).getTime();
  if (!item.pass1At) return start;
  if (!item.pass2At) return new Date(item.pass1At).getTime() + PASS_GAP_DAYS.toSecond * DAY_MS;
  if (!item.pass3At) return new Date(item.pass2At).getTime() + PASS_GAP_DAYS.toThird * DAY_MS;
  return null;
}

/** Whole days past due; 0 when not yet due or already complete. */
export function overdueDays(item: LectureItem, now = Date.now()): number {
  const due = nextDueAt(item);
  if (due === null || due > now) return 0;
  return Math.floor((now - due) / DAY_MS);
}

/** Local Monday that starts the week containing `iso`. */
export function weekStartKey(iso: string): string {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - dow);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface WeekBucket {
  key: string;          // Monday, YYYY-MM-DD
  items: LectureItem[];
  passesDone: number;
  passesTotal: number;  // 3 per delivered lecture
  /** Share of this week's passes still outstanding, 0..1. This is what the
   *  heatmap encodes — the deficit, not the progress, because the question
   *  being asked is "where am I behind?" and that should be the thing that
   *  darkens. Weeks with nothing delivered yet report 0 and stay quiet. */
  deficit: number;
  delivered: boolean;
}

export function useLectures() {
  const [items, setItems] = useState<LectureItem[]>([]);
  // One clock for the whole feature. Every bucket, heatmap cell and row
  // badge reads this same instant, so a row can never claim it is waiting
  // while the queue that placed it says it is due. It ticks a minute at a
  // time because nothing here is finer-grained than whole days.
  const [now, setNow] = useState(() => Date.now());
  const [lastImportedAt, setLastImportedAt] = useState<string | undefined>();
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

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
    const stamp = new Date().toISOString();

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
            importedAt: stamp,
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

    setLastImportedAt(stamp);
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

  // Time-aware buckets, all reading the shared `now` above so the queue,
  // the heatmap and each row badge agree on the same instant.
  const buckets = useMemo(() => {
    const dueNow: LectureItem[] = [];
    const resting: LectureItem[] = [];
    const upcoming: LectureItem[] = [];
    const complete: LectureItem[] = [];
    for (const i of visible) {
      if (passCount(i) === 3) { complete.push(i); continue; }
      if (!isDelivered(i, now)) { upcoming.push(i); continue; }
      const due = nextDueAt(i);
      if (due !== null && due <= now) dueNow.push(i);
      else resting.push(i);
    }
    // Most overdue first — the backlog you actually need to see.
    dueNow.sort((a, b) => (nextDueAt(a) ?? 0) - (nextDueAt(b) ?? 0));
    resting.sort((a, b) => (nextDueAt(a) ?? 0) - (nextDueAt(b) ?? 0));
    upcoming.sort((a, b) => a.start.localeCompare(b.start));
    complete.sort((a, b) => b.start.localeCompare(a.start));
    return { dueNow, resting, upcoming, complete };
  }, [visible, now]);

  const weeks = useMemo<WeekBucket[]>(() => {
    const map = new Map<string, LectureItem[]>();
    for (const i of visible) {
      const k = weekStartKey(i.start);
      const arr = map.get(k);
      if (arr) arr.push(i);
      else map.set(k, [i]);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, its]) => {
        const deliveredItems = its.filter((i) => isDelivered(i, now));
        const passesTotal = deliveredItems.length * 3;
        const passesDone = deliveredItems.reduce((n, i) => n + passCount(i), 0);
        return {
          key,
          items: its,
          passesDone,
          passesTotal,
          deficit: passesTotal === 0 ? 0 : (passesTotal - passesDone) / passesTotal,
          delivered: deliveredItems.length > 0,
        };
      });
  }, [visible, now]);

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
    return {
      untouched,
      inProgress,
      complete,
      total: visible.length,
      due: buckets.dueNow.length,
      resting: buckets.resting.length,
      upcoming: buckets.upcoming.length,
    };
  }, [visible, buckets]);

  return {
    items,
    visible,
    hiddenItems,
    buckets,
    weeks,
    stats,
    now,
    lastImportedAt,
    loaded,
    importICS,
    togglePass,
    setHidden,
    removeAll,
  };
}
