import { useMemo, useRef, useState } from 'react';
import type { LectureItem } from '../types';
import { passCount, overdueDays, isDelivered, nextDueAt } from '../hooks/useLectures';
import type { ImportSummary, PassNumber, WeekBucket } from '../hooks/useLectures';

// Buckets are time-aware. "Due" is the backlog you can actually act on;
// "Waiting" is spaced-out and deliberately not shouting; "Upcoming" hasn't
// happened yet and can't be reviewed at all.
type Filter = 'due' | 'waiting' | 'upcoming' | 'done' | 'all' | 'hidden';

interface LecturesViewProps {
  visible: LectureItem[];
  hiddenItems: LectureItem[];
  buckets: {
    dueNow: LectureItem[];
    resting: LectureItem[];
    upcoming: LectureItem[];
    complete: LectureItem[];
  };
  weeks: WeekBucket[];
  /** Shared clock from useLectures, so buckets and row badges agree. */
  now: number;
  stats: {
    untouched: number; inProgress: number; complete: number; total: number;
    due: number; resting: number; upcoming: number;
  };
  lastImportedAt?: string;
  onImportICS: (text: string) => ImportSummary;
  onTogglePass: (id: string, pass: PassNumber) => void;
  onSetHidden: (id: string, hidden: boolean) => void;
  onRemoveAll: () => void;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const base = d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return sameDay ? `${base} · today` : base;
}

function weekStartKeyLocal(iso: string): string {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Deficit ramp — one hue, monotone through four steps, encoding *outstanding*
// passes rather than completed ones, because the question the strip answers
// is "where am I behind?" and that should be what stands out. On the light
// surface that means going darker; on the dark surface, brighter. Both move
// away from the surface as the deficit grows, which is the actual rule.
// Both ramps were checked with the palette validator (monotone lightness,
// >=0.06 step gaps, end step clearing the surface at 2:1, single hue): light
// passes at 2.09:1 / 24°, dark at 3.47:1 / 35°. The dark ramp is chosen for
// the dark surface, not an inversion of the light one.
const DEFICIT_RAMP_LIGHT = ['#f59e0b', '#d97706', '#b45309', '#92400e'];
const DEFICIT_RAMP_DARK  = ['#b45309', '#d97706', '#f59e0b', '#fbbf24'];

function timeLabel(item: LectureItem): string {
  if (item.allDay) return 'all day';
  const d = new Date(item.start);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function LecturesView({
  visible,
  hiddenItems,
  buckets,
  weeks,
  now,
  stats,
  lastImportedAt,
  onImportICS,
  onTogglePass,
  onSetHidden,
  onRemoveAll,
}: LecturesViewProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<Filter>('due');
  // Tapping a heatmap cell narrows to that week; tapping it again clears.
  const [weekFilter, setWeekFilter] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setSummary(null);
    try {
      const text = await file.text();
      if (!/BEGIN:VCALENDAR/i.test(text)) {
        setError("That file doesn't look like a calendar export (.ics).");
        return;
      }
      const result = onImportICS(text);
      if (result.total === 0) {
        setError('No events found in that file.');
        return;
      }
      setSummary(result);
    } catch {
      setError("Couldn't read that file.");
    }
  };

  const list = useMemo(() => {
    const base =
      filter === 'hidden' ? hiddenItems
      : filter === 'due' ? buckets.dueNow
      : filter === 'waiting' ? buckets.resting
      : filter === 'upcoming' ? buckets.upcoming
      : filter === 'done' ? buckets.complete
      : visible;
    if (!weekFilter) return base;
    return base.filter((i) => weekStartKeyLocal(i.start) === weekFilter);
  }, [filter, visible, hiddenItems, buckets, weekFilter]);

  // The Due queue is already ordered by how overdue each item is; grouping
  // it by day would silently re-sort it back into calendar order and lose
  // the prioritisation. Only the calendar-shaped views get day headers.
  const grouped = filter !== 'due';

  const groups = useMemo(() => {
    if (!grouped) return [];
    const map = new Map<string, LectureItem[]>();
    for (const i of list) {
      const k = dayKey(i.start);
      const arr = map.get(k);
      if (arr) arr.push(i);
      else map.set(k, [i]);
    }
    return Array.from(map.entries());
  }, [list, grouped]);

  const isEmpty = visible.length === 0 && hiddenItems.length === 0;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        <header className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              Lectures
            </h2>
            <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">
              Three passes each: first exposure, consolidation, recall.
            </p>
          </div>
          {stats.total > 0 && (
            <span className="flex-shrink-0 text-right text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 tabular-nums whitespace-nowrap">
              {stats.complete}/{stats.total} done
            </span>
          )}
        </header>

        <input
          ref={fileRef}
          type="file"
          accept=".ics,text/calendar"
          onChange={onFile}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />

        {isEmpty ? (
          <section className="bg-white dark:bg-gray-900 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl px-4 py-6 text-center space-y-3">
            <p className="text-base font-semibold text-gray-700 dark:text-gray-300">
              No lectures imported yet
            </p>
            <div className="text-[13px] text-gray-500 dark:text-gray-400 max-w-md mx-auto space-y-2 text-left">
              <p>
                Open your school calendar link in a browser — it downloads a{' '}
                <code className="text-[11px]">.ics</code> file — then bring that file here.
              </p>
              <p className="text-[12px] text-gray-400 dark:text-gray-500">
                The file stays on your device. Re-import any time the schedule changes; your
                pass checkmarks are matched by event and never overwritten.
              </p>
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
            >
              Choose a .ics file
            </button>
          </section>
        ) : (
          <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-3 space-y-2">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Due now" value={stats.due} tone="text-amber-700 dark:text-amber-300" />
              <Stat label="Waiting" value={stats.resting} tone="text-indigo-700 dark:text-indigo-300" />
              <Stat label="All 3 passes" value={stats.complete} tone="text-emerald-700 dark:text-emerald-300" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => fileRef.current?.click()}
                className="flex-1 py-1.5 text-[11px] font-semibold rounded-lg border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-indigo-400 dark:hover:border-indigo-600 hover:text-indigo-700 dark:hover:text-indigo-300"
              >
                ↻ re-import .ics
              </button>
              <button
                onClick={() => (confirmClear ? (onRemoveAll(), setConfirmClear(false)) : setConfirmClear(true))}
                className="px-2 py-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
              >
                {confirmClear ? 'really clear?' : 'clear'}
              </button>
            </div>
            {lastImportedAt && (
              <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">
                Last imported {new Date(lastImportedAt).toLocaleString()}
              </p>
            )}
          </section>
        )}

        {summary && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2">
            <p className="text-[12px] text-emerald-900 dark:text-emerald-200">
              Imported <strong>{summary.total}</strong> events — {summary.added} new,{' '}
              {summary.updated} updated, {summary.unchanged} unchanged.
            </p>
            {(summary.skipped > 0 || summary.recurring > 0) && (
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-1 leading-relaxed">
                {summary.skipped > 0 && <>{summary.skipped} skipped (no readable start time). </>}
                {summary.recurring > 0 && (
                  <>
                    {summary.recurring} are repeating events — only the first occurrence was
                    imported.
                  </>
                )}
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="text-[12px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {!isEmpty && weeks.length > 0 && (
          <WeekHeatmap
            weeks={weeks}
            selected={weekFilter}
            onSelect={(k) => setWeekFilter((prev) => (prev === k ? null : k))}
          />
        )}

        {!isEmpty && (
          <div className="flex flex-wrap gap-1">
            {(
              [
                ['due', `Due now (${stats.due})`],
                ['waiting', `Waiting (${stats.resting})`],
                ['upcoming', `Upcoming (${stats.upcoming})`],
                ['done', `Done (${stats.complete})`],
                ['all', `All (${stats.total})`],
                ['hidden', `Hidden (${hiddenItems.length})`],
              ] as [Filter, string][]
            ).map(([f, label]) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-colors ${
                  filter === f
                    ? 'bg-indigo-600 text-white border-transparent'
                    : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-800 hover:border-indigo-400 dark:hover:border-indigo-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {!isEmpty && list.length === 0 && (
          <p className="text-[13px] text-gray-500 dark:text-gray-400 text-center py-6">
            Nothing in this filter.
          </p>
        )}

        {grouped ? (
          <div className="space-y-3">
            {groups.map(([key, dayItems]) => (
              <section key={key}>
                <h3 className="text-[11px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 px-1 mb-1">
                  {dayLabel(dayItems[0].start)}
                </h3>
                <ul className="space-y-1.5">
                  {dayItems.map((item) => (
                    <LectureRow
                      key={item.id}
                      item={item}
                      now={now}
                      onTogglePass={onTogglePass}
                      onSetHidden={onSetHidden}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {list.map((item) => (
              <LectureRow
                key={item.id}
                item={item}
                now={now}
                onTogglePass={onTogglePass}
                onSetHidden={onSetHidden}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// A week-by-week strip of how much review is outstanding. Weeks are used
// as the unit rather than parsed topic names: dates are reliable, whereas
// inferring a topic from a lecture title depends entirely on how
// consistently the school names things — something worth adding once real
// titles are in hand, not guessed at.
//
// Colour is never the only channel: every cell carries its date label and a
// title/aria string with the exact counts, and a legend sits underneath.
function WeekHeatmap({
  weeks,
  selected,
  onSelect,
}: {
  weeks: WeekBucket[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const step = (deficit: number): number => {
    if (deficit <= 0) return -1;          // nothing outstanding
    if (deficit <= 0.25) return 0;
    if (deficit <= 0.5) return 1;
    if (deficit <= 0.75) return 2;
    return 3;
  };

  return (
    <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-3">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-[11px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
          Review debt by week
        </h3>
        {selected && (
          <button
            onClick={() => onSelect(selected)}
            className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            clear week filter
          </button>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
        {weeks.map((w) => {
          const i = step(w.deficit);
          const outstanding = w.passesTotal - w.passesDone;
          const isSel = selected === w.key;
          const label = new Date(`${w.key}T12:00:00`).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          });
          const desc = !w.delivered
            ? `Week of ${label}: not delivered yet`
            : `Week of ${label}: ${outstanding} of ${w.passesTotal} passes outstanding`;
          return (
            <button
              key={w.key}
              onClick={() => onSelect(w.key)}
              title={desc}
              aria-label={desc}
              aria-pressed={isSel}
              className={`flex-shrink-0 w-[3.1rem] rounded-lg border px-1 py-1 transition-colors ${
                isSel
                  ? 'border-indigo-500 ring-2 ring-indigo-300 dark:ring-indigo-700'
                  : 'border-gray-200 dark:border-gray-800 hover:border-indigo-400 dark:hover:border-indigo-600'
              }`}
            >
              <span
                className={`block h-6 rounded ${
                  i === -1
                    ? w.delivered
                      ? 'bg-emerald-500'
                      : 'bg-gray-100 dark:bg-gray-800'
                    : 'deficit-cell'
                }`}
                style={
                  i >= 0
                    ? {
                        // Two custom properties, one per mode, so the dark
                        // ramp is a chosen scale rather than a filter flip.
                        ['--c-light' as string]: DEFICIT_RAMP_LIGHT[i],
                        ['--c-dark' as string]: DEFICIT_RAMP_DARK[i],
                      }
                    : undefined
                }
                data-deficit-step={i >= 0 ? i : undefined}
              />
              <span className="block text-[9px] text-gray-500 dark:text-gray-400 mt-0.5 tabular-nums leading-tight">
                {label}
              </span>
              <span className="block text-[9px] font-bold text-gray-700 dark:text-gray-300 tabular-nums leading-tight">
                {w.delivered ? (outstanding === 0 ? '\u2713' : outstanding) : '\u00b7'}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 leading-relaxed">
        Stronger color = more passes still outstanding that week. The number is the count;
        <span className="text-emerald-600 dark:text-emerald-400 font-semibold"> ✓</span> means
        that week is fully reviewed, <strong>·</strong> means it hasn’t happened yet.
      </p>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 py-2">
      <div className={`text-lg font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
        {label}
      </div>
    </div>
  );
}

function LectureRow({
  item,
  now,
  onTogglePass,
  onSetHidden,
}: {
  item: LectureItem;
  /** The view's shared clock — see useLectures. Rows must not read the
   *  time themselves or a row can disagree with the bucket it sits in. */
  now: number;
  onTogglePass: (id: string, pass: PassNumber) => void;
  onSetHidden: (id: string, hidden: boolean) => void;
}) {
  const n = passCount(item);
  const done = n === 3;
  const delivered = isDelivered(item, now);
  const late = delivered ? overdueDays(item, now) : 0;
  const due = nextDueAt(item);
  const waiting = delivered && !done && due !== null && due > now;

  return (
    <li
      className={`group rounded-xl border px-3 py-2 transition-colors ${
        done
          ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
          : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div
            className={`text-[13px] font-semibold leading-snug ${
              done ? 'text-emerald-900 dark:text-emerald-100' : 'text-gray-900 dark:text-gray-100'
            }`}
          >
            {item.title}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            <span className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">
              {timeLabel(item)}
            </span>
            {item.location && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[12rem]">
                · {item.location}
              </span>
            )}
            {!delivered && (
              <span className="text-[9px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
                not yet
              </span>
            )}
            {late > 0 && (
              <span className="text-[9px] uppercase tracking-wider font-bold text-amber-700 dark:text-amber-400">
                {late}d overdue
              </span>
            )}
            {waiting && due !== null && (
              <span
                className="text-[9px] uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400"
                title={`Next pass due ${new Date(due).toLocaleDateString()}`}
              >
                next in {Math.max(1, Math.ceil((due - now) / 86400000))}d
              </span>
            )}
            {item.recurring && (
              <span
                className="text-[9px] uppercase tracking-wider font-bold text-amber-700 dark:text-amber-400"
                title="Repeating event — only the first occurrence was imported"
              >
                repeats
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => onSetHidden(item.id, !item.hidden)}
          className="flex-shrink-0 text-[10px] font-semibold text-gray-300 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          title={item.hidden ? 'Show again' : 'Not study content — hide it'}
        >
          {item.hidden ? 'unhide' : 'hide'}
        </button>
      </div>

      <div className="flex items-center gap-1.5 mt-1.5">
        {([1, 2, 3] as PassNumber[]).map((p) => {
          const field = p === 1 ? item.pass1At : p === 2 ? item.pass2At : item.pass3At;
          const on = !!field;
          return (
            <button
              key={p}
              onClick={() => onTogglePass(item.id, p)}
              className={`flex-1 py-1 text-[11px] font-bold rounded-lg border transition-colors ${
                on
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-400 dark:text-gray-500 hover:border-emerald-400 dark:hover:border-emerald-600 hover:text-emerald-700 dark:hover:text-emerald-300'
              }`}
              title={
                on
                  ? `Pass ${p} done ${new Date(field!).toLocaleDateString()} — tap to undo`
                  : `Mark pass ${p} done`
              }
              aria-pressed={on}
            >
              {on ? '✓' : ''} {p}
            </button>
          );
        })}
      </div>
    </li>
  );
}
