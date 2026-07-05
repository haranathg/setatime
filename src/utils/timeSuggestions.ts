import type { TaskBlock, SubTask } from '../types';
import { timeToMinutes, minutesToTime } from './timeParser';
import { formatTime24to12 } from './dateHelpers';

// A single suggested time slot for the TaskModal chip row. `time` is what the
// modal picks up; `label` and `sub` are display bits.
export interface TimeSuggestion {
  time: string;          // "HH:MM"
  label: string;         // primary label (e.g. "9:00")
  sub?: string;          // secondary label (e.g. "45min free")
  reason: 'now' | 'gap-start' | 'after-block' | 'end-of-day';
}

const DEFAULT_WORK_START_HOUR = 8;
const DEFAULT_WORK_END_HOUR = 22;
const NOW_BUFFER_MIN = 5;      // suggest "now" rounded up to next 5-min mark
const MIN_GAP_TO_SHOW = 20;    // don't bother suggesting slots inside < 20-min gaps
const NOW_CHIP_MAX_STALE_MIN = 15; // if "now" is > this deep past a work-hour boundary, hide

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Rough block-end minute. If the block has subtasks, use the latest subtask
// time + 15 min tail. Otherwise assume 60 min. Cross-day subtasks (with a
// different date key) are ignored — they belong to the day they landed on.
function estimateBlockEndMin(block: TaskBlock, dateKey: string): number {
  const startMin = block.date === dateKey ? timeToMinutes(block.mainTime) : 0;
  const sameDaySubs: SubTask[] = block.subTasks.filter(
    (s) => !s.date || s.date === dateKey
  );
  if (sameDaySubs.length === 0) return startMin + 60;
  const latestSubMin = Math.max(...sameDaySubs.map((s) => timeToMinutes(s.time)));
  return Math.max(startMin, latestSubMin) + 15;
}

function formatGapMinutes(mins: number): string {
  if (mins < 60) return `${mins} min free`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h free` : `${h}h${m}m free`;
}

// Round up to the next 5-minute mark. Used for the "Now" chip so we don't
// suggest a "13:47" start.
function roundUp5(min: number): number {
  return Math.ceil(min / 5) * 5;
}

export interface SuggestOpts {
  workStartHour?: number;
  workEndHour?: number;
  maxResults?: number;
  now?: Date;              // injectable for tests
}

// Returns a small ordered list of time-slot chip suggestions for the given
// date. Sources:
// - "Now" (only if the date is today and the current time falls inside the
//   work window)
// - The start of each ≥ MIN_GAP_TO_SHOW-minute gap between existing blocks
// - The start of any tail gap after the last block
// Suggestions are returned in chronological order; the caller can slice.
export function suggestTimes(
  date: Date,
  existingBlocks: TaskBlock[],
  opts?: SuggestOpts
): TimeSuggestion[] {
  const workStart = (opts?.workStartHour ?? DEFAULT_WORK_START_HOUR) * 60;
  const workEnd = (opts?.workEndHour ?? DEFAULT_WORK_END_HOUR) * 60;
  const maxResults = opts?.maxResults ?? 6;
  const now = opts?.now ?? new Date();
  const dateKey = localDateKey(date);
  const isToday = localDateKey(now) === dateKey;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Start-of-day for suggestion purposes. Today: bounded by "now + buffer" so
  // we never suggest a slot in the past. Future days: workStart.
  const dayFloor = isToday ? Math.max(workStart, roundUp5(nowMin + NOW_BUFFER_MIN)) : workStart;

  // Blocks on this date, sorted by main time. Includes cross-midnight blocks
  // that spilled subtasks into `dateKey` — those still occupy time on the day.
  const sameDay = existingBlocks
    .filter((b) => b.date === dateKey || b.subTasks.some((s) => s.date === dateKey))
    .map((b) => {
      const startMin =
        b.date === dateKey
          ? timeToMinutes(b.mainTime)
          : Math.min(...b.subTasks.filter((s) => s.date === dateKey).map((s) => timeToMinutes(s.time)));
      const endMin = estimateBlockEndMin(b, dateKey);
      return { block: b, startMin, endMin };
    })
    .sort((a, b) => a.startMin - b.startMin);

  const suggestions: TimeSuggestion[] = [];

  // "Now" chip — first only when today and current time is inside the work
  // window (not too early, not past the end).
  if (isToday) {
    const nowRound = roundUp5(nowMin);
    if (
      nowRound >= workStart - NOW_CHIP_MAX_STALE_MIN &&
      nowRound < workEnd &&
      // Only offer "now" if it isn't inside an existing block
      !sameDay.some((s) => nowRound >= s.startMin && nowRound < s.endMin)
    ) {
      const timeStr = minutesToTime(Math.max(nowRound, workStart));
      suggestions.push({
        time: timeStr,
        label: 'Now',
        sub: formatTime24to12(timeStr),
        reason: 'now',
      });
    }
  }

  // Gaps between blocks + before the first + after the last
  let cursor = dayFloor;
  for (const s of sameDay) {
    if (s.startMin > cursor && s.startMin - cursor >= MIN_GAP_TO_SHOW) {
      const slotStart = cursor;
      // Don't suggest anything that would collide with the "Now" chip already
      // pushed (avoid two chips near the same minute).
      const timeStr = minutesToTime(slotStart);
      const alreadySuggested = suggestions.some((x) => x.time === timeStr);
      if (!alreadySuggested) {
        suggestions.push({
          time: timeStr,
          label: formatTime24to12(timeStr),
          sub: formatGapMinutes(s.startMin - slotStart),
          reason: 'gap-start',
        });
      }
    }
    cursor = Math.max(cursor, s.endMin + NOW_BUFFER_MIN);
  }
  // Trailing gap
  if (workEnd - cursor >= MIN_GAP_TO_SHOW) {
    const timeStr = minutesToTime(cursor);
    const alreadySuggested = suggestions.some((x) => x.time === timeStr);
    if (!alreadySuggested) {
      suggestions.push({
        time: timeStr,
        label: formatTime24to12(timeStr),
        sub: formatGapMinutes(workEnd - cursor),
        reason: 'end-of-day',
      });
    }
  }

  return suggestions.slice(0, maxResults);
}

// A short list of days for the day-picker at the top of the TaskModal. Always
// includes today; anchors on the initial date so the modal preserves user
// intent when opened from a day tap.
export interface DayOption {
  date: Date;
  key: string;              // "YYYY-MM-DD"
  label: string;            // "Today", "Tomorrow", weekday abbrev, etc.
  sub?: string;             // "Sep 12"
}

export function buildDayOptions(initial: Date, span = 5, now: Date = new Date()): DayOption[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const initialAt = new Date(initial.getFullYear(), initial.getMonth(), initial.getDate());
  // Anchor on min(today, initial) so the initial date is visible even if it's
  // in the past (opened from a past day in the calendar).
  const anchor = initialAt < startOfToday ? initialAt : startOfToday;
  const out: DayOption[] = [];
  for (let i = 0; i < span; i++) {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() + i);
    const key = localDateKey(d);
    const isToday = key === localDateKey(startOfToday);
    const tomorrow = new Date(startOfToday);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = key === localDateKey(tomorrow);
    let label: string;
    if (isToday) label = 'Today';
    else if (isTomorrow) label = 'Tomorrow';
    else label = d.toLocaleDateString(undefined, { weekday: 'short' });
    const sub = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    out.push({ date: d, key, label, sub });
  }
  return out;
}
