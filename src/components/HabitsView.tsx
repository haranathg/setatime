import { useEffect, useMemo, useState } from 'react';
import type { Habit } from '../types';
import { habitStatus, previewVote } from '../hooks/useHabits';
import { generateActivation } from '../services/aiService';

interface HabitsViewProps {
  habits: Habit[];
  onCreate: (input: { name: string; reason: string; activationStep: string; microSteps: string[] }) => Habit;
  onUpdate: (
    id: string,
    updates: Partial<Pick<Habit, 'name' | 'reason' | 'activationStep' | 'microSteps' | 'archived'>>
  ) => void;
  onRecordVote: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function HabitsView({
  habits,
  onCreate,
  onUpdate,
  onRecordVote,
  onArchive,
  onUnarchive,
  onDelete,
}: HabitsViewProps) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [editing, setEditing] = useState<'new' | string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = useMemo(() => habits.filter((h) => !h.archived), [habits]);
  const archived = useMemo(() => habits.filter((h) => h.archived), [habits]);

  const focusHabit = focusId ? habits.find((h) => h.id === focusId) ?? null : null;
  const editHabit =
    editing && editing !== 'new' ? habits.find((h) => h.id === editing) ?? null : null;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">Habits</h2>
          <button
            onClick={() => setEditing('new')}
            className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            + New
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-5">
          One small action. The number is proof, not pressure.
        </p>

        {active.length === 0 ? (
          <EmptyState onAdd={() => setEditing('new')} />
        ) : (
          <ul className="space-y-2">
            {active.map((h) => (
              <HabitRow key={h.id} habit={h} onOpen={() => setFocusId(h.id)} onEdit={() => setEditing(h.id)} />
            ))}
          </ul>
        )}

        {archived.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              {showArchived ? 'Hide' : 'Show'} retired ({archived.length})
            </button>
            {showArchived && (
              <ul className="mt-2 space-y-2">
                {archived.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl opacity-70"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-600 line-through">{h.name}</div>
                      <div className="text-[11px] text-gray-400">{h.votes} votes kept</div>
                    </div>
                    <button
                      onClick={() => onUnarchive(h.id)}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      Bring back
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {focusHabit && (
        <FocusCard
          habit={focusHabit}
          onDone={() => onRecordVote(focusHabit.id)}
          onClose={() => setFocusId(null)}
        />
      )}

      {editing && (
        <HabitModal
          habit={editHabit}
          onSave={(input) => {
            if (editHabit) onUpdate(editHabit.id, input);
            else onCreate(input);
            setEditing(null);
          }}
          onArchive={
            editHabit
              ? () => {
                  onArchive(editHabit.id);
                  setEditing(null);
                }
              : undefined
          }
          onDelete={
            editHabit
              ? () => {
                  if (confirm('Delete this habit and its vote history? This cannot be undone.')) {
                    onDelete(editHabit.id);
                    setEditing(null);
                  }
                }
              : undefined
          }
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center bg-white border border-gray-200 rounded-2xl p-8 mt-2">
      <h3 className="text-base font-semibold text-gray-900 mb-1">Start with one</h3>
      <p className="text-sm text-gray-500 mb-5 leading-relaxed">
        Not a goal. Not a streak to defend. One habit, broken down to the smallest
        physical action you can&rsquo;t say no to.
      </p>
      <button
        onClick={onAdd}
        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
      >
        Add your first habit
      </button>
    </div>
  );
}

function HabitRow({
  habit,
  onOpen,
  onEdit,
}: {
  habit: Habit;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const status = habitStatus(habit);
  // Missed at least a day: the streak is broken but there's history to return to.
  const isReturn = !status.doneToday && status.currentStreak === 0 && habit.log.length > 0;

  return (
    <li className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-stretch">
        <button onClick={onOpen} className="flex-1 text-left px-4 py-3 hover:bg-gray-50 transition-colors">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">{habit.name}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                {status.doneToday ? (
                  <span className="text-green-600 font-medium">Done today</span>
                ) : isReturn ? (
                  <span className="text-amber-600 font-medium">Come back &mdash; smaller this time</span>
                ) : (
                  <span>Tap to start</span>
                )}
                {status.currentStreak > 1 && (
                  <span className="text-gray-400"> &middot; {status.currentStreak}-day run</span>
                )}
                {status.returns > 0 && (
                  <span className="text-gray-400"> &middot; {status.returns} returns</span>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div
                className={`text-2xl font-semibold tabular-nums ${
                  status.doneToday ? 'text-green-600' : 'text-gray-900'
                }`}
              >
                {habit.votes}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-gray-400">votes</div>
            </div>
          </div>
        </button>
        <button
          onClick={onEdit}
          title="Edit"
          className="px-3 flex items-center text-gray-300 hover:text-gray-600 border-l border-gray-100"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      </div>
    </li>
  );
}

// ---------- Doing mode: the Focus card ----------

function FocusCard({
  habit,
  onDone,
  onClose,
}: {
  habit: Habit;
  onDone: () => void;
  onClose: () => void;
}) {
  const status = habitStatus(habit);
  // Coming back from a gap: drop the bar automatically — start at the smallest
  // step there is, not the normal activation step.
  const startAtSmallest =
    !status.doneToday && status.currentStreak === 0 && habit.log.length > 0;

  const steps = [habit.activationStep, ...habit.microSteps].filter(Boolean);
  const [idx, setIdx] = useState(
    startAtSmallest ? Math.max(0, steps.length - 1) : 0
  );
  const [doneResult, setDoneResult] = useState<ReturnType<typeof previewVote> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canGoSmaller = idx < steps.length - 1;
  const current = steps[idx] || habit.activationStep;

  const handleDone = () => {
    setDoneResult(previewVote(habit));
    onDone();
  };

  if (doneResult) {
    const { votes, isReturn, alreadyToday } = doneResult;
    const line = alreadyToday
      ? `Already done today. That still counts. Vote #${votes}.`
      : isReturn
      ? `You came back. That's the hard part — and you just did it. Vote #${votes}.`
      : votes === 1
      ? `Vote #1. The story "I never do this" is now false.`
      : `Vote #${votes}. That's ${votes} times you've proven you can.`;
    return (
      <Overlay onClick={onClose}>
        <div className="text-center max-w-sm px-6">
          <div className="text-5xl mb-6" aria-hidden>
            &#10003;
          </div>
          <p className="text-xl text-white leading-relaxed">{line}</p>
          <button
            onClick={onClose}
            className="mt-8 px-6 py-2.5 text-sm font-medium text-gray-900 bg-white rounded-full hover:bg-gray-100 transition-colors"
          >
            Close
          </button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay>
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-5 right-5 text-white/40 hover:text-white/80 transition-colors"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="text-center max-w-md px-6">
        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-6">
          Just this
        </div>
        <p className="text-3xl sm:text-4xl font-medium text-white leading-snug">{current}</p>

        <button
          onClick={handleDone}
          className="mt-12 w-full max-w-xs mx-auto block px-8 py-4 text-lg font-semibold text-gray-900 bg-white rounded-full hover:bg-gray-100 active:scale-[0.98] transition-all"
        >
          Done
        </button>

        {canGoSmaller && (
          <button
            onClick={() => setIdx((i) => Math.min(i + 1, steps.length - 1))}
            className="mt-5 text-sm text-white/50 hover:text-white/80 transition-colors"
          >
            Still too big &mdash; make it smaller
          </button>
        )}
      </div>
    </Overlay>
  );
}

function Overlay({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900"
    >
      {children}
    </div>
  );
}

// ---------- Planning mode: create / edit ----------

function HabitModal({
  habit,
  onSave,
  onArchive,
  onDelete,
  onCancel,
}: {
  habit: Habit | null;
  onSave: (input: { name: string; reason: string; activationStep: string; microSteps: string[] }) => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(habit?.name ?? '');
  const [reason, setReason] = useState(habit?.reason ?? '');
  const [activationStep, setActivationStep] = useState(habit?.activationStep ?? '');
  const [microStepsText, setMicroStepsText] = useState((habit?.microSteps ?? []).join('\n'));
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');

  const canSave = name.trim().length > 0 && activationStep.trim().length > 0;

  const handleBreakdown = async () => {
    if (!name.trim()) {
      setAiError('Add a habit name first.');
      return;
    }
    setAiBusy(true);
    setAiError('');
    try {
      const res = await generateActivation(name.trim(), reason.trim());
      if (res.activationStep) setActivationStep(res.activationStep);
      if (res.microSteps.length) setMicroStepsText(res.microSteps.join('\n'));
    } catch {
      setAiError('Could not reach the AI. You can still write the step yourself.');
    } finally {
      setAiBusy(false);
    }
  };

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      reason: reason.trim(),
      activationStep: activationStep.trim(),
      microSteps: microStepsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onCancel}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">
            {habit ? 'Edit habit' : 'New habit'}
          </h3>
        </div>

        <div className="px-5 py-4 space-y-4">
          <Field label="Habit">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Move my body"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
          </Field>

          <Field
            label="Because"
            hint="The immediate, concrete reason — set it once here, never re-litigated while doing it."
          >
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. so I don't feel sluggish and stuck"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </Field>

          <div>
            <button
              onClick={handleBreakdown}
              disabled={aiBusy}
              className="w-full px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors"
            >
              {aiBusy ? 'Breaking it down…' : '✦ Break it into the smallest step'}
            </button>
            {aiError && <p className="text-xs text-red-500 mt-1">{aiError}</p>}
          </div>

          <Field
            label="Smallest first action"
            hint="Smaller than you think. The version you can't say no to."
          >
            <input
              value={activationStep}
              onChange={(e) => setActivationStep(e.target.value)}
              placeholder="e.g. put on your running shoes"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </Field>

          <Field
            label="Even smaller (for the worst days)"
            hint="One per line, tiniest first. Shown when you tap 'make it smaller'."
          >
            <textarea
              value={microStepsText}
              onChange={(e) => setMicroStepsText(e.target.value)}
              rows={3}
              placeholder={'sit up in bed\nput one foot on the floor'}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            />
          </Field>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
        </div>

        {(onArchive || onDelete) && (
          <div className="px-5 pb-5 -mt-1 flex items-center justify-between">
            {onArchive && (
              <button
                onClick={onArchive}
                className="text-xs text-gray-500 hover:text-gray-800"
                title="Retire this habit — no penalty, your votes stay"
              >
                Retire (keep votes)
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}
