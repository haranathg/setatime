import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { LectureItem, LectureKind } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';
import { parseICS } from '../utils/icalImport';
import type { ParsedActivity } from '../utils/scheduleImport';
import { toLectureItem } from '../utils/scheduleImport';

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

/** Rows imported from the .ics predate the kind field and are all lectures. */
export function kindOf(item: LectureItem): LectureKind {
  return item.kind ?? 'lecture';
}

/** Guided work is finished, not reviewed — one flag rather than three passes. */
export function isGuidedDone(item: LectureItem): boolean {
  return !!item.doneAt;
}

/** Is this row study work at all? Assessments are deadlines, not tasks. */
export function isStudyItem(item: LectureItem): boolean {
  const k = kindOf(item);
  return k === 'lecture' || k === 'guided';
}

/** Whole hours of work an item represents, for planning a realistic evening.
 *  A lecture's later passes are review and cost less than the first sitting. */
export function remainingHours(item: LectureItem): number {
  const base = item.durationHours ?? 0;
  if (!base) return 0;
  if (kindOf(item) === 'guided') return isGuidedDone(item) ? 0 : base;
  const done = passCount(item);
  if (done >= 3) return 0;
  // Pass 1 is the full sitting; passes 2 and 3 are review at a third each.
  return (done === 0 ? base : 0) + (3 - Math.max(done, 1)) * (base / 3);
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

/** When the next thing is due, or null when there is nothing left to do.
 *
 *  Guided work answers with its real deadline. Anything else walks the
 *  spaced-repetition ladder from the moment it was delivered. */
export function nextDueAt(item: LectureItem): number | null {
  if (kindOf(item) === 'guided') {
    if (isGuidedDone(item)) return null;
    return item.dueAt ? new Date(item.dueAt).getTime() : new Date(item.start).getTime();
  }
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

  /**
   * Merge a parsed .xls schedule.
   *
   * Same ownership rule as the .ics path: the export owns title, time,
   * duration, due date and resources; the passes, the done flag and whatever
   * you have hidden are yours and survive a re-import. Rows that vanish from
   * a later export are kept rather than deleted.
   */
  const importSchedule = useCallback((activities: ParsedActivity[]): ImportSummary => {
    let added = 0;
    let updated = 0;
    let unchanged = 0;
    const stamp = new Date().toISOString();

    setItems((prev) => {
      const byId = new Map(prev.map((i) => [i.id, i]));
      for (const a of activities) {
        const fresh = toLectureItem(a, stamp);
        const existing = byId.get(a.id);
        if (!existing) {
          byId.set(a.id, fresh);
          added++;
          continue;
        }
        const changed =
          existing.title !== fresh.title ||
          existing.start !== fresh.start ||
          existing.dueAt !== fresh.dueAt ||
          existing.durationHours !== fresh.durationHours ||
          existing.resourceUrl !== fresh.resourceUrl;
        if (changed) updated++;
        else unchanged++;
        byId.set(a.id, {
          ...fresh,
          // Yours, not the feed's.
          pass1At: existing.pass1At,
          pass2At: existing.pass2At,
          pass3At: existing.pass3At,
          doneAt: existing.doneAt,
          hidden: existing.hidden,
        });
      }
      return Array.from(byId.values());
    });

    setLastImportedAt(stamp);
    return {
      added,
      updated,
      unchanged,
      skipped: 0,
      recurring: 0,
      total: activities.length,
    };
  }, []);

  /** Guided work: one flag, toggled against its deadline. */
  const toggleDone = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, doneAt: i.doneAt ? undefined : new Date().toISOString() } : i))
    );
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
      if (!isStudyItem(i)) continue;   // assessments are deadlines, not work
      const finished = kindOf(i) === 'guided' ? isGuidedDone(i) : passCount(i) === 3;
      if (finished) { complete.push(i); continue; }
      // Guided work can be due before it is "delivered" — the deadline is the
      // deadline — so it is never parked in Upcoming on delivery grounds.
      if (kindOf(i) !== 'guided' && !isDelivered(i, now)) { upcoming.push(i); continue; }
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
      if (!isStudyItem(i)) continue;
      const k = weekStartKey(i.start);
      const arr = map.get(k);
      if (arr) arr.push(i);
      else map.set(k, [i]);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, its]) => {
        // A lecture is three units of work; a guided item is one. Counting
        // them on the same scale keeps the strip a single honest "what is
        // still outstanding" number rather than two measures in one row.
        const deliveredItems = its.filter((i) => isStudyItem(i) && isDelivered(i, now));
        const unitsFor = (i: LectureItem) => (kindOf(i) === 'guided' ? 1 : 3);
        const doneFor = (i: LectureItem) =>
          kindOf(i) === 'guided' ? (isGuidedDone(i) ? 1 : 0) : passCount(i);
        const passesTotal = deliveredItems.reduce((n, i) => n + unitsFor(i), 0);
        const passesDone = deliveredItems.reduce((n, i) => n + doneFor(i), 0);
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

  /** Dated assessments, soonest first — the deadlines that actually drive
   *  what is worth studying next. */
  const assessments = useMemo(
    () =>
      items
        .filter((i) => kindOf(i) === 'assessment')
        .sort((a, b) => a.start.localeCompare(b.start)),
    [items]
  );

  /** The next assessment still ahead of us, with everything scheduled
   *  between now and it — "what is on the next exam, and am I behind on it". */
  const nextAssessment = useMemo(() => {
    const next = assessments.find((a) => new Date(a.start).getTime() > now);
    if (!next) return null;
    const cutoff = new Date(next.start).getTime();

    // The window opens at the PREVIOUS assessment in the same course, not at
    // the start of term. Counting everything ever scheduled produces a number
    // that is both wrong — the previous exam already examined most of it —
    // and far too large to act on, which is the failure this card exists to
    // prevent in the first place.
    const prior = assessments
      .filter((a) => a.course === next.course && new Date(a.start).getTime() < cutoff)
      .pop();
    const since = prior ? new Date(prior.start).getTime() : 0;

    const covered = visible.filter((i) => {
      if (!isStudyItem(i)) return false;
      if (next.course && i.course !== next.course) return false;
      const t = new Date(i.start).getTime();
      return t > since && t <= cutoff;
    });
    const outstanding = covered.filter((i) =>
      kindOf(i) === 'guided' ? !isGuidedDone(i) : passCount(i) < 3
    );
    return {
      item: next,
      /** The assessment this window opens after, if any — shown so the
       *  scope of the count is legible rather than implied. */
      since: prior ? prior.title : null,
      sinceAt: prior ? new Date(prior.start).getTime() : null,
      daysAway: Math.max(0, Math.ceil((cutoff - now) / DAY_MS)),
      covered: covered.length,
      outstanding: outstanding.length,
      hours: outstanding.reduce((h, i) => h + remainingHours(i), 0),
    };
  }, [assessments, visible, now]);

  const courses = useMemo(
    () => Array.from(new Set(visible.map((i) => i.course).filter(Boolean))) as string[],
    [visible]
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
    return {
      untouched,
      inProgress,
      complete,
      total: visible.length,
      due: buckets.dueNow.length,
      resting: buckets.resting.length,
      upcoming: buckets.upcoming.length,
      // Hours, so the backlog is something you can plan an evening against
      // rather than a count that could mean two hours or two weekends.
      dueHours: buckets.dueNow.reduce((h, i) => h + remainingHours(i), 0),
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
    assessments,
    nextAssessment,
    courses,
    importICS,
    importSchedule,
    toggleDone,
    togglePass,
    setHidden,
    removeAll,
  };
}
