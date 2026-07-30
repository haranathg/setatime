import { useEffect, useMemo, useState } from 'react';
import type { BrainDumpTask } from '../types';

// Batch Triage session — one card at a time.
//
// Why one at a time: seeing 10,000 dump items triggers prioritization
// collapse (Barkley: interest-driven brains genuinely can't rank across
// a big set under load). This surface manufactures small manageable
// urgency instead — one card, one-tap decision, next card. Turns
// triage from a chore that never ends into a single deliberate move.
//
// Actions per item:
//   ⚡ Do now       → launches Underway for this task, 2 min default
//   📌 Pin today    → adds a pin so it surfaces on Today's pins strip
//   ⏳ Someday      → hides from the main dump (tags with triage='someday')
//   ✕ Drop         → deletes
//   → Skip         → next card, no change
//
// Wraps with a small "here's what you did" summary + Done.

interface TriageViewProps {
  tasks: BrainDumpTask[];               // active dump tasks (already filtered by parent)
  onDoNow: (task: BrainDumpTask) => void;
  onPinToday: (task: BrainDumpTask) => void;
  onSetSomeday: (id: string) => void;
  onDelete: (id: string) => void;
  onDone: () => void;
}

type Action = 'do-now' | 'pin' | 'someday' | 'drop' | 'skip';

export default function TriageView({
  tasks,
  onDoNow,
  onPinToday,
  onSetSomeday,
  onDelete,
  onDone,
}: TriageViewProps) {
  // Snapshot the dump ONCE on mount — aged tasks first, then rest by
  // extraction time. This keeps the deck stable during the session even
  // if handlers mutate the underlying list; makes progress deterministic.
  const deck = useMemo(() => {
    const AGED_MS = 5 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const enriched = tasks.map((t) => ({
      task: t,
      age: now - new Date(t.extractedAt).getTime(),
    }));
    enriched.sort((a, b) => {
      const aAged = a.age >= AGED_MS ? 1 : 0;
      const bAged = b.age >= AGED_MS ? 1 : 0;
      if (aAged !== bAged) return bAged - aAged;   // aged first
      return b.age - a.age;                        // older within group first
    });
    return enriched.map((e) => e.task);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [index, setIndex] = useState(0);
  const [counts, setCounts] = useState({
    doNow: 0, pin: 0, someday: 0, dropped: 0, skipped: 0,
  });

  const current = deck[index];
  const total = deck.length;
  const remaining = Math.max(0, total - index);

  const advance = (action: Action) => {
    setCounts((c) => ({
      doNow: c.doNow + (action === 'do-now' ? 1 : 0),
      pin: c.pin + (action === 'pin' ? 1 : 0),
      someday: c.someday + (action === 'someday' ? 1 : 0),
      dropped: c.dropped + (action === 'drop' ? 1 : 0),
      skipped: c.skipped + (action === 'skip' ? 1 : 0),
    }));
    setIndex((i) => i + 1);
  };

  const doNow = () => {
    if (!current) return;
    // Do-now leaves the app for Underway. The session record is enough;
    // no further advance is needed here because we exit the view.
    onDoNow(current);
  };
  const pinToday = () => {
    if (!current) return;
    onPinToday(current);
    advance('pin');
  };
  const someday = () => {
    if (!current) return;
    onSetSomeday(current.id);
    advance('someday');
  };
  const drop = () => {
    if (!current) return;
    onDelete(current.id);
    advance('drop');
  };
  const skip = () => {
    if (!current) return;
    advance('skip');
  };

  // Keyboard shortcuts — batch triage is fastest without leaving the
  // keyboard. Numbers mirror the visual order of the buttons; space
  // is "advance" (skip), escape exits. Ignore keys while an input has
  // focus so we don't hijack typing (Triage doesn't have any inputs
  // right now, but this keeps us future-proof).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return; // don't steal browser chords
      switch (e.key) {
        case '1':      e.preventDefault(); doNow();     break;
        case '2':      e.preventDefault(); pinToday();  break;
        case '3':      e.preventDefault(); someday();   break;
        case '4':      e.preventDefault(); drop();      break;
        case ' ':      e.preventDefault(); skip();      break;
        case 'Escape': e.preventDefault(); onDone();    break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // Handlers close over `current`; re-bind when it changes so we act
    // on the visible card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, onDone]);

  // Empty state — no tasks in the dump to triage
  if (total === 0) {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-md mx-auto px-4 py-10 text-center space-y-4">
          <div className="text-4xl">🎴</div>
          <h2 className="text-lg font-semibold text-gray-900">Nothing to triage</h2>
          <p className="text-sm text-gray-600">
            Your dump is empty. That's the goal — enjoy it.
          </p>
          <button
            onClick={onDone}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // Wrap state — reached the end of the deck
  if (index >= total) {
    const moved = counts.doNow + counts.pin + counts.someday + counts.dropped;
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-md mx-auto px-4 py-10 text-center space-y-5">
          <div className="text-5xl">✅</div>
          <h2 className="text-lg font-semibold text-gray-900">
            Triage done — {moved} moved
          </h2>
          <div className="grid grid-cols-2 gap-2 text-left">
            {counts.pin > 0 && (
              <StatTile label="Pinned today" value={counts.pin} color="indigo" />
            )}
            {counts.someday > 0 && (
              <StatTile label="Someday" value={counts.someday} color="slate" />
            )}
            {counts.dropped > 0 && (
              <StatTile label="Dropped" value={counts.dropped} color="rose" />
            )}
            {counts.skipped > 0 && (
              <StatTile label="Skipped" value={counts.skipped} color="gray" />
            )}
            {counts.doNow > 0 && (
              <StatTile label="Doing now" value={counts.doNow} color="emerald" />
            )}
          </div>
          <button
            onClick={onDone}
            className="w-full py-3 rounded-2xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const ageDays = Math.floor((Date.now() - new Date(current.extractedAt).getTime()) / (24 * 60 * 60 * 1000));
  const isAged = ageDays >= 5;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-5 space-y-4">
        {/* Header — progress + exit */}
        <div className="flex items-center justify-between">
          <button
            onClick={onDone}
            className="text-[11px] text-gray-500 hover:text-gray-800"
          >
            ← Exit
          </button>
          <div className="text-[11px] text-gray-500 tabular-nums font-mono">
            {index + 1} / {total}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-all"
            style={{ width: `${(index / total) * 100}%` }}
          />
        </div>

        {/* The card — big, single item, plenty of breathing room */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 min-h-[10rem] flex flex-col justify-center">
          {isAged && (
            <div className="inline-block self-start text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 mb-3">
              aged · {ageDays} days
            </div>
          )}
          <div className="text-lg font-semibold text-gray-900 leading-snug">
            {current.label}
          </div>
          <div className="text-[11px] text-gray-400 mt-2">
            {remaining === 1 ? 'last one' : `${remaining - 1} more after this`}
          </div>
        </div>

        {/* Primary action — Do now. Ships you straight into Underway. */}
        <button
          onClick={doNow}
          className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-base font-bold tracking-tight"
        >
          ⚡ Do now — 2 min
        </button>

        {/* Secondary actions — two rows of 2 */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={pinToday}
            className="px-3 py-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 text-sm font-semibold flex items-center justify-center gap-1.5"
          >
            <span>📌</span> Pin today
          </button>
          <button
            onClick={someday}
            className="px-3 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 text-sm font-semibold flex items-center justify-center gap-1.5"
          >
            <span>⏳</span> Someday
          </button>
          <button
            onClick={drop}
            className="px-3 py-3 rounded-xl bg-white hover:bg-rose-50 border border-gray-200 text-rose-600 text-sm font-semibold flex items-center justify-center gap-1.5"
          >
            <span>✕</span> Drop
          </button>
          <button
            onClick={skip}
            className="px-3 py-3 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-sm font-semibold flex items-center justify-center gap-1.5"
          >
            <span>→</span> Skip
          </button>
        </div>

        <p className="text-[11px] text-gray-400 text-center">
          One card at a time. Every decision counts — Skip is fine.
        </p>
        <p className="text-[10px] text-gray-400 text-center font-mono tabular-nums">
          keys: <kbd className="px-1 border border-gray-200 rounded bg-white">1</kbd> do ·
          <kbd className="px-1 border border-gray-200 rounded bg-white ml-1">2</kbd> pin ·
          <kbd className="px-1 border border-gray-200 rounded bg-white ml-1">3</kbd> someday ·
          <kbd className="px-1 border border-gray-200 rounded bg-white ml-1">4</kbd> drop ·
          <kbd className="px-1 border border-gray-200 rounded bg-white ml-1">space</kbd> skip ·
          <kbd className="px-1 border border-gray-200 rounded bg-white ml-1">esc</kbd> exit
        </p>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'indigo' | 'slate' | 'rose' | 'gray' | 'emerald';
}) {
  const tone: Record<typeof color, string> = {
    indigo:  'bg-indigo-50 text-indigo-900 border-indigo-200',
    slate:   'bg-slate-100 text-slate-800 border-slate-200',
    rose:    'bg-rose-50 text-rose-800 border-rose-200',
    gray:    'bg-white text-gray-700 border-gray-200',
    emerald: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  };
  return (
    <div className={`rounded-xl border px-3 py-2 ${tone[color]}`}>
      <div className="text-[10px] uppercase tracking-wider font-bold opacity-80">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
