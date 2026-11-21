import type { GardenNudge } from '../hooks/useGarden';
import { dayKey } from '../utils/gardenGrowth';
import { useBranchColors } from '../utils/gardenPalette';

interface Props {
  nudge: GardenNudge | null;
  loading: boolean;
  weekCount: number;
  onDone: () => void;
  onAnother: () => void;
  compact?: boolean;
}

// Turns the tree's thinnest branch into one concrete thing to do now. Copy
// stays encouraging on purpose: the point is a next step, not a scorecard.
export default function GardenNudgeCard({ nudge, loading, weekCount, onDone, onAnother, compact }: Props) {
  const colorOf = useBranchColors();
  if (!nudge && !loading) return null;
  const color = nudge ? colorOf(nudge.domain).bg : '#16a34a';
  const doneToday = nudge?.doneDay === dayKey();

  if (compact) {
    if (!nudge) return null;
    return (
      <div className="mt-2 flex items-center gap-2 text-xs">
        <span aria-hidden>💧</span>
        <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-gray-200">
          <span className="font-semibold" style={{ color }}>{nudge.domain}</span>
          {doneToday ? ' got watered today' : <>: {nudge.action}</>}
        </span>
        {!doneToday && (
          <button
            onClick={onDone}
            className="flex-shrink-0 px-2 py-0.5 rounded-md font-semibold text-white bg-green-600 hover:bg-green-700"
          >
            Did it
          </button>
        )}
      </div>
    );
  }

  return (
    <section
      className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm p-4 border-l-4"
      style={{ borderLeftColor: color }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        💧 Thirsty branch this week
      </div>
      {!nudge ? (
        <p className="mt-1.5 text-sm text-gray-400 dark:text-gray-500 animate-pulse">Finding a two-minute step…</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            <span className="font-semibold" style={{ color }}>{nudge.domain}</span>
            {weekCount === 0
              ? ' hasn’t had a log in the last 7 days.'
              : ` has had just ${weekCount} ${weekCount === 1 ? 'log' : 'logs'} in the last 7 days.`}
          </p>
          {doneToday ? (
            <p className="mt-2 text-base font-semibold text-gray-900 dark:text-gray-100">
              Watered today ✓ <span className="font-normal text-gray-500 dark:text-gray-400">— a new leaf is on the tree.</span>
            </p>
          ) : (
            <>
              {nudge.goalId && nudge.sub && (
                <p className="mt-2 text-xs font-semibold" style={{ color }}>★ For your goal: {nudge.sub}</p>
              )}
              <p className={`${nudge.goalId ? 'mt-0.5' : 'mt-2'} text-base font-semibold text-gray-900 dark:text-gray-100 ${loading ? 'opacity-50' : ''}`}>
                {nudge.action}
              </p>
            </>
          )}
          <div className="mt-3 flex items-center gap-2">
            {!doneToday && (
              <button
                onClick={onDone}
                disabled={loading}
                className="px-3 py-1.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50"
              >
                Did it ✓
              </button>
            )}
            <button
              onClick={onAnother}
              disabled={loading}
              className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg disabled:opacity-50"
            >
              {loading ? 'Thinking…' : doneToday ? 'One more?' : 'Another idea'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
