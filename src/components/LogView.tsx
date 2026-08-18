import { useMemo, useState } from 'react';
import type { Thought, ThoughtStatus, BrainDumpTask, Project } from '../types';
import { ProjectPicker } from './ProjectChip';

// Log surface — Hold is the pile, Triage is the mode for clearing it.
//
// Prior versions had two triage stages (Inbox thoughts → Hold tasks); as of
// the consolidation PR Inbox is retired and everything ✎ Log-captured lands
// in Hold directly. LogView now shows Hold plus a one-tap "🎴 Triage"
// launcher that opens the batch card-based clearing surface.
//
// The legacy Triage (thoughts) section is kept in code for safety in case
// a very old install has un-migrated items — it only renders if there
// happen to be inbox-status thoughts present.

interface LogViewProps {
  // Legacy inbox side — usually empty post-migration; kept as a safety net
  // for un-migrated data during the first few opens after upgrading.
  thoughts: Thought[];
  onTriage: (id: string, status: ThoughtStatus, futureSurfaceDate?: string) => void;
  onDeleteThought: (id: string) => void;
  onSendThoughtToHold: (label: string) => void;
  // Hold side — the pile
  heldTasks: BrainDumpTask[];
  onScheduleHeldTask: (task: BrainDumpTask) => void;
  onDeleteHeldTask: (id: string) => void;
  // Launches the batch Triage view (card-based clearing)
  onOpenBatchTriage: () => void;
  // Active projects, so a held task can be filed under one without
  // leaving the pile. Empty list hides the picker entirely.
  projects: Project[];
  onSetHeldTaskProject: (taskId: string, projectId: string | undefined) => void;
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
  projects,
  onSetHeldTaskProject,
  onScheduleHeldTask,
  onDeleteHeldTask,
  onOpenBatchTriage,
}: LogViewProps) {
  // Legacy triage bucket: inbox status OR future-surfacing today. Should
  // be empty after the one-time migration on the App shell; kept as a
  // safety net for un-migrated data.
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
    <div className="flex-1 overflow-y-auto bg-[#fbfaf7] dark:bg-[#171614]">
      <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
        <header className="flex items-baseline justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">Log</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-snug">
              Your Hold — everything you've captured. Batch-clear with Triage.
            </p>
          </div>
          <button
            onClick={onOpenBatchTriage}
            disabled={heldSorted.length === 0}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-800 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100 disabled:opacity-40 disabled:cursor-not-allowed"
            title={heldSorted.length === 0 ? 'Hold is empty — nothing to triage' : 'Clear the Hold one card at a time'}
          >
            🎴 Triage
            {heldSorted.length > 0 && (
              <span className="text-[10px] font-bold bg-white/70 border border-amber-200 dark:border-amber-800 rounded-full px-1.5 py-0.5 tabular-nums">
                {heldSorted.length}
              </span>
            )}
          </button>
        </header>

        {/* Legacy Triage section — only renders if there are un-migrated
            inbox thoughts sitting around. Post-migration this stays hidden. */}
        {triageThoughts.length > 0 && (
          <TriageSection
            thoughts={triageThoughts}
            onTriage={onTriage}
            onDelete={onDeleteThought}
            onSendToHold={onSendThoughtToHold}
          />
        )}

        <HeldSection
          tasks={heldSorted}
          onSchedule={onScheduleHeldTask}
          onDelete={onDeleteHeldTask}
          projects={projects}
          onSetProject={onSetHeldTaskProject}
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
    <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
      <header className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">Triage</h2>
        <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
          {thoughts.length === 0 ? 'Nothing to decide on' : `${thoughts.length} to sort`}
        </span>
      </header>
      {thoughts.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed">
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
      <div className="text-sm text-gray-900 dark:text-gray-100 leading-snug">{thought.text}</div>
      <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{relativeTime(thought.capturedAt)}</div>
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
          className="px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-white dark:bg-gray-900 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/40 dark:bg-emerald-950/40 rounded-md transition-colors"
          title="Mark as active now"
        >
          Now
        </button>
        <button
          onClick={() => setShowFuture(!showFuture)}
          className="px-2 py-1 text-[11px] font-semibold text-sky-700 dark:text-sky-300 bg-white dark:bg-gray-900 border border-sky-200 dark:border-sky-800 hover:bg-sky-50 dark:hover:bg-sky-900/40 dark:bg-sky-950/40 rounded-md transition-colors"
          title="Resurface this thought on a future date"
        >
          Future ↓
        </button>
        <button
          onClick={() => onTriage(thought.id, 'discarded')}
          className="px-2 py-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-950 rounded-md transition-colors"
          title="Discard — kept in history, hidden from triage"
        >
          Discard
        </button>
        <button
          onClick={() => {
            if (confirm('Delete this thought permanently?')) onDelete(thought.id);
          }}
          className="ml-auto text-[14px] leading-none text-gray-300 dark:text-gray-600 hover:text-red-500 dark:text-red-400 px-1.5"
          title="Delete permanently"
        >
          &times;
        </button>
      </div>
      {showFuture && (
        <div className="mt-2 px-3 py-2 bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900 rounded-lg">
          <div className="text-[10px] uppercase tracking-wider font-bold text-sky-700 dark:text-sky-300 mb-1.5">
            Resurface in…
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FUTURE_PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => commitFuture(addDaysKey(p.days))}
                className="px-2.5 py-1 text-[11px] font-semibold text-sky-800 dark:text-sky-200 bg-white dark:bg-gray-900 border border-sky-200 dark:border-sky-800 hover:bg-sky-50 dark:hover:bg-sky-900/40 dark:bg-sky-950/40 rounded-md transition-colors"
              >
                {p.label}
              </button>
            ))}
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="px-2 py-1 text-[11px] font-mono border border-sky-200 dark:border-sky-800 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400"
              />
              <button
                onClick={() => customDate && commitFuture(customDate)}
                disabled={!customDate}
                className="px-2 py-1 text-[11px] font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:bg-gray-200 dark:bg-gray-800 disabled:cursor-not-allowed rounded-md transition-colors"
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
  projects,
  onSetProject,
}: {
  tasks: BrainDumpTask[];
  onSchedule: (task: BrainDumpTask) => void;
  onDelete: (id: string) => void;
  projects: Project[];
  onSetProject: (taskId: string, projectId: string | undefined) => void;
}) {
  return (
    <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
      <header className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">Held</h2>
        <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
          {tasks.length === 0 ? 'Empty' : `${tasks.length} waiting`}
        </span>
      </header>
      {tasks.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed">
          Tasks you've committed to but not yet scheduled show up here. Move a triage thought to{' '}
          <b>Hold</b> or send a plan task from the Chart to see it queued.
        </div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {tasks.map((t) => (
            <HeldRow
              key={t.id}
              task={t}
              onSchedule={onSchedule}
              onDelete={onDelete}
              projects={projects}
              onSetProject={onSetProject}
            />
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
  projects,
  onSetProject,
}: {
  task: BrainDumpTask;
  onSchedule: (task: BrainDumpTask) => void;
  onDelete: (id: string) => void;
  projects: Project[];
  onSetProject: (taskId: string, projectId: string | undefined) => void;
}) {
  return (
    <li className="px-4 py-2.5 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900 dark:text-gray-100 truncate">{task.label}</div>
        <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{relativeTime(task.extractedAt)}</div>
      </div>
      {task.priority && (
        <span className="flex-shrink-0 text-[9px] uppercase tracking-wider font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-full px-1.5 py-0.5">
          {task.priority.replace('-', ' ')}
        </span>
      )}
      <ProjectPicker
        projects={projects}
        value={task.projectId}
        onChange={(projectId) => onSetProject(task.id, projectId)}
      />
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
        className="flex-shrink-0 text-[14px] leading-none text-gray-300 dark:text-gray-600 hover:text-red-500 dark:text-red-400 px-1.5"
        title="Delete from Hold"
      >
        &times;
      </button>
    </li>
  );
}
