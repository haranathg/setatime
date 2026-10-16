import { useState } from 'react';
import type { StudySource } from '../types';

// Weekly study that is not a lecture.
//
// Qbanks, Anki and the like never finish and have no due date, so they cannot
// live in the review queue. A weekly target is the honest shape: the planner
// fills a day from what is due first, then tops it up from here.

const dur = (m: number) => (m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 60)}h`);

export default function StudySourcesSheet({
  sources,
  remaining,
  onAdd,
  onUpdate,
  onRemove,
  onSeed,
  onClose,
}: {
  sources: StudySource[];
  remaining: { source: StudySource; remaining: number }[];
  onAdd: (s: Omit<StudySource, 'id'>) => void;
  onUpdate: (id: string, patch: Partial<Omit<StudySource, 'id'>>) => void;
  onRemove: (id: string) => void;
  onSeed: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [hours, setHours] = useState(5);
  const leftOf = (id: string) => remaining.find((r) => r.source.id === id)?.remaining ?? 0;

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
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Weekly study</h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
              Things with no due date — Qbanks, Anki, a textbook. The planner fills
              lectures first, then tops the day up from here.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[11px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 shrink-0"
          >
            Done
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {sources.length === 0 && (
            <div className="text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed">
              Nothing set up yet.
              <button
                onClick={onSeed}
                className="ml-2 px-2 py-0.5 text-[11px] font-semibold rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-400"
              >
                Start with Qbank + Anki
              </button>
            </div>
          )}

          {sources.map((s) => (
            <div
              key={s.id}
              className="rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 space-y-2"
            >
              <div className="flex items-center gap-2">
                <input
                  value={s.name}
                  onChange={(e) => onUpdate(s.id, { name: e.target.value })}
                  className="flex-1 min-w-0 px-2 py-1 text-[13px] font-semibold rounded-lg border border-transparent bg-transparent text-gray-900 dark:text-gray-100 hover:border-gray-200 dark:hover:border-gray-700 focus:outline-none focus:border-indigo-400"
                />
                <button
                  onClick={() => onUpdate(s.id, { active: !s.active })}
                  className={`px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded-lg border transition-colors ${
                    s.active
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                      : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {s.active ? 'On' : 'Off'}
                </button>
                <button
                  onClick={() => onRemove(s.id)}
                  className="text-[10px] uppercase tracking-wider font-bold text-gray-300 dark:text-gray-600 hover:text-red-500 shrink-0"
                >
                  Remove
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
                    Per week
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={+(s.minutesPerWeek / 60).toFixed(1)}
                    onChange={(e) =>
                      onUpdate(s.id, { minutesPerWeek: Math.max(0, Math.round(Number(e.target.value) * 60)) })
                    }
                    className="w-16 px-2 py-1 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">h</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
                    Sitting
                  </span>
                  <input
                    type="number"
                    min={15}
                    step={15}
                    value={s.sessionMinutes ?? 60}
                    onChange={(e) =>
                      onUpdate(s.id, { sessionMinutes: Math.max(15, Math.round(Number(e.target.value))) })
                    }
                    className="w-16 px-2 py-1 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">m</span>
                </label>
                {s.active && (
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 ml-auto">
                    {leftOf(s.id) > 0 ? `${dur(leftOf(s.id))} left this week` : 'done this week'}
                  </span>
                )}
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2 pt-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Add — e.g. Sketchy"
              className="flex-1 min-w-0 px-2 py-1.5 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="number"
              min={0}
              step={0.5}
              value={hours}
              onChange={(e) => setHours(Math.max(0, Number(e.target.value)))}
              className="w-16 px-2 py-1.5 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-[11px] text-gray-500 dark:text-gray-400">h/wk</span>
            <button
              onClick={() => {
                if (!name.trim()) return;
                onAdd({
                  name: name.trim(),
                  minutesPerWeek: Math.round(hours * 60),
                  sessionMinutes: 60,
                  active: true,
                });
                setName('');
              }}
              disabled={!name.trim()}
              className="px-2.5 py-1.5 text-[12px] font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
