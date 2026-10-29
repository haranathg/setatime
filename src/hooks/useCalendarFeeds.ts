import { useCallback, useRef, useState } from 'react';
import type { CalendarSource, TaskBlock } from '../types';
import { getSecretKey, fetchCalendarFeeds } from '../services/syncService';
import { parseICS } from '../utils/icalImport';
import { expandOccurrences, toBlocks } from '../utils/calendarImport';
import type { MergeResult } from '../utils/calendarImport';
import { formatDateKey } from '../utils/dateHelpers';

// Keeping subscribed calendars current.
//
// A file export is a snapshot: change a lecture in the school system and the
// grid keeps showing the old one. A subscription re-reads the same feed the
// Mac's Calendar reads, so the two stay in step without anyone remembering
// to do anything.

export const DEFAULT_BACK_DAYS = 7;
export const DEFAULT_FORWARD_DAYS = 84;

/** Not more often than this on open. Feeds update on their own schedule —
 *  the school's is typically hourly at best — so a fetch per app open would
 *  be noise, and on a phone it would be noise on someone's data plan. */
const MIN_REFRESH_GAP_MS = 30 * 60 * 1000;
const LAST_REFRESH_KEY = 'setatime_calendars_refreshed_at';

/** Windows must be built from local day boundaries: a UTC-parsed date is the
 *  previous evening in US time zones and silently clips the last day. */
const dayStart = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const dayEnd = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

export function windowFor(source: CalendarSource, now = new Date()) {
  const back = source.backDays ?? DEFAULT_BACK_DAYS;
  const forward = source.forwardDays ?? DEFAULT_FORWARD_DAYS;
  const from = dayStart(new Date(now.getTime() - back * 86400000));
  const to = dayEnd(new Date(now.getTime() + forward * 86400000));
  return { from, to, fromKey: formatDateKey(from), toKey: formatDateKey(to) };
}

export interface RefreshOutcome {
  ran: boolean;
  added: number;
  updated: number;
  removed: number;
  /** Calendars that could not be refreshed, with why. Surfaced rather than
   *  swallowed: a feed that has quietly stopped working looks exactly like a
   *  term with no changes in it. */
  failures: { name: string; error: string }[];
}

export function useCalendarFeeds({
  sources,
  onImport,
  onSourceResult,
}: {
  sources: CalendarSource[];
  onImport: (
    batches: { sourceId: string; blocks: TaskBlock[]; window: { fromKey: string; toKey: string } }[]
  ) => MergeResult;
  onSourceResult: (id: string, patch: Partial<CalendarSource>) => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<RefreshOutcome | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(
    async (opts?: { force?: boolean }): Promise<RefreshOutcome> => {
      const idle: RefreshOutcome = { ran: false, added: 0, updated: 0, removed: 0, failures: [] };
      const subscribed = sources.filter((s) => !!s.feedUrl);
      if (subscribed.length === 0) return idle;

      const key = getSecretKey();
      if (!key) return idle;

      // Re-entrancy matters here: a refresh on open and a tapped Refresh
      // would otherwise both compute from the same pre-merge state, and the
      // second would discard the first.
      if (inFlight.current) return idle;

      if (!opts?.force) {
        const last = Number(localStorage.getItem(LAST_REFRESH_KEY) || 0);
        if (Date.now() - last < MIN_REFRESH_GAP_MS) return idle;
      }

      inFlight.current = true;
      setRefreshing(true);
      try {
        const results = await fetchCalendarFeeds(
          key,
          subscribed.map((s) => s.feedUrl as string)
        );

        const batches: {
          sourceId: string;
          blocks: TaskBlock[];
          window: { fromKey: string; toKey: string };
        }[] = [];
        const failures: { name: string; error: string }[] = [];

        subscribed.forEach((source, i) => {
          const result = results[i];
          if (!result || !result.ok || !result.ics) {
            const error = result?.error || 'No response for this calendar.';
            failures.push({ name: source.name, error });
            onSourceResult(source.id, { lastRefreshError: error });
            return;
          }
          const win = windowFor(source);
          const { occurrences } = expandOccurrences(parseICS(result.ics).events, {
            from: win.from,
            to: win.to,
          });
          batches.push({
            sourceId: source.id,
            window: { fromKey: win.fromKey, toKey: win.toKey },
            blocks: toBlocks(occurrences, {
              id: source.id,
              name: source.name,
              color: source.color,
            }),
          });
          onSourceResult(source.id, {
            lastImportedAt: new Date().toISOString(),
            fromKey: win.fromKey,
            toKey: win.toKey,
            eventCount: occurrences.length,
            lastRefreshError: undefined,
          });
        });

        const merged = batches.length > 0 ? onImport(batches) : null;
        try {
          localStorage.setItem(LAST_REFRESH_KEY, String(Date.now()));
        } catch {
          // a full or blocked store only costs us the throttle
        }

        const outcome: RefreshOutcome = {
          ran: true,
          added: merged?.added ?? 0,
          updated: merged?.updated ?? 0,
          removed: merged?.removed ?? 0,
          failures,
        };
        setLastOutcome(outcome);
        return outcome;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Calendar refresh failed.';
        const outcome: RefreshOutcome = {
          ran: true,
          added: 0,
          updated: 0,
          removed: 0,
          failures: subscribed.map((s) => ({ name: s.name, error: message })),
        };
        setLastOutcome(outcome);
        return outcome;
      } finally {
        inFlight.current = false;
        setRefreshing(false);
      }
    },
    [sources, onImport, onSourceResult]
  );

  return { refresh, refreshing, lastOutcome };
}
