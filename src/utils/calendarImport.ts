// Turning a subscribed calendar into blocks you can plan around.
//
// The parser in `icalImport` stops at the VEVENT: a weekly class arrives as
// one event plus a rule. This expands that rule into the individual
// sessions, because a planner that cannot see next Tuesday's lecture will
// happily schedule study on top of it.
//
// Expansion needs a window. A rule like "every Monday, forever" has no last
// occurrence, so the caller says how far to look and this fills it.

import type { ParsedEvent } from './icalImport';
import type { TaskBlock } from '../types';
import { formatDateKey } from './dateHelpers';

export interface Occurrence {
  /** The series this belongs to. Shared by every session of a class. */
  uid: string;
  /** Stable per-session identity, so a re-import updates in place rather
   *  than stacking a second copy of every lecture. */
  key: string;
  title: string;
  start: string;   // ISO
  end?: string;    // ISO
  allDay: boolean;
  location?: string;
  /** True when this session came from expanding a rule rather than from a
   *  VEVENT of its own. Only used for reporting. */
  fromRule: boolean;
}

export interface ExpandOptions {
  from: Date;
  to: Date;
  /** Safety valve. A malformed rule can otherwise generate forever. */
  cap?: number;
}

const DEFAULT_CAP = 5000;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

interface Rule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  count?: number;
  until?: Date;
  byDay: { ord: number; dow: number }[];
  byMonthDay: number[];
  byMonth: number[];
  wkst: number;
}

/** "FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261218T050000Z" → a Rule, or null. */
export function parseRRule(raw: string): Rule | null {
  const parts: Record<string, string> = {};
  for (const piece of raw.split(';')) {
    const eq = piece.indexOf('=');
    if (eq === -1) continue;
    parts[piece.slice(0, eq).trim().toUpperCase()] = piece.slice(eq + 1).trim();
  }

  const freq = (parts.FREQ || '').toUpperCase();
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') {
    return null;
  }

  // BYDAY entries may carry an ordinal: "2TU" is the second Tuesday,
  // "-1FR" the last Friday.
  const byDay: { ord: number; dow: number }[] = [];
  for (const token of (parts.BYDAY || '').split(',')) {
    const m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(token.trim().toUpperCase());
    if (!m) continue;
    byDay.push({ ord: m[1] ? parseInt(m[1], 10) : 0, dow: WEEKDAYS.indexOf(m[2]) });
  }

  const nums = (v: string | undefined): number[] =>
    (v || '')
      .split(',')
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => Number.isFinite(n) && n !== 0);

  let until: Date | undefined;
  if (parts.UNTIL) {
    const u = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(parts.UNTIL.trim());
    if (u) {
      const [, y, mo, d, h, mi, s, z] = u;
      until = z
        ? new Date(Date.UTC(+y, +mo - 1, +d, +(h || 0), +(mi || 0), +(s || 0)))
        : new Date(+y, +mo - 1, +d, +(h || 23), +(mi || 59), +(s || 59));
    }
  }

  const count = parts.COUNT ? parseInt(parts.COUNT, 10) : undefined;
  const interval = parts.INTERVAL ? Math.max(1, parseInt(parts.INTERVAL, 10) || 1) : 1;

  return {
    freq,
    interval,
    count: Number.isFinite(count) && (count as number) > 0 ? count : undefined,
    until,
    byDay,
    byMonthDay: nums(parts.BYMONTHDAY),
    byMonth: nums(parts.BYMONTH),
    wkst: WEEKDAYS.indexOf((parts.WKST || 'MO').toUpperCase()) === -1
      ? 1
      : WEEKDAYS.indexOf((parts.WKST || 'MO').toUpperCase()),
  };
}

/** Same wall-clock time, a different date. Keeping the clock time rather
 *  than adding 24h of milliseconds is what makes a 9am class stay 9am
 *  across a daylight-saving change. */
function atTimeOf(day: Date, time: Date): Date {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    time.getHours(),
    time.getMinutes(),
    time.getSeconds(),
    0
  );
}

/** nth weekday of a month; ord < 0 counts back from the end. */
function nthWeekdayOf(year: number, month: number, dow: number, ord: number): Date | null {
  if (ord > 0) {
    const first = new Date(year, month, 1);
    const shift = (dow - first.getDay() + 7) % 7;
    const day = 1 + shift + (ord - 1) * 7;
    const d = new Date(year, month, day);
    return d.getMonth() === month ? d : null;
  }
  const last = new Date(year, month + 1, 0);
  const shift = (last.getDay() - dow + 7) % 7;
  const day = last.getDate() - shift + (ord + 1) * 7;
  const d = new Date(year, month, day);
  return d.getMonth() === month && day >= 1 ? d : null;
}

/** Candidate start times for one rule, in order, from DTSTART onward.
 *  COUNT is applied here (it limits what the rule produces); EXDATE is
 *  applied by the caller, since RFC 5545 removes those afterwards. */
function ruleStarts(dtstart: Date, rule: Rule, horizon: Date, cap: number): Date[] {
  const out: Date[] = [];
  const limit = rule.count ?? Infinity;
  let guard = 0;

  const push = (d: Date): boolean => {
    if (d.getTime() < dtstart.getTime()) return true;
    if (rule.until && d.getTime() > rule.until.getTime()) return false;
    if (rule.byMonth.length && !rule.byMonth.includes(d.getMonth() + 1)) return true;
    out.push(d);
    return out.length < limit;
  };

  if (rule.freq === 'DAILY') {
    const cursor = new Date(dtstart);
    while (out.length < limit && guard++ < cap) {
      if (cursor.getTime() > horizon.getTime() && out.length > 0) break;
      if (guard > cap) break;
      const allowed =
        rule.byDay.length === 0 || rule.byDay.some((b) => b.dow === cursor.getDay());
      if (allowed && !push(new Date(cursor))) break;
      cursor.setDate(cursor.getDate() + rule.interval);
      if (cursor.getTime() > horizon.getTime() && out.length === 0) break;
    }
    return out;
  }

  if (rule.freq === 'WEEKLY') {
    const days = rule.byDay.length ? rule.byDay.map((b) => b.dow) : [dtstart.getDay()];
    // Anchor on the week containing DTSTART, per WKST, so INTERVAL>1
    // skips whole weeks rather than drifting.
    const anchor = new Date(dtstart);
    anchor.setDate(anchor.getDate() - ((anchor.getDay() - rule.wkst + 7) % 7));
    const week = new Date(anchor);
    while (out.length < limit && guard++ < cap) {
      let any = false;
      for (const dow of [...days].sort((a, b) => a - b)) {
        const d = new Date(week);
        d.setDate(d.getDate() + ((dow - rule.wkst + 7) % 7));
        const at = atTimeOf(d, dtstart);
        if (at.getTime() < dtstart.getTime()) continue;
        any = true;
        if (!push(at)) return out;
      }
      week.setDate(week.getDate() + 7 * rule.interval);
      if (week.getTime() > horizon.getTime() && (any || out.length > 0)) break;
      if (week.getTime() > horizon.getTime() + 366 * 86400000) break;
    }
    return out;
  }

  // MONTHLY / YEARLY
  const stepMonths = rule.freq === 'MONTHLY' ? rule.interval : rule.interval * 12;
  const cursor = new Date(dtstart.getFullYear(), dtstart.getMonth(), 1);
  while (out.length < limit && guard++ < cap) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const candidates: Date[] = [];

    if (rule.byDay.some((b) => b.ord !== 0)) {
      for (const b of rule.byDay) {
        const d = nthWeekdayOf(y, m, b.dow, b.ord || 1);
        if (d) candidates.push(d);
      }
    } else if (rule.byMonthDay.length) {
      for (const md of rule.byMonthDay) {
        const lastDay = new Date(y, m + 1, 0).getDate();
        const day = md > 0 ? md : lastDay + md + 1;
        if (day >= 1 && day <= lastDay) candidates.push(new Date(y, m, day));
      }
    } else if (rule.byDay.length) {
      for (const b of rule.byDay) {
        for (let day = 1; day <= new Date(y, m + 1, 0).getDate(); day++) {
          const d = new Date(y, m, day);
          if (d.getDay() === b.dow) candidates.push(d);
        }
      }
    } else {
      const lastDay = new Date(y, m + 1, 0).getDate();
      // A rule on the 31st simply has no occurrence in a 30-day month.
      if (dtstart.getDate() <= lastDay) candidates.push(new Date(y, m, dtstart.getDate()));
    }

    candidates.sort((a, b) => a.getTime() - b.getTime());
    for (const c of candidates) {
      if (!push(atTimeOf(c, dtstart))) return out;
    }

    cursor.setMonth(cursor.getMonth() + stepMonths);
    if (cursor.getTime() > horizon.getTime()) break;
  }

  return out;
}

/**
 * Expand a parsed calendar into individual sessions inside a window.
 *
 * Overrides are applied last: a single moved or renamed session arrives as
 * its own VEVENT carrying RECURRENCE-ID, and must replace the instance the
 * rule generated rather than appear alongside it — otherwise a rescheduled
 * lecture shows up twice, at both the old time and the new one.
 */
export function expandOccurrences(
  events: ParsedEvent[],
  opts: ExpandOptions
): { occurrences: Occurrence[]; notes: string[] } {
  const cap = opts.cap ?? DEFAULT_CAP;
  const notes: string[] = [];
  const from = opts.from.getTime();
  const to = opts.to.getTime();

  const masters = events.filter((e) => !e.recurrenceId);
  const overrides = events.filter((e) => e.recurrenceId);

  const byKey = new Map<string, Occurrence>();

  const lengthOf = (e: ParsedEvent): number | undefined =>
    e.durationMinutes && e.durationMinutes > 0 ? e.durationMinutes : undefined;

  for (const ev of masters) {
    // A "free" hold is not a commitment and must not block planning.
    if (ev.transparent) continue;

    const dtstart = new Date(ev.start);
    if (Number.isNaN(dtstart.getTime())) continue;
    const mins = lengthOf(ev);

    const emit = (start: Date, fromRule: boolean) => {
      if (start.getTime() < from || start.getTime() > to) return;
      const key = fromRule ? `${ev.uid}@${start.toISOString()}` : ev.uid;
      const end = mins ? new Date(start.getTime() + mins * 60000) : undefined;
      byKey.set(key, {
        uid: ev.uid,
        key,
        title: ev.title,
        start: start.toISOString(),
        end: end?.toISOString(),
        allDay: ev.allDay,
        location: ev.location,
        fromRule,
      });
    };

    if (!ev.rrule) {
      emit(dtstart, false);
      continue;
    }

    const rule = parseRRule(ev.rrule);
    if (!rule) {
      notes.push(`Could not read the repeat rule for "${ev.title}" — imported once.`);
      emit(dtstart, false);
      continue;
    }

    const excluded = new Set((ev.exDates ?? []).map((d) => new Date(d).getTime()));
    const starts = ruleStarts(dtstart, rule, new Date(to), cap);
    if (starts.length >= cap) {
      notes.push(`"${ev.title}" repeats more often than the window allows; truncated.`);
    }
    for (const s of starts) {
      if (excluded.has(s.getTime())) continue;
      emit(s, true);
    }
  }

  for (const ov of overrides) {
    const origin = new Date(ov.recurrenceId as string);
    if (Number.isNaN(origin.getTime())) continue;
    // Drop whatever the rule produced for that slot, wherever it landed.
    byKey.delete(`${ov.uid}@${origin.toISOString()}`);
    if (ov.transparent) continue;

    const start = new Date(ov.start);
    if (Number.isNaN(start.getTime())) continue;
    if (start.getTime() < from || start.getTime() > to) continue;
    const mins = lengthOf(ov);
    const key = `${ov.uid}@${origin.toISOString()}`;
    byKey.set(key, {
      uid: ov.uid,
      key,
      title: ov.title,
      start: start.toISOString(),
      end: mins ? new Date(start.getTime() + mins * 60000).toISOString() : undefined,
      allDay: ov.allDay,
      location: ov.location,
      fromRule: true,
    });
  }

  const occurrences = Array.from(byKey.values()).sort((a, b) => a.start.localeCompare(b.start));
  return { occurrences, notes };
}

const pad = (n: number): string => String(n).padStart(2, '0');
const hhmmOf = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * An occurrence as a calendar block.
 *
 * A block's `mainTime` is its END and its start comes from the earliest
 * sub-task or its duration, so a commitment carries `durationMinutes` and
 * no sub-tasks — nothing to tick off, because attending is not a checklist.
 *
 * Events that run past midnight are clamped to 23:59 on their start day.
 * The alternative is a block whose end is before its start, which renders
 * as a 30-minute stub at the wrong end of the day.
 */
export function toBlocks(
  occurrences: Occurrence[],
  source: { id: string; name: string; color: string }
): TaskBlock[] {
  const blocks: TaskBlock[] = [];
  for (const occ of occurrences) {
    const start = new Date(occ.start);
    const dateKey = formatDateKey(start);
    const stamp = occ.start;

    if (occ.allDay) {
      blocks.push({
        id: `cal:${source.id}:${occ.key}`,
        date: dateKey,
        mainTask: occ.title,
        mainTime: '00:00',
        subTasks: [],
        color: source.color,
        createdAt: stamp,
        isAllDay: true,
        calendar: { sourceId: source.id, uid: occ.uid, key: occ.key },
      });
      continue;
    }

    const rawEnd = occ.end ? new Date(occ.end) : new Date(start.getTime() + 30 * 60000);
    const sameDay = formatDateKey(rawEnd) === dateKey;
    const endMins = sameDay
      ? rawEnd.getHours() * 60 + rawEnd.getMinutes()
      : 23 * 60 + 59;
    const startMins = start.getHours() * 60 + start.getMinutes();
    const duration = Math.max(5, endMins - startMins);

    blocks.push({
      id: `cal:${source.id}:${occ.key}`,
      date: dateKey,
      mainTask: occ.title,
      mainTime: sameDay ? hhmmOf(rawEnd) : '23:59',
      subTasks: [],
      color: source.color,
      createdAt: stamp,
      durationMinutes: duration,
      calendar: { sourceId: source.id, uid: occ.uid, key: occ.key },
    });
  }
  return blocks;
}

export interface MergeResult {
  blocks: TaskBlock[];
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
}

/**
 * Fold an import into the existing blocks.
 *
 * Only blocks belonging to this source and falling inside the imported
 * window are candidates for removal, so an event that was cancelled
 * disappears while everything you created by hand, every other calendar,
 * and anything outside the window is left alone.
 */
export function mergeCalendarBlocks(
  existing: TaskBlock[],
  incoming: TaskBlock[],
  sourceId: string,
  window: { fromKey: string; toKey: string }
): MergeResult {
  const incomingById = new Map(incoming.map((b) => [b.id, b]));
  const out: TaskBlock[] = [];
  let added = 0;
  let updated = 0;
  let removed = 0;
  let unchanged = 0;

  for (const b of existing) {
    const mine = b.calendar?.sourceId === sourceId;
    if (!mine) {
      out.push(b);
      continue;
    }
    const inWindow = b.date >= window.fromKey && b.date <= window.toKey;
    const next = incomingById.get(b.id);
    if (next) {
      const changed =
        b.mainTask !== next.mainTask ||
        b.mainTime !== next.mainTime ||
        b.date !== next.date ||
        b.durationMinutes !== next.durationMinutes ||
        !!b.isAllDay !== !!next.isAllDay;
      if (changed) updated++;
      else unchanged++;
      // Keep the colour the user may have changed on this block.
      out.push({ ...next, color: b.color });
      incomingById.delete(b.id);
      continue;
    }
    if (inWindow) {
      removed++;
      continue;
    }
    out.push(b);
  }

  for (const b of incomingById.values()) {
    out.push(b);
    added++;
  }

  return { blocks: out, added, updated, removed, unchanged };
}
