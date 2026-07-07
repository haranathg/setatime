import { useMemo, useState } from 'react';
import type { Thought, ThoughtStatus, BrainDumpTask } from '../types';

// Unified Log surface: absorbs the Inbox (thoughts needing triage) and the
// Hold (tasks waiting to be scheduled) into one screen. Two sections:
//
//   Triage — freshly captured thoughts and any resurfaced future ones.
//            Actions: Now (mark as active) · Later (move to Held) ·
//            Future (surface again on a date) · Discard.
//
//   Held   — tasks waiting to be scheduled onto the calendar. Actions:
//            Schedule (jump to calendar prefilled) · Delete.
//
// This is a UI-only merge — the Inbox and BrainDump slices are still
// separate under the hood. A future PR could unify the data models into a
// single LogItem type; for now the reduced surface area covers the ~90%
// case (triage + schedule) without churn.

interface LogViewProps {
  // Inbox side
  thoughts: Thought[];
  onTriage: (id: string, status: ThoughtStatus, futureSurfaceDate?: string) => void;
  onDeleteThought: (id: string) => void;
  onSendThoughtToHold: (label: string) => void;
  // Hold side
  heldTasks: BrainDumpTask[];
  onScheduleHeldTask: (task: BrainDumpTask) => void;
  onDeleteHeldTask: (id: string) => void;
}

const FUTURE_PRESETS: { label: string; days: number }[] = [
  { label: '1 week', days: 7 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
];

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysKey(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function LogView({
  thoughts,
  onTriage,
  onDeleteThought,
  onSendThoughtToHold,
  heldTasks,
  onScheduleHeldTask,
  onDeleteHeldTask,
}: LogViewProps) {
  // Triage bucket: inbox status OR future-surfacing today.
  const triageThoughts = useMemo(() => {
    const today = todayKey();
    return thoughts
      .filter(
        (t) =>
          t.status === 'inbox' ||
          (t.status === 'future' && !!t.futureSurfaceDate && t.futureSurfaceDate <= today)
      )
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  }, [thoughts]);

  const heldSorted = useMemo(
    () => [...heldTasks].sort((a, b) => b.extractedAt.localeCompare(a.extractedAt)),
    [heldTasks]
  );

  return (
    <div className="flex-1 overflow-y-auto bg-[#fbfaf7]">
      <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
        <header>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">Log</h1>
          <p className="text-sm text-gray-500 mt-1 leading-snug">
            Capture, triage, schedule. Everything flows through here.
          </p>
        </header>

        <TriageSection
          thoughts={triageThoughts}
          onTriage={onTriage}
          onDelete={onDeleteThought}
          onSendToHold={onSendThoughtToHold}
        />

        <HeldSection
          tasks={heldSorted}
          onSchedule={onScheduleHeldTask}
          onDelete={onDeleteHeldTask}
        />
      </div>
    </div>
  );
}

// ---------- Triage section ----------

function TriageSection({
  thoughts,
  onTriage,
  onDelete,
  onSendToHold,
}: {
  thoughts: Thought[];
  onTriage: (id: string, status: ThoughtStatus, futureSurfaceDate?: string) => void;
  onDelete: (id: string) => void;
  onSendToHold: (label: string) => void;
}) {
  return (
    <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <header className="px-4 py-2 border-b border-gray-100 flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold text-gray-800">Triage</h2>
        <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">
          {thoughts.length === 0 ? 'Nothing to decide on' : `${thoughts.length} to sort`}
        </span>
      </header>
      {thoughts.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-gray-500 leading-relaxed">
          Everything caught in the header capture bar shows up here. Sort it into <b>Later</b> to
          hold, <b>Future</b> to surface it again on a date, or <b>Discard</b>.
        </div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {thoughts.map((t) => (
            <TriageRow
              key={t.id}
              thought={t}
              onTriage={onTriage}
              onDelete={onDelete}
              onSendToHold={onSendToHold}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function TriageRow({
  thought,
  onTriage,
  onDelete,
  onSendToHold,
}: {
  thought: Thought;
  onTriage: (id: string, status: ThoughtStatus, futureSurfaceDate?: string) => void;
  onDelete: (id: string) => void;
  onSendToHold: (label: string) => void;
}) {
  const [showFuture, setShowFuture] = useState(false);
  const [customDate, setCustomDate] = useState<string>('');

  const commitFuture = (dateKey: string) => {
    onTriage(thought.id, 'future', dateKey);
    setShowFuture(false);
    setCustomDate('');
  };

  return (
    <li className="px-4 py-2.5">
      <div className="text-sm text-gray-900 leading-snug">{thought.text}</div>
      <div className="text-[10px] text-gray-400 mt-0.5">{relativeTime(thought.capturedAt)}</div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => {
            // MOVE, not copy: promote to Hold, then discard from Triage in
            // the same click. Prevents duplicate Hold entries from
            // accidental double-taps and keeps the Triage list tight.
            onSendToHold(thought.text);
            onTriage(thought.id, 'discarded');
          }}
          className="px-2 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors"
          title="Move this thought into the Hold so you can schedule it later"
        >
          → Hold
        </button>
        <button
          onClick={() => onTriage(thought.id, 'now')}
          className="px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-white border border-emerald-200 hover:bg-emerald-50 rounded-md transition-colors"
          title="Mark as active now"
        >
          Now
        </button>
        <button
          onClick={() => setShowFuture(!showFuture)}
          className="px-2 py-1 text-[11px] font-semibold text-sky-700 bg-white border border-sky-200 hover:bg-sky-50 rounded-md transition-colors"
          title="Resurface this thought on a future date"
        >
          Future ↓
        </button>
        <button
          onClick={() => onTriage(thought.id, 'discarded')}
          className="px-2 py-1 text-[11px] font-semibold text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 rounded-md transition-colors"
          title="Discard — kept in history, hidden from triage"
        >
          Discard
        </button>
        <button
          onClick={() => {
            if (confirm('Delete this thought permanently?')) onDelete(thought.id);
          }}
          className="ml-auto text-[14px] leading-none text-gray-300 hover:text-red-500 px-1.5"
          title="Delete permanently"
        >
          &times;
        </button>
      </div>
      {showFuture && (
        <div className="mt-2 px-3 py-2 bg-sky-50 border border-sky-100 rounded-lg">
          <div className="text-[10px] uppercase tracking-wider font-bold text-sky-700 mb-1.5">
            Resurface in…
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FUTURE_PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => commitFuture(addDaysKey(p.days))}
                className="px-2.5 py-1 text-[11px] font-semibold text-sky-800 bg-white border border-sky-200 hover:bg-sky-50 rounded-md transition-colors"
              >
                {p.label}
              </button>
            ))}
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="px-2 py-1 text-[11px] font-mono border border-sky-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400"
              />
              <button
                onClick={() => customDate && commitFuture(customDate)}
                disabled={!customDate}
                className="px-2 py-1 text-[11px] font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:bg-gray-200 disabled:cursor-not-allowed rounded-md transition-colors"
              >
                Set
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

// ---------- Held section ----------

function HeldSection({
  tasks,
  onSchedule,
  onDelete,
}: {
  tasks: BrainDumpTask[];
  onSchedule: (task: BrainDumpTask) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <header className="px-4 py-2 border-b border-gray-100 flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold text-gray-800">Held</h2>
        <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">
          {tasks.length === 0 ? 'Empty' : `${tasks.length} waiting`}
        </span>
      </header>
      {tasks.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-gray-500 leading-relaxed">
          Tasks you've committed to but not yet scheduled show up here. Move a triage thought to{' '}
          <b>Hold</b> or send a plan task from the Chart to see it queued.
        </div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {tasks.map((t) => (
            <HeldRow key={t.id} task={t} onSchedule={onSchedule} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </section>
  );
}

function HeldRow({
  task,
  onSchedule,
  onDelete,
}: {
  task: BrainDumpTask;
  onSchedule: (task: BrainDumpTask) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <li className="px-4 py-2.5 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900 truncate">{task.label}</div>
        <div className="text-[10px] text-gray-400 mt-0.5">{relativeTime(task.extractedAt)}</div>
      </div>
      {task.priority && (
        <span className="flex-shrink-0 text-[9px] uppercase tracking-wider font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-1.5 py-0.5">
          {task.priority.replace('-', ' ')}
        </span>
      )}
      <button
        onClick={() => onSchedule(task)}
        className="flex-shrink-0 px-2.5 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors"
        title="Jump to the calendar with this task pre-filled"
      >
        ↳ Schedule
      </button>
      <button
        onClick={() => {
          if (confirm(`Delete "${task.label}"?`)) onDelete(task.id);
        }}
        className="flex-shrink-0 text-[14px] leading-none text-gray-300 hover:text-red-500 px-1.5"
        title="Delete from Hold"
      >
        &times;
      </button>
    </li>
  );
}
