// A small, defensive iCalendar (RFC 5545) reader.
//
// Scope is deliberately narrow: pull VEVENTs out of a real-world school
// calendar export well enough to track them. It is not a general iCal
// implementation — see the notes on recurrence at the bottom.

export interface ParsedEvent {
  uid: string;
  title: string;
  start: string;        // ISO timestamp
  end?: string;         // ISO timestamp
  location?: string;
  allDay: boolean;
  recurring: boolean;   // had an RRULE
  /** Raw RRULE value, e.g. "FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261218T050000Z".
   *  Expanding it into occurrences is the caller's job — see
   *  `calendarImport.expandOccurrences`. */
  rrule?: string;
  /** Every EXDATE value, flattened. A recurring event lists the dates its
   *  rule should skip (a cancelled week); dropping them silently puts a
   *  class on the calendar that is not happening. */
  exDates?: string[];
  /** Set when this VEVENT overrides one occurrence of a recurring series
   *  (RFC 5545 §3.8.4.4) — a single moved or renamed session. Carries the
   *  original start of the instance being replaced. */
  recurrenceId?: string;
  /** Length in minutes, from DTEND or DURATION. Undefined when the event
   *  gave neither. */
  durationMinutes?: number;
  /** Outlook/Google write SUMMARY as the only title, but a busy/free
   *  marker matters for planning: a "free" event is not a commitment. */
  transparent?: boolean;
}

export interface ParseResult {
  events: ParsedEvent[];
  /** VEVENTs that were skipped, with a reason — surfaced so a silent drop
   *  never looks like "the calendar only had 12 things in it". */
  skipped: { reason: string; detail?: string }[];
}

// RFC 5545 §3.1: long lines are folded with CRLF followed by a single
// space or tab. Unfold before anything else or a SUMMARY splits in half.
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

// "DTSTART;TZID=America/New_York:20260904T080000" →
//   { name: 'DTSTART', params: {TZID: 'America/New_York'}, value: '2026...' }
function parseLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = head.split(';');
  const name = parts[0].toUpperCase();
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq === -1) continue;
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name, params, value };
}

// RFC 5545 §3.3.11 escaping.
function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Convert an iCal date/date-time to an ISO string.
 *
 * Three shapes matter:
 *   20260904                  → all-day (local midnight)
 *   20260904T080000Z          → absolute UTC
 *   20260904T080000 (+TZID)   → wall-clock time
 *
 * The TZID case is treated as *local* wall clock rather than resolved
 * through a timezone database. For a student attending the school whose
 * calendar this is, local and the calendar's zone are the same, so an 8am
 * lecture reads as 8am — which is the only thing that matters here.
 * Resolving TZID properly would mean shipping a tz database for a case
 * that, in practice, never differs.
 */
function toISO(value: string, params: Record<string, string>): { iso: string; allDay: boolean } | null {
  const v = value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly || params.VALUE === 'DATE') {
    const m = dateOnly ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
    if (Number.isNaN(d.getTime())) return null;
    return { iso: d.toISOString(), allDay: true };
  }

  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (!dt) return null;
  const [, y, mo, da, h, mi, s, z] = dt;
  const d = z
    ? new Date(Date.UTC(+y, +mo - 1, +da, +h, +mi, +s))
    : new Date(+y, +mo - 1, +da, +h, +mi, +s);
  if (Number.isNaN(d.getTime())) return null;
  return { iso: d.toISOString(), allDay: false };
}

/** RFC 5545 §3.3.6 duration, e.g. "PT1H30M", "P1D", "-PT15M". Only the
 *  positive day/hour/minute shapes an event length ever uses. */
export function parseIcalDuration(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
    raw.trim().toUpperCase()
  );
  if (!m) return undefined;
  const [, sign, w, d, h, mi, sec] = m;
  const total =
    (w ? +w * 7 * 24 * 60 : 0) +
    (d ? +d * 24 * 60 : 0) +
    (h ? +h * 60 : 0) +
    (mi ? +mi : 0) +
    (sec ? Math.round(+sec / 60) : 0);
  if (total === 0) return undefined;
  return sign === '-' ? -total : total;
}

/** Event length, preferring an explicit DTEND and falling back to DURATION. */
function minutesBetween(
  start: { iso: string; allDay: boolean },
  end: { iso: string; allDay: boolean } | null,
  duration?: string
): number | undefined {
  if (end) {
    const mins = Math.round(
      (new Date(end.iso).getTime() - new Date(start.iso).getTime()) / 60000
    );
    return mins > 0 ? mins : undefined;
  }
  const d = parseIcalDuration(duration);
  return d && d > 0 ? d : undefined;
}

export function parseICS(text: string): ParseResult {
  const lines = unfold(text);
  const events: ParsedEvent[] = [];
  const skipped: ParseResult['skipped'] = [];

  // Component nesting matters: a VTIMEZONE carries STANDARD/DAYLIGHT
  // sub-components that each have their own DTSTART. Reading properties
  // without tracking depth pulls 1970s timezone transition dates in as
  // if they were lectures.
  const stack: string[] = [];
  let current: Record<string, { value: string; params: Record<string, string> }> | null = null;
  // EXDATE legally appears many times in one VEVENT, and each occurrence may
  // itself be a comma-separated list. The single-value property map above
  // would keep only the last one, so these are collected on the side.
  let currentEx: { value: string; params: Record<string, string> }[] = [];

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const { name, value, params } = parsed;

    if (name === 'BEGIN') {
      stack.push(value.toUpperCase());
      if (value.toUpperCase() === 'VEVENT' && stack.length === 2) {
        current = {};
        currentEx = [];
      }
      continue;
    }
    if (name === 'END') {
      const closing = value.toUpperCase();
      if (closing === 'VEVENT' && current) {
        const ev = current;
        const exList = currentEx;
        current = null;
        currentEx = [];
        stack.pop();

        const summary = ev.SUMMARY ? unescapeText(ev.SUMMARY.value).trim() : '';
        if (!ev.DTSTART) {
          skipped.push({ reason: 'no start time', detail: summary || undefined });
          continue;
        }
        const start = toISO(ev.DTSTART.value, ev.DTSTART.params);
        if (!start) {
          skipped.push({ reason: 'unreadable start time', detail: summary || ev.DTSTART.value });
          continue;
        }
        const end = ev.DTEND ? toISO(ev.DTEND.value, ev.DTEND.params) : null;

        const exDates: string[] = [];
        for (const ex of exList) {
          for (const piece of ex.value.split(',')) {
            const iso = toISO(piece, ex.params);
            if (iso) exDates.push(iso.iso);
          }
        }

        events.push({
          // A missing UID is legal-ish in the wild. Fall back to something
          // deterministic so re-importing the same file matches existing
          // rows instead of duplicating them.
          uid: ev.UID ? ev.UID.value.trim() : `${start.iso}|${summary}`,
          title: summary || '(untitled)',
          start: start.iso,
          end: end?.iso,
          location: ev.LOCATION ? unescapeText(ev.LOCATION.value).trim() || undefined : undefined,
          allDay: start.allDay,
          recurring: !!ev.RRULE,
          rrule: ev.RRULE ? ev.RRULE.value.trim() : undefined,
          exDates: exDates.length ? exDates : undefined,
          recurrenceId: ev['RECURRENCE-ID']
            ? toISO(ev['RECURRENCE-ID'].value, ev['RECURRENCE-ID'].params)?.iso
            : undefined,
          durationMinutes: minutesBetween(start, end, ev.DURATION?.value),
          transparent: ev.TRANSP
            ? ev.TRANSP.value.trim().toUpperCase() === 'TRANSPARENT'
            : undefined,
        });
        continue;
      }
      stack.pop();
      continue;
    }

    // Only collect properties directly inside a top-level VEVENT.
    if (current && stack.length === 2 && stack[1] === 'VEVENT') {
      if (name === 'EXDATE') currentEx.push({ value, params });
      else current[name] = { value, params };
    }
  }

  return { events, skipped };
}

// Recurrence: a VEVENT carrying an RRULE is returned once, at its first
// occurrence, with the rule and its EXDATEs attached. Turning that into the
// individual sessions is `calendarImport.expandOccurrences` — kept separate
// because expansion needs a window to expand into, which is a decision
// belonging to the caller, not to the parser.
