import type { LectureItem, TaskBlock, SubTask } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { passCount, kindOf, overdueDays, isGuidedDone } from '../hooks/useLectures';
import { timeToMinutes } from './timeParser';

// Turning the review queue into a day.
//
// The queue already knows what is due and in what order — spaced-repetition
// dates, sorted most-overdue-first, with an hours estimate per item. None of
// that is a judgement call, so none of it is guessed here: this module only
// decides where the sittings go and which items land in them.
//
// That is the whole difference between this and asking a chatbot for a
// timetable. A generic planner writes "Study session 1 — identify high-yield
// topics", because it does not know what is due. This writes the lecture's
// name and which pass it is on, so that at 11:30 there is nothing left to
// decide.

/** A contiguous span of the day, in minutes from midnight. */
export interface Span {
  start: number;
  end: number;
}

export interface PlannerOptions {
  /** Real watch speed, so a first pass is estimated in minutes of your life
   *  rather than minutes of media. */
  playRate?: number;
  /** Exam dates per lecture id. A lecture on Thursday's paper outranks one
   *  that is merely older, which is the better reason to do it first. */
  examDateOf?: Map<string, string>;
  /** Weekly commitments used to top the day up once the queue runs out —
   *  Qbanks, Anki, anything with no due date of its own. */
  sources?: { id: string; name: string; remaining: number; sessionMinutes?: number }[];
  /** Minutes from midnight. An end before the start means the window runs
   *  past midnight, which is normal for an evening of work. */
  windowStart: number;
  windowEnd: number;
  /** How much study to place. The planner stops early if the day cannot
   *  hold it rather than overflowing the window. */
  studyMinutes: number;
  /** Longest single sitting, and the gap left after one. */
  sessionMinutes: number;
  breakMinutes: number;
  /** Already-committed time, which the plan works around. */
  busy: Span[];
  /** Kept clear either side of an existing commitment, so a session does not
   *  begin in the same minute something else ends. */
  bufferMinutes?: number;
}

export interface PlannedItem {
  /** Qbanks and the like have no lecture behind them. */
  sourceId?: string;
  lectureId: string;
  title: string;
  course?: string;
  /** Which pass this sitting is. Guided work is done once, so it has none. */
  pass: 1 | 2 | 3 | null;
  minutes: number;
  overdueDays: number;
}

export interface PlannedSession {
  start: number;
  end: number;
  items: PlannedItem[];
}

export interface DayPlan {
  sessions: PlannedSession[];
  /** Study minutes asked for that the day could not hold. */
  unplacedMinutes: number;
  /** Queue minutes still outstanding after this day — the backlog. */
  remainingQueueMinutes: number;
  placedMinutes: number;
}

export const DEFAULTS = {
  sessionMinutes: 90,
  breakMinutes: 20,
  bufferMinutes: 10,
};

/** Free spans inside the window, once commitments are taken out. */
export function freeSpans(opts: PlannerOptions): Span[] {
  const buffer = opts.bufferMinutes ?? DEFAULTS.bufferMinutes;
  // A window ending before it starts has run past midnight; carry it so the
  // arithmetic stays linear and the caller converts back when it formats.
  const end = opts.windowEnd <= opts.windowStart ? opts.windowEnd + 1440 : opts.windowEnd;
  let spans: Span[] = [{ start: opts.windowStart, end }];

  const blocked = opts.busy
    .map((b) => ({
      start: (b.start < opts.windowStart ? b.start + 1440 : b.start) - buffer,
      end: (b.end < opts.windowStart ? b.end + 1440 : b.end) + buffer,
    }))
    .sort((a, b) => a.start - b.start);

  for (const b of blocked) {
    const next: Span[] = [];
    for (const s of spans) {
      if (b.end <= s.start || b.start >= s.end) {
        next.push(s);
        continue;
      }
      if (b.start > s.start) next.push({ start: s.start, end: b.start });
      if (b.end < s.end) next.push({ start: b.end, end: s.end });
    }
    spans = next;
  }
  return spans.filter((s) => s.end - s.start > 0);
}

/** The next pass a lecture is owed, or null for one-and-done guided work. */
export function nextPassOf(item: LectureItem): 1 | 2 | 3 | null {
  if (kindOf(item) === 'guided') return null;
  const done = passCount(item);
  return done >= 3 ? null : ((done + 1) as 1 | 2 | 3);
}

/** How long one sitting on this item should take.
 *
 *  remainingHours covers every pass still owed; a single sitting is only the
 *  next one. Splitting it here is what stops a 2-hour lecture claiming six
 *  hours of a day because it has three passes left. */
export function sittingMinutes(item: LectureItem, playRate = 1): number {
  const base = item.durationHours ?? 0;
  if (!base) return 0;
  // Only the first pass is watching; a later pass is review and is not made
  // faster by the playback speed.
  const rate = playRate > 0.25 && playRate <= 4 ? playRate : 1;
  if (kindOf(item) === 'guided') return isGuidedDone(item) ? 0 : Math.round(base * 60);
  // Derived from nextPassOf rather than counted again here: two functions
  // that each decide whether anything is left will eventually disagree, and
  // the way this one failed was to re-schedule a lecture already finished.
  const pass = nextPassOf(item);
  if (pass === null) return 0;
  // The first sitting is the full lecture; later passes are review.
  return pass === 1 ? Math.round((base * 60) / rate) : Math.round((base / 3) * 60);
}

/**
 * Lay the queue into the day.
 *
 * Sittings are carved from the free spans first, then filled from the queue
 * in its own order. Filling second is deliberate: the shape of the day is a
 * property of the day, and which lecture lands at 2pm should not change how
 * long the afternoon is.
 */
export function planDay(queue: LectureItem[], opts: PlannerOptions, now = Date.now()): DayPlan {
  const sessionMax = Math.max(15, opts.sessionMinutes);
  const breakLen = Math.max(0, opts.breakMinutes);
  const spans = freeSpans(opts);

  // 1. Carve the sittings.
  const slots: Span[] = [];
  let budget = Math.max(0, opts.studyMinutes);
  for (const span of spans) {
    let cursor = span.start;
    while (budget > 0 && span.end - cursor >= 25) {
      const len = Math.min(sessionMax, span.end - cursor, budget);
      // A stub left by a break is worse than slightly less study.
      if (len < 25) break;
      slots.push({ start: cursor, end: cursor + len });
      budget -= len;
      cursor += len + breakLen;
    }
    if (budget <= 0) break;
  }

  // 2. Fill them, queue first.
  //
  // Order: an exam you sit sooner wins, then how overdue it is. The queue
  // arrives sorted by overdue-ness already; this only re-sorts when exam
  // dates are known, because "on Thursday's paper" beats "older" and nothing
  // else the queue knows says that.
  const examOf = opts.examDateOf;
  const ordered = examOf
    ? [...queue].sort((a, b) => {
        const ea = examOf.get(a.id);
        const eb = examOf.get(b.id);
        if (ea !== eb) {
          // A lecture with no exam attached sorts after one that has a date,
          // rather than jumping the queue on an empty string.
          if (!ea) return 1;
          if (!eb) return -1;
          return ea < eb ? -1 : 1;
        }
        return 0;
      })
    : queue;

  const rate = opts.playRate ?? 1;
  const work: { kind: 'lecture'; item: LectureItem; left: number }[] = ordered
    .map((item) => ({ kind: 'lecture' as const, item, left: sittingMinutes(item, rate) }))
    .filter((x) => x.left > 0);

  // Then the standing commitments, which have no due date and so can only
  // ever be a top-up. Largest remaining first, so a source that is furthest
  // behind gets the leftover time.
  const topUps = (opts.sources ?? [])
    .filter((s) => s.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining);
  let w = 0;

  const sessions: PlannedSession[] = slots.map((slot) => {
    const items: PlannedItem[] = [];
    let at = slot.start;
    while (at < slot.end && w < work.length) {
      const room = slot.end - at;
      const take = Math.min(room, work[w].left);
      // Don't leave a scrap of a lecture at the end of a sitting; start it in
      // the next one instead.
      if (take < 15 && room < 15) break;
      const it = work[w].item;
      items.push({
        lectureId: it.id,
        title: it.title,
        course: it.course,
        pass: nextPassOf(it),
        minutes: take,
        overdueDays: overdueDays(it, now),
      });
      at += take;
      work[w].left -= take;
      if (work[w].left <= 0) w += 1;
    }
    // Whatever the queue could not fill goes to the standing sources, so an
    // empty backlog becomes Qbank time instead of an empty afternoon.
    while (at < slot.end && topUps.length > 0) {
      const room = slot.end - at;
      if (room < 15) break;
      const src = topUps[0];
      const take = Math.min(room, src.remaining, src.sessionMinutes ?? room);
      if (take < 15) { topUps.shift(); continue; }
      items.push({
        sourceId: src.id,
        lectureId: '',
        title: src.name,
        pass: null,
        minutes: take,
        overdueDays: 0,
      });
      at += take;
      src.remaining -= take;
      if (src.remaining <= 0) topUps.shift();
      else topUps.sort((a, b) => b.remaining - a.remaining);
    }
    return { start: slot.start, end: slot.end, items };
  }).filter((s) => s.items.length > 0);

  const placedMinutes = sessions.reduce((m, s) => m + s.items.reduce((n, i) => n + i.minutes, 0), 0);
  const queueTotal = work.reduce((m, x) => m + sittingMinutes(x.item, rate), 0);

  return {
    sessions,
    placedMinutes,
    unplacedMinutes: Math.max(0, opts.studyMinutes - placedMinutes),
    remainingQueueMinutes: Math.max(0, queueTotal - placedMinutes),
  };
}

const hhmm = (mins: number): string => {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** How a sitting names itself on the calendar. */
export function sessionTitle(s: PlannedSession): string {
  if (s.items.length === 0) return 'Study';
  const first = s.items[0];
  const head = first.pass ? `${first.title} · pass ${first.pass}` : first.title;
  if (s.items.length === 1) return head;
  // Name the first one even when several share the sitting. "Study · 2
  // lectures" is the generic line this whole feature exists to avoid: the
  // point of the block is that you can read it and start, and a count does
  // not tell you what to open.
  return `${head} +${s.items.length - 1}`;
}

/**
 * Real calendar blocks, not a list to retype.
 *
 * A block in this app runs from its earliest sub-task to mainTime, so the
 * sitting's end is the block's time and each item becomes a sub-task at the
 * minute it starts. That is also what makes the block a checklist of exactly
 * what to do, which was the entire point.
 */
export function planToBlocks(plan: DayPlan, dateKey: string, color: string): TaskBlock[] {
  const createdAt = new Date().toISOString();
  return plan.sessions.map((s) => {
    let at = s.start;
    const subTasks: SubTask[] = s.items.map((i) => {
      const time = hhmm(at);
      // A sitting that runs past midnight puts its later items on the next day.
      const crossesMidnight = at >= 1440;
      at += i.minutes;
      return {
        id: uuidv4(),
        time,
        label: i.pass
          ? `${i.title} — pass ${i.pass}${i.overdueDays > 0 ? ` (${i.overdueDays}d overdue)` : ''}`
          : i.title,
        completed: false,
        ...(crossesMidnight ? { date: nextDayKey(dateKey) } : {}),
      };
    });
    return {
      id: uuidv4(),
      date: dateKey,
      mainTask: sessionTitle(s),
      mainTime: hhmm(s.end),
      subTasks,
      color,
      createdAt,
      durationMinutes: s.end - s.start,
    };
  });
}

function nextDayKey(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Existing commitments for a day, as spans the planner must avoid. */
export function busyFromBlocks(blocks: TaskBlock[], dateKey: string): Span[] {
  const out: Span[] = [];
  for (const b of blocks) {
    if (b.date !== dateKey || b.isAllDay) continue;
    const end = timeToMinutes(b.mainTime);
    let start = end;
    for (const s of b.subTasks) {
      if (s.date && s.date !== dateKey) continue;
      start = Math.min(start, timeToMinutes(s.time));
    }
    out.push({ start, end: Math.max(end, start + 30) });
  }
  return out;
}

export { hhmm };
