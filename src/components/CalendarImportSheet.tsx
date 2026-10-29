import { useCallback, useMemo, useState } from 'react';
import type { CalendarSource, TaskBlock } from '../types';
import { parseICS } from '../utils/icalImport';
import { expandOccurrences, toBlocks } from '../utils/calendarImport';
import type { Occurrence, MergeResult } from '../utils/calendarImport';
import { formatDateKey } from '../utils/dateHelpers';
import { SOURCE_COLORS } from '../hooks/useCalendarSources';

// Getting the calendars you already keep onto the grid.
//
// Calendar.app exports one .ics per calendar, so this takes several files at
// once and treats each as its own source — school, work, personal — keeping
// them separable afterwards. It previews before it writes, because an import
// that lands hundreds of blocks on your week is not something to find out
// about after the fact.

/** Windows are built from LOCAL day boundaries. `new Date('2026-11-30')` is
 *  UTC midnight — the evening of the 29th in US time zones — which silently
 *  drops the last day of the range. */
const dayStart = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const dayEnd = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const WINDOWS = [
  { key: '4w', label: '4 weeks', back: 7, forward: 28 },
  { key: '12w', label: '12 weeks', back: 7, forward: 84 },
  { key: 'term', label: 'Rest of term', back: 14, forward: 182 },
] as const;

type WindowKey = (typeof WINDOWS)[number]['key'];

interface Staged {
  name: string;
  occurrences: Occurrence[];
  blocks: TaskBlock[];
  skipped: number;
  notes: string[];
  color: string;
  existing?: CalendarSource;
  /** Present when this calendar was added by URL, so it can keep itself
   *  current instead of needing another export. */
  feedUrl?: string;
}

/** "Calendar Export/VITALS Schedule.ics" → "VITALS Schedule" */
function calendarNameOf(fileName: string): string {
  const base = fileName.replace(/\.(ics|ical|ifb)$/i, '');
  const tail = base.split('/').pop() ?? base;
  return tail.trim() || 'Calendar';
}

export default function CalendarImportSheet({
  sources,
  onImport,
  onUpsertSource,
  onRemoveSource,
  onFetchFeeds,
  onRefreshAll,
  onClose,
}: {
  sources: CalendarSource[];
  onImport: (
    batches: {
      sourceId: string;
      blocks: TaskBlock[];
      window: { fromKey: string; toKey: string };
    }[]
  ) => MergeResult;
  onUpsertSource: (name: string, patch: Partial<CalendarSource>) => CalendarSource;
  onRemoveSource: (id: string) => void;
  /** Fetch feeds through the sync Lambda — the browser cannot reach them. */
  onFetchFeeds: (urls: string[]) => Promise<{ ok: boolean; ics?: string; error?: string }[]>;
  onRefreshAll: () => Promise<{ added: number; updated: number; removed: number; failures: { name: string; error: string }[] }>;
  onClose: () => void;
}) {
  const [windowKey, setWindowKey] = useState<WindowKey>('12w');
  const [staged, setStaged] = useState<Staged[]>([]);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ added: number; updated: number; removed: number } | null>(null);
  const [feedName, setFeedName] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [busyFeed, setBusyFeed] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);

  const win = WINDOWS.find((w) => w.key === windowKey) ?? WINDOWS[1];

  const range = useMemo(() => {
    const now = new Date();
    const from = dayStart(new Date(now.getTime() - win.back * 86400000));
    const to = dayEnd(new Date(now.getTime() + win.forward * 86400000));
    return { from, to, fromKey: formatDateKey(from), toKey: formatDateKey(to) };
  }, [win]);

  const read = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setReading(true);
      setError(null);
      setDone(null);
      const next: Staged[] = [];
      try {
        for (const file of Array.from(files)) {
          const text = await file.text();
          if (!/BEGIN:VCALENDAR/i.test(text)) {
            next.push({
              name: calendarNameOf(file.name),
              occurrences: [],
              blocks: [],
              skipped: 0,
              notes: ['Not an iCalendar file — nothing to read.'],
              color: SOURCE_COLORS[0],
            });
            continue;
          }
          const parsed = parseICS(text);
          const { occurrences, notes } = expandOccurrences(parsed.events, {
            from: range.from,
            to: range.to,
          });
          const name = calendarNameOf(file.name);
          const existing = sources.find((s) => s.name.toLowerCase() === name.toLowerCase());
          const color =
            existing?.color ?? SOURCE_COLORS[(sources.length + next.length) % SOURCE_COLORS.length];
          next.push({
            name,
            occurrences,
            blocks: toBlocks(occurrences, { id: existing?.id ?? name, name, color }),
            skipped: parsed.skipped.length,
            notes,
            color,
            existing,
          });
        }
        setStaged(next);
      } catch {
        setError('Could not read one of those files.');
      } finally {
        setReading(false);
      }
    },
    [range, sources]
  );

  const addByUrl = useCallback(async () => {
    const url = feedUrl.trim();
    if (!url) return;
    setBusyFeed(true);
    setError(null);
    setDone(null);
    try {
      const [result] = await onFetchFeeds([url]);
      if (!result || !result.ok || !result.ics) {
        setError(result?.error || 'Could not fetch that calendar.');
        return;
      }
      const parsed = parseICS(result.ics);
      const { occurrences, notes } = expandOccurrences(parsed.events, {
        from: range.from,
        to: range.to,
      });
      // A feed usually names itself; fall back to the host, then to anything.
      const named =
        feedName.trim() ||
        /X-WR-CALNAME:(.+)/i.exec(result.ics)?.[1]?.trim() ||
        (() => {
          try {
            return new URL(url.replace(/^webcal:\/\//i, 'https://')).hostname;
          } catch {
            return 'Calendar';
          }
        })();
      const existing = sources.find((x) => x.name.toLowerCase() === named.toLowerCase());
      const color =
        existing?.color ?? SOURCE_COLORS[(sources.length + staged.length) % SOURCE_COLORS.length];
      setStaged((prev) => [
        ...prev.filter((x) => x.name.toLowerCase() !== named.toLowerCase()),
        {
          name: named,
          occurrences,
          blocks: toBlocks(occurrences, { id: existing?.id ?? named, name: named, color }),
          skipped: parsed.skipped.length,
          notes,
          color,
          existing,
          feedUrl: url,
        },
      ]);
      setFeedUrl('');
      setFeedName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not fetch that calendar.');
    } finally {
      setBusyFeed(false);
    }
  }, [feedUrl, feedName, onFetchFeeds, range, sources, staged.length]);

  const refreshNow = useCallback(async () => {
    setBusyFeed(true);
    setRefreshNote(null);
    try {
      const r = await onRefreshAll();
      setRefreshNote(
        r.failures.length > 0
          ? `${r.failures.map((f) => `${f.name}: ${f.error}`).join(' · ')}`
          : `Up to date — ${r.updated} changed, ${r.added} new${r.removed > 0 ? `, ${r.removed} cancelled` : ''}.`
      );
    } finally {
      setBusyFeed(false);
    }
  }, [onRefreshAll]);

  const total = staged.reduce((n, s) => n + s.occurrences.length, 0);

  const commit = () => {
    const window = { fromKey: range.fromKey, toKey: range.toKey };
    const batches: { sourceId: string; blocks: TaskBlock[]; window: typeof window }[] = [];

    for (const s of staged) {
      if (s.occurrences.length === 0) continue;
      const src = onUpsertSource(s.name, {
        color: s.color,
        lastImportedAt: new Date().toISOString(),
        fromKey: range.fromKey,
        toKey: range.toKey,
        eventCount: s.occurrences.length,
        // Only set when this one came from a URL; importing a file must not
        // wipe a subscription that is already working.
        ...(s.feedUrl ? { feedUrl: s.feedUrl } : {}),
        backDays: win.back,
        forwardDays: win.forward,
      });
      // Re-key onto the real source id, since a first import had only the name.
      batches.push({
        sourceId: src.id,
        window,
        blocks: s.blocks.map((b) => ({
          ...b,
          id: `cal:${src.id}:${b.calendar!.key}`,
          color: s.color,
          calendar: { ...b.calendar!, sourceId: src.id },
        })),
      });
    }

    // One call for every calendar — see `importCalendarBlocks`, which cannot
    // be called once per source without each one discarding the last.
    const r = onImport(batches);
    setDone({ added: r.added, updated: r.updated, removed: r.removed });
    setStaged([]);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[88vh] flex flex-col bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Import calendars
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
              Repeating events are expanded into real sessions, so the planner
              can see next Tuesday's lecture and work around it.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[11px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 shrink-0"
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          <div>
            <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
              How far ahead
            </span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {WINDOWS.map((w) => (
                <button
                  key={w.key}
                  onClick={() => {
                    setWindowKey(w.key);
                    setStaged([]);
                    setDone(null);
                  }}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors ${
                    windowKey === w.key
                      ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
              {range.fromKey} → {range.toKey}
            </p>
          </div>

          <div>
            <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
              Subscribe by link
            </span>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 leading-snug">
              A subscription keeps itself current — change something in the
              school system and it appears here on its own. In Calendar on your
              Mac: right-click a subscribed calendar, Get Info, and copy the URL.
            </p>
            <div className="flex gap-1.5 mt-1.5">
              <input
                type="text"
                value={feedName}
                onChange={(e) => setFeedName(e.target.value)}
                placeholder="Name (optional)"
                className="w-28 shrink-0 px-2 py-1.5 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                type="url"
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addByUrl(); }}
                placeholder="webcal:// or https://…"
                className="flex-1 min-w-0 px-2 py-1.5 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={addByUrl}
                disabled={!feedUrl.trim() || busyFeed}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400 disabled:opacity-40 shrink-0"
              >
                {busyFeed ? '…' : 'Add'}
              </button>
            </div>
            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 leading-snug">
              Treat a calendar link like a password — it usually needs no login,
              so anyone holding it can read that calendar.
            </p>
          </div>

          <label className="block">
            <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
              Or import files
            </span>
            <input
              type="file"
              accept=".ics,.ical,.ifb,text/calendar"
              multiple
              onChange={(e) => read(e.target.files)}
              className="mt-1 block w-full text-[12px] text-gray-600 dark:text-gray-300 file:mr-3 file:px-2.5 file:py-1 file:text-[11px] file:font-semibold file:rounded-lg file:border file:border-gray-200 dark:file:border-gray-700 file:bg-white dark:file:bg-gray-800 file:text-gray-700 dark:file:text-gray-200"
            />
            <span className="block text-[10px] text-gray-400 dark:text-gray-500 mt-1 leading-snug">
              In Calendar on your Mac: select a calendar, then File → Export →
              Export. One file per calendar; pick as many as you like here. The
              file name becomes the calendar name.
            </span>
          </label>

          {reading && (
            <p className="text-[12px] text-gray-500 dark:text-gray-400">Reading…</p>
          )}
          {error && (
            <p className="text-[12px] text-rose-600 dark:text-rose-400">{error}</p>
          )}

          {staged.length > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
                Ready to add
              </div>
              {staged.map((s, i) => (
                <div
                  key={`${s.name}-${i}`}
                  className="rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="text-[12px] font-bold text-gray-900 dark:text-gray-100 truncate">
                      {s.name}
                    </span>
                    {s.existing && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
                        updating
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-1">
                    {s.occurrences.length} session
                    {s.occurrences.length === 1 ? '' : 's'} in this window
                    {s.skipped > 0 && ` · ${s.skipped} unreadable`}
                  </p>
                  {s.occurrences.length > 0 && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                      e.g. {s.occurrences.slice(0, 3).map((o) => o.title).join(' · ')}
                    </p>
                  )}
                  {s.notes.map((n, k) => (
                    <p
                      key={k}
                      className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 leading-snug"
                    >
                      {n}
                    </p>
                  ))}
                  <div className="flex gap-1 mt-1.5">
                    {SOURCE_COLORS.map((c) => (
                      <button
                        key={c}
                        aria-label={`Colour ${c}`}
                        onClick={() =>
                          setStaged((prev) =>
                            prev.map((x, n) => (n === i ? { ...x, color: c } : x))
                          )
                        }
                        className={`w-4 h-4 rounded-full border-2 ${
                          s.color === c
                            ? 'border-gray-900 dark:border-gray-100'
                            : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {done && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30 px-3 py-2">
              <p className="text-[12px] text-emerald-800 dark:text-emerald-300 leading-snug">
                {done.added} added, {done.updated} updated
                {done.removed > 0 && `, ${done.removed} no longer on the calendar`}.
                Plan the day and it will work around them.
              </p>
            </div>
          )}

          {sources.length > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
                  Your calendars
                </span>
                {sources.some((s) => s.feedUrl) && (
                  <button
                    onClick={refreshNow}
                    disabled={busyFeed}
                    className="text-[10px] uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400 disabled:opacity-40"
                  >
                    {busyFeed ? 'Refreshing…' : 'Refresh now'}
                  </button>
                )}
              </div>
              {refreshNote && (
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5 leading-snug">
                  {refreshNote}
                </p>
              )}
              <ul className="space-y-1">
                {sources.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="text-[12px] text-gray-700 dark:text-gray-200 truncate flex-1">
                      {s.name}
                      {s.eventCount != null && (
                        <span className="text-gray-400 dark:text-gray-500">
                          {' '}· {s.eventCount}
                        </span>
                      )}
                      {s.feedUrl ? (
                        <span className="text-emerald-600 dark:text-emerald-400"> · subscribed</span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500"> · from a file</span>
                      )}
                      {s.lastRefreshError && (
                        <span className="block text-[10px] text-rose-600 dark:text-rose-400 leading-snug">
                          {s.lastRefreshError}
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => onRemoveSource(s.id)}
                      className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 shrink-0"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <footer className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            Nothing is written until you add it.
          </span>
          <button
            onClick={commit}
            disabled={total === 0}
            className="px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {total === 0 ? 'Add to calendar' : `Add ${total} session${total === 1 ? '' : 's'}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
