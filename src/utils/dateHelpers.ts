import { startOfWeek, addDays, format, isSameDay, addWeeks, subWeeks } from 'date-fns';

export function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 }); // Monday
}

export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function formatDayHeader(date: Date): string {
  return format(date, 'EEE d');
}

export function formatFullDate(date: Date): string {
  return format(date, 'EEEE, MMMM d');
}

export function formatDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function navigateWeek(current: Date, direction: -1 | 1): Date {
  return direction === 1 ? addWeeks(current, 1) : subWeeks(current, 1);
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

export function formatTime24to12(time: string): string {
  // Defensive because this is called during render all over the app, and a
  // block whose time has not been populated yet used to take the entire page
  // down: "".split(":") leaves the minutes undefined and .toString() throws.
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function getWeekRangeLabel(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  const startMonth = format(weekStart, 'MMM d');
  const endMonth = format(weekEnd, 'MMM d, yyyy');
  return `${startMonth} – ${endMonth}`;
}
