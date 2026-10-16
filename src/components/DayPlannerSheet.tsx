import { useMemo, useState } from 'react';
import type { LectureItem, TaskBlock } from '../types';
import {
  planDay,
  planToBlocks,
  busyFromBlocks,
  sittingMinutes,
  hhmm,
  DEFAULTS,
} from '../utils/dayPlanner';
import { formatTime24to12 } from '../utils/dateHelpers';

// Turning the backlog into a day you can start.
//
// It previews before it writes. Blocks land in a real calendar the user
// already keeps, so "generate" is not a free action — seeing the sittings
// first is what makes it safe to press.

const toMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const dur = (mins: number): string => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
};

export default function DayPlannerSheet({
  queue,
  blocks,
  dateKey,
  dateLabel,
  onAdd,
  onClose,
}: {
  /** Already sorted most-overdue-first by the lectures hook. */
  queue: LectureItem[];
  blocks: TaskBlock[];
  dateKey: string;
  dateLabel: string;
  onAdd: (blocks: TaskBlock[]) => void;
  onClose: () => void;
}) {
  const [from, setFrom] = useState('11:00');
  const [to, setTo] = useState('22:00');
  const [studyHours, setStudyHours] = useState(3);
  const [session, setSession] = useState(DEFAULTS.sessionMinutes);
  const [added, setAdded] = useState(false);

  const busy = useMemo(() => busyFromBlocks(blocks, dateKey), [blocks, dateKey]);

  const queueMinutes = useMemo(
    () => queue.reduce((m, i) => m + sittingMinutes(i), 0),
    [queue]
  );

  const plan = useMemo(
    () =>
      planDay(queue, {
        windowStart: toMin(from),
        windowEnd: toMin(to),
        studyMinutes: Math.round(studyHours * 60),
        sessionMinutes: session,
        breakMinutes: DEFAULTS.breakMinutes,
        busy,
      }),
    [queue, from, to, studyHours, session, busy]
  );

  const commit = () => {
    onAdd(planToBlocks(plan, dateKey, '#4f46e5'));
    setAdded(true);
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
              Plan {dateLabel}
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
              Built from what is actually due, so each sitting names its lecture
              and which pass it is.
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
          {queue.length === 0 ? (
            <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-relaxed">
              Nothing is due. The planner builds a day out of the review queue, so
              there is nothing for it to place — import a schedule, or come back
              when a lecture comes up for its next pass.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
                    From
                  </span>
                  <input
                    type="time"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="mt-1 w-full px-2 py-1.5 text-[13px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
                    Until
                  </span>
                  <input
                    type="time"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="mt-1 w-full px-2 py-1.5 text-[13px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </label>
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
                  Study
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {[1.5, 2, 3, 4, 5].map((h) => (
                    <button
                      key={h}
                      onClick={() => setStudyHours(h)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors ${
                        studyHours === h
                          ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400'
                      }`}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
                  Sitting length
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {[45, 60, 90, 120].map((m) => (
                    <button
                      key={m}
                      onClick={() => setSession(m)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors ${
                        session === m
                          ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400'
                      }`}
                    >
                      {m}m
                    </button>
                  ))}
                  <span className="self-center text-[10px] text-gray-400 dark:text-gray-500 ml-1">
                    {DEFAULTS.breakMinutes}m break between
                  </span>
                </div>
              </div>

              {busy.length > 0 && (
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Working around {busy.length} thing{busy.length === 1 ? '' : 's'} already
                  on {dateLabel.toLowerCase()}.
                </p>
              )}

              <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1.5">
                  {plan.sessions.length === 0 ? 'Nothing fits' : 'The day'}
                </div>
                {plan.sessions.length === 0 ? (
                  <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed">
                    That window has no room once your commitments are taken out. Widen
                    it, or ask for less.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {plan.sessions.map((s) => (
                      <li
                        key={s.start}
                        className="rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[12px] font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                            {formatTime24to12(hhmm(s.start))} – {formatTime24to12(hhmm(s.end))}
                          </span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
                            {dur(s.end - s.start)}
                          </span>
                        </div>
                        <ul className="mt-1 space-y-0.5">
                          {s.items.map((i, n) => (
                            <li
                              key={`${i.lectureId}-${n}`}
                              className="text-[12px] text-gray-700 dark:text-gray-300 leading-snug"
                            >
                              {i.title}
                              {i.pass && (
                                <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                                  {' '}· pass {i.pass}
                                </span>
                              )}
                              {i.overdueDays > 0 && (
                                <span className="text-amber-600 dark:text-amber-400">
                                  {' '}· {i.overdueDays}d overdue
                                </span>
                              )}
                              <span className="text-gray-400 dark:text-gray-500">
                                {' '}· {dur(i.minutes)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}

                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                  {dur(plan.placedMinutes)} placed
                  {plan.unplacedMinutes > 0 && ` · ${dur(plan.unplacedMinutes)} would not fit`}
                  {queueMinutes > plan.placedMinutes &&
                    ` · ${dur(queueMinutes - plan.placedMinutes)} still in the queue after today`}
                  .
                </p>
              </div>
            </>
          )}
        </div>

        <footer className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {added ? 'Added — drag anything that does not fit your day.' : 'Nothing is written until you add it.'}
          </span>
          <button
            onClick={commit}
            disabled={plan.sessions.length === 0 || added}
            className="px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {added ? 'Added' : `Add ${plan.sessions.length} block${plan.sessions.length === 1 ? '' : 's'}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
