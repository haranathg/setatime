import { useEffect, useMemo, useState } from 'react';
import type { TaskBlock, SubTask } from '../types';
import { formatTime24to12 } from '../utils/dateHelpers';

interface NowNextBarProps {
  blocks: TaskBlock[];
  onJumpToToday: () => void;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function effectiveCompleted(sub: SubTask): boolean {
  if (sub.steps && sub.steps.length > 0) return sub.steps.every((s) => s.done);
  return sub.completed;
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Renders a thin always-on strip showing what to do "now" and what's "next".
// Persists across every tab (chart, books, inbox, etc.) so the user keeps the
// day's plan in their peripheral vision regardless of where they are.
//
// Selection logic:
//   - Current block = the block whose timeline range contains "now" today.
//   - Next item = the next not-yet-completed sub-task inside the current block,
//     or the next upcoming block's mainTask if there is no current block.
//   - If nothing today applies, the bar collapses to a short "nothing scheduled" hint.
export default function NowNextBar({ blocks, onJumpToToday }: NowNextBarProps) {
  // Tick once a minute so "now" stays accurate without a heavier effect.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const view = useMemo(() => {
    const now = new Date();
    const todayKey = localDateKey(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();

    // Collect every block whose footprint touches today (own date today, OR a
    // sub-task with date = today carried over from yesterday).
    const todays = blocks.filter(
      (b) => b.date === todayKey || b.subTasks.some((s) => s.date === todayKey)
    );
    if (todays.length === 0) return { kind: 'empty' as const };

    type Slot = { block: TaskBlock; startMin: number; endMin: number; subs: SubTask[] };
    const slots: Slot[] = todays.map((block) => {
      const subs = block.subTasks.filter(
        (s) => !s.date || s.date === todayKey || (block.date === todayKey && !s.date)
      );
      const subTimes = subs.map((s) => timeToMinutes(s.time));
      const startMin = block.date === todayKey ? timeToMinutes(block.mainTime) : Math.min(...subTimes, 24 * 60);
      const endMin = subTimes.length ? Math.max(...subTimes) + 15 : startMin + 60;
      return { block, startMin, endMin, subs };
    });
    slots.sort((a, b) => a.startMin - b.startMin);

    // Pick the latest slot whose start <= now and bounded end > now (bounded by
    // the next slot's start so back-to-back blocks transition cleanly).
    let currentIdx = -1;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const next = slots[i + 1];
      const blockEnd = next ? Math.min(s.endMin, next.startMin) : s.endMin;
      if (s.startMin <= nowMin && nowMin < blockEnd) currentIdx = i;
    }

    if (currentIdx >= 0) {
      const slot = slots[currentIdx];
      // Next item = first not-done sub-task at time >= now (or any not-done sub
      // if the user is mid-block and behind).
      const pendingSubs = slot.subs.filter((s) => !effectiveCompleted(s));
      const upcomingSub = pendingSubs.find((s) => timeToMinutes(s.time) >= nowMin) || pendingSubs[0];
      return {
        kind: 'current' as const,
        block: slot.block,
        nextSub: upcomingSub || null,
        nowMin,
      };
    }

    // No current block — look ahead for the next upcoming block today.
    const next = slots.find((s) => s.startMin > nowMin);
    if (next) {
      const firstPending = next.subs
        .slice()
        .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))
        .find((s) => !effectiveCompleted(s));
      return {
        kind: 'upcoming' as const,
        block: next.block,
        nextSub: firstPending || null,
        nowMin,
      };
    }

    return { kind: 'done' as const };
  }, [blocks]);

  if (view.kind === 'empty') return null;

  if (view.kind === 'done') {
    return (
      <button
        onClick={onJumpToToday}
        className="w-full px-4 py-1.5 bg-emerald-50 border-b border-emerald-200 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100 transition-colors flex items-center justify-between"
      >
        <span>All today's blocks are wrapped — you're good.</span>
        <span className="text-[10px] uppercase tracking-wider text-emerald-700">Today ›</span>
      </button>
    );
  }

  const isCurrent = view.kind === 'current';
  const block = view.block;
  const nextSub = view.nextSub;
  const minsTo = (sub: SubTask) => {
    const at = timeToMinutes(sub.time);
    return at - view.nowMin;
  };

  return (
    <button
      onClick={onJumpToToday}
      className={`w-full px-4 py-1.5 border-b transition-colors flex items-center gap-3 text-left ${
        isCurrent
          ? 'bg-indigo-600 border-indigo-700 text-white hover:bg-indigo-700'
          : 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100'
      }`}
      title="Tap to open Today"
    >
      <span
        className={`flex-shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${
          isCurrent ? 'bg-white/15 text-white' : 'bg-amber-200 text-amber-900'
        }`}
      >
        {isCurrent ? 'Now' : 'Next'}
      </span>
      <span className="flex-1 min-w-0 truncate text-[12px] font-semibold">
        {block.mainTask}
        <span className={`ml-2 text-[10px] font-mono font-normal ${isCurrent ? 'text-white/70' : 'text-amber-700'}`}>
          {formatTime24to12(block.mainTime)}
        </span>
      </span>
      {nextSub && (
        <span className={`flex-shrink-0 max-w-[40%] truncate text-[11px] font-mono ${isCurrent ? 'text-white/85' : 'text-amber-800'}`}>
          → {nextSub.label}
          <span className={`ml-1.5 ${isCurrent ? 'text-white/60' : 'text-amber-600'}`}>
            {(() => {
              const m = minsTo(nextSub);
              if (m <= 0) return 'now';
              if (m < 60) return `in ${m}m`;
              const h = Math.floor(m / 60);
              const r = m % 60;
              return r ? `in ${h}h${r}m` : `in ${h}h`;
            })()}
          </span>
        </span>
      )}
      <span className={`hidden sm:inline-block flex-shrink-0 text-[9px] uppercase tracking-wider ${isCurrent ? 'text-white/60' : 'text-amber-600'}`}>
        Today ›
      </span>
    </button>
  );
}
