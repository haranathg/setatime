// Reader for the Vitals "Student Schedule List" .xls export.
//
// This export strictly dominates the .ics calendar feed: it carries the
// course (as the sheet name), the activity type, an explicit duration, a
// real due date, a flex flag, and a link to the actual resource. The
// calendar feed has none of that.
//
// The file is a legacy BIFF8 workbook, so it needs a real spreadsheet
// reader. That library is loaded with a dynamic import by the caller so it
// only costs bandwidth on the import itself, not on every app load.

import type { WorkBook, WorkSheet } from 'xlsx';
import type { LectureItem, LectureKind } from '../types';

export interface ParsedActivity {
  id: string;
  course: string;          // the sheet name
  title: string;
  type: string;            // raw Type cell, e.g. "Guided Learning"
  kind: LectureKind;       // what that type means for study workflow
  start: string;           // ISO
  durationHours?: number;
  dueAt?: string;          // ISO — Guided Learning and other async work
  flex?: boolean;
  instructors?: string;
  resourceUrl?: string;    // the one hyperlink the cell carries
  resourceNames?: string[]; // every bulleted resource name, linked or not
}

export interface ScheduleParseResult {
  activities: ParsedActivity[];
  courses: string[];
  skipped: { reason: string; detail?: string }[];
}

const HEADERS = ['title', 'type', 'instructors', 'resource', 'author', 'scheduled', 'duration', 'due', 'flex'];

/**
 * Map a Vitals activity type onto how it should actually be studied.
 *
 * The split that matters: in this export 83 lectures carry no due date at
 * all, while 106 of 110 Guided Learning items do — often the next morning.
 * They are different work. Lectures get the three-pass review model;
 * Guided Learning is homework with a deadline and gets a single done flag.
 */
export function classify(type: string): LectureKind {
  const t = type.toLowerCase();
  if (/quiz|midterm|final|exam|osce/.test(t)) return 'assessment';
  if (/guided learning|independent learning/.test(t)) return 'guided';
  if (/non-curricular|orientation/.test(t)) return 'non-curricular';
  return 'lecture';
}

/** Excel serial date → ISO, treating the serial as local wall-clock time.
 *  Same reasoning as the .ics TZID handling: the schedule is written in the
 *  school's local time and read by someone standing in it. */
function serialToISO(serial: unknown): string | undefined {
  const n = typeof serial === 'number' ? serial : Number(serial);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  // Excel's epoch is 1899-12-30 (the 1900 leap-year bug is already baked in).
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const utc = new Date(ms);
  const d = new Date(
    utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(),
    utc.getUTCHours(), utc.getUTCMinutes(), 0, 0
  );
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** The Resource cell is a bulleted list; only the first entry carries the
 *  hyperlink the file stores for that cell. */
function splitResourceNames(raw: string): string[] {
  return raw
    .split(/\n/)
    .map((s) => s.replace(/^\s*[•\-*]\s*/, '').trim())
    .filter(Boolean);
}

/** Stable id. The export has no UID, so it is derived from the fields that
 *  identify an activity — re-importing an updated file updates rows in place
 *  instead of duplicating them. */
function makeId(course: string, title: string, startISO: string): string {
  const basis = `${course}|${title}|${startISO}`;
  let h = 5381;
  for (let i = 0; i < basis.length; i++) h = ((h << 5) + h + basis.charCodeAt(i)) >>> 0;
  return `xls-${h.toString(36)}-${basis.length.toString(36)}`;
}

function parseSheet(
  XLSX: typeof import('xlsx'),
  ws: WorkSheet,
  course: string,
  out: ParsedActivity[],
  skipped: ScheduleParseResult['skipped']
): void {
  if (!ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);

  // Find the header row rather than assuming its index — the preamble
  // (title, student name, date range, the "click the linked Resource" note)
  // is a different height on different sheets.
  let headerRow = -1;
  const colOf: Record<string, number> = {};
  for (let R = range.s.r; R <= range.e.r && headerRow === -1; R++) {
    const seen: Record<string, number> = {};
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      const v = cell ? String(cell.v ?? '').trim().toLowerCase().replace(/\s+/g, ' ') : '';
      if (!v) continue;
      for (const h of HEADERS) if (v.startsWith(h)) seen[h] = C;
    }
    if (seen.title !== undefined && seen.type !== undefined && seen.scheduled !== undefined) {
      headerRow = R;
      Object.assign(colOf, seen);
    }
  }
  if (headerRow === -1) {
    skipped.push({ reason: 'no header row found', detail: course });
    return;
  }

  const get = (R: number, key: string) => {
    const C = colOf[key];
    if (C === undefined) return undefined;
    return ws[XLSX.utils.encode_cell({ r: R, c: C })];
  };

  for (let R = headerRow + 1; R <= range.e.r; R++) {
    const titleCell = get(R, 'title');
    const title = titleCell ? String(titleCell.v ?? '').trim() : '';
    if (!title) continue;

    const type = String(get(R, 'type')?.v ?? '').trim();
    if (!type || type.toLowerCase() === 'type') continue; // a repeated header

    const start = serialToISO(get(R, 'scheduled')?.v);
    if (!start) {
      skipped.push({ reason: 'no scheduled time', detail: title });
      continue;
    }

    const durRaw = get(R, 'duration')?.v;
    const dur = Number(durRaw);
    const resourceCell = get(R, 'resource');
    const resourceRaw = resourceCell ? String(resourceCell.v ?? '') : '';
    const flexRaw = String(get(R, 'flex')?.v ?? '').trim().toLowerCase();

    out.push({
      id: makeId(course, title, start),
      course,
      title,
      type,
      kind: classify(type),
      start,
      durationHours: Number.isFinite(dur) && dur > 0 ? dur : undefined,
      dueAt: serialToISO(get(R, 'due')?.v),
      flex: flexRaw === 'yes' ? true : flexRaw === 'no' ? false : undefined,
      instructors: String(get(R, 'instructors')?.v ?? '').trim() || undefined,
      resourceUrl: resourceCell?.l?.Target ? String(resourceCell.l.Target) : undefined,
      resourceNames: resourceRaw ? splitResourceNames(resourceRaw) : undefined,
    });
  }
}

export function parseScheduleWorkbook(
  XLSX: typeof import('xlsx'),
  wb: WorkBook
): ScheduleParseResult {
  const activities: ParsedActivity[] = [];
  const skipped: ScheduleParseResult['skipped'] = [];
  for (const name of wb.SheetNames) {
    parseSheet(XLSX, wb.Sheets[name], name.trim(), activities, skipped);
  }
  activities.sort((a, b) => a.start.localeCompare(b.start));
  return {
    activities,
    courses: Array.from(new Set(activities.map((a) => a.course))),
    skipped,
  };
}

/** Turn a parsed row into the stored shape. Non-curricular rows arrive
 *  hidden so orientation days and placeholders never pad the study queue,
 *  while still being present to un-hide if one turns out to matter. */
export function toLectureItem(a: ParsedActivity, importedAt: string): LectureItem {
  return {
    id: a.id,
    title: a.title,
    start: a.start,
    location: undefined,
    course: a.course,
    activityType: a.type,
    kind: a.kind,
    durationHours: a.durationHours,
    dueAt: a.dueAt,
    flex: a.flex,
    instructors: a.instructors,
    resourceUrl: a.resourceUrl,
    resourceNames: a.resourceNames?.length ? a.resourceNames : undefined,
    hidden: a.kind === 'non-curricular' ? true : undefined,
    importedAt,
  };
}
