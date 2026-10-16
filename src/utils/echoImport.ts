import type { LectureItem, ExamList, LecturesState } from '../types';
import { PASS_GAP_DAYS } from '../hooks/useLectures';

// Importing from Echo Lecture Finder.
//
// The extension already holds three things SetATime was missing or guessing
// at: a real duration per lecture, the speed they are actually watched at,
// and which exam each one is for. It has stable Echo360 ids, so this is a
// merge rather than a replace and can be re-run as often as you like.
//
// Direction is deliberately one way. Two apps writing one unversioned cloud
// file is how data gets lost, so nothing here ever sends anything back.

/** The payload the extension's content script puts on the page. Everything
 *  is optional because it comes from another codebase on its own release
 *  cycle — a field that disappears should degrade, not throw. */
export interface EchoPayload {
  lectures?: Record<string, {
    id?: string;
    name?: string;
    start?: string | null;
    sectionId?: string;
    sectionName?: string;
    url?: string;
    /** Seconds. */
    dur?: number;
    /** The duration is the scheduled class length, not the media's own. */
    durSched?: boolean;
    hasMedia?: boolean;
  }>;
  marks?: Record<string, { watched?: boolean; pass?: number; opened?: number }>;
  lists?: Record<string, {
    id?: string;
    name?: string;
    examDate?: string;
    items?: Record<string, string>;
  }>;
  /** Global playback rate, e.g. 1.5. */
  playRate?: number;
}

export interface EchoImportResult {
  items: LectureItem[];
  exams: ExamList[];
  playRate?: number;
  added: number;
  updated: number;
  unchanged: number;
  /** Lectures with no usable duration — they cannot be sized into a sitting,
   *  so the planner will skip them and this is how you find out. */
  withoutDuration: number;
}

const DAY_MS = 86_400_000;

/** Pass timestamps from a pass count.
 *
 *  The extension counts passes; SetATime stores a date per pass and computes
 *  when the next one is due from it. So a count has to become dates, and
 *  which dates decides when the lecture next surfaces.
 *
 *  `opened` is a real timestamp and is used for the most recent pass wherever
 *  it exists. Without it, the passes are back-dated by their own gaps so the
 *  lecture reads as due now. That is the honest default: we do not know when
 *  it was last done, and a lecture that shows up to be reviewed is a smaller
 *  error than one that silently waits a week. */
export function passDates(
  count: number,
  openedAt: number | undefined,
  now: number
): { pass1At?: string; pass2At?: string; pass3At?: string } {
  const n = Math.max(0, Math.min(3, Math.round(count || 0)));
  if (n === 0) return {};
  // How long ago the most recent pass must be for the next one to be due now.
  const gapAfter = n === 1 ? PASS_GAP_DAYS.toSecond : PASS_GAP_DAYS.toThird;
  const last = openedAt && openedAt > 0 && openedAt <= now
    ? openedAt
    : now - gapAfter * DAY_MS;
  const out: Record<string, string> = {};
  for (let i = n; i >= 1; i--) {
    // Earlier passes are spaced behind the last one by the same ladder, which
    // keeps passCount right without inventing a more precise-looking history
    // than we actually have.
    const back = i === n ? 0 : (n - i) * PASS_GAP_DAYS.toSecond * DAY_MS;
    out[`pass${i}At`] = new Date(last - back).toISOString();
  }
  return out;
}

/** Real minutes to sit through a lecture once, at the speed it gets watched. */
export function firstPassMinutes(durationSeconds: number, playRate = 1): number {
  const rate = playRate > 0.25 && playRate <= 4 ? playRate : 1;
  return Math.round(durationSeconds / 60 / rate);
}

export function importEcho(
  payload: EchoPayload,
  existing: LecturesState | undefined,
  now = Date.now()
): EchoImportResult {
  const prev = existing?.items ?? [];
  const byId = new Map(prev.map((i) => [i.id, i]));
  const marks = payload.marks ?? {};
  const playRate = typeof payload.playRate === 'number' ? payload.playRate : existing?.playRate;

  let added = 0;
  let updated = 0;
  let unchanged = 0;
  let withoutDuration = 0;

  const out: LectureItem[] = [];
  const seen = new Set<string>();

  for (const raw of Object.values(payload.lectures ?? {})) {
    const id = raw.id;
    if (!id || !raw.start) continue;
    seen.add(id);
    const mine = byId.get(id);
    const seconds = typeof raw.dur === 'number' && raw.dur > 0 ? raw.dur : 0;
    if (!seconds) withoutDuration += 1;

    // The feed owns what the feed knows. Everything about your own progress
    // stays yours — which is the rule that makes re-importing safe.
    const fromFeed: Partial<LectureItem> = {
      title: raw.name || mine?.title || 'Untitled lecture',
      start: raw.start,
      course: raw.sectionName || mine?.course,
      kind: 'lecture',
      ...(seconds ? { durationHours: seconds / 3600 } : {}),
      ...(seconds && raw.durSched ? { durationRough: true } : {}),
      ...(raw.url ? { resourceUrl: raw.url } : {}),
    };

    if (!mine) {
      // Only a brand-new lecture takes its passes from the extension. Once a
      // lecture is in SetATime, SetATime's own ticks are the record and an
      // import must not move them.
      const m = marks[id];
      const count = m?.pass ?? (m?.watched ? 1 : 0);
      out.push({
        ...(fromFeed as LectureItem),
        id,
        ...passDates(count, m?.opened, now),
        importedAt: new Date(now).toISOString(),
      } as LectureItem);
      added += 1;
      continue;
    }

    const merged: LectureItem = { ...mine, ...fromFeed };
    const changed = (Object.keys(fromFeed) as (keyof LectureItem)[])
      .some((k) => mine[k] !== merged[k]);
    if (changed) updated += 1;
    else unchanged += 1;
    out.push(merged);
  }

  // A lecture that has dropped out of the feed is kept. A disappearing row
  // should never take a record of work already done with it.
  for (const old of prev) if (!seen.has(old.id)) out.push(old);

  const exams: ExamList[] = Object.values(payload.lists ?? {})
    .filter((l) => l.id)
    .map((l) => ({
      id: l.id as string,
      name: l.name || 'Exam',
      ...(l.examDate ? { examDate: l.examDate } : {}),
      lectureIds: Object.keys(l.items ?? {}),
    }));

  return { items: out, exams, playRate, added, updated, unchanged, withoutDuration };
}
