import { useEffect, useMemo, useState } from 'react';
import type { TaskBlock, SubTask } from '../types';
import { formatTime24to12, formatFullDate } from '../utils/dateHelpers';

interface TodayViewProps {
  todaysBlocks: TaskBlock[];
  onToggleSubTask: (blockId: string, subTaskId: string) => void;
  onSwitchToCalendar: () => void;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function currentMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

interface BlockState {
  block: TaskBlock;
  startMin: number;
  endMin: number;
  status: 'past' | 'current' | 'upcoming';
  todaySubTasks: SubTask[];
  doneCount: number;
}

export default function TodayView({ todaysBlocks, onToggleSubTask, onSwitchToCalendar }: TodayViewProps) {
  // Re-render every minute so 'current' / 'past' / 'upcoming' stays accurate.
  // The tick state value isn't read; setTick just forces a re-render.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const now = currentMinutes(today);

  const states: BlockState[] = useMemo(() => {
    // Pick the subtasks that belong to today, regardless of which block they came from.
    // Cross-midnight subtasks may live on a block dated yesterday but have date=today.
    const enriched = todaysBlocks.map<BlockState>((block) => {
      const todaySubTasks = block.subTasks.filter(
        (s) => !s.date || s.date === todayKey || (block.date === todayKey && !s.date)
      );
      // The block's "today timeline footprint": min start, max end (relative to today).
      const subTimes = todaySubTasks.map((s) => timeToMinutes(s.time));
      const startMin = block.date === todayKey ? timeToMinutes(block.mainTime) : Math.min(...subTimes, 24 * 60);
      const endMin = subTimes.length ? Math.max(...subTimes) + 15 : startMin + 60;
      const doneCount = todaySubTasks.filter((s) => s.completed).length;
      return { block, startMin, endMin, status: 'upcoming', todaySubTasks, doneCount };
    });
    enriched.sort((a, b) => a.startMin - b.startMin);

    // current = latest block whose start <= now AND end > now (or, if no end, just start <= now)
    let currentIdx = -1;
    for (let i = 0; i < enriched.length; i++) {
      const e = enriched[i];
      const next = enriched[i + 1];
      const blockEnd = next ? Math.min(e.endMin, next.startMin) : e.endMin;
      if (e.startMin <= now && now < blockEnd) {
        currentIdx = i;
      }
    }

    for (let i = 0; i < enriched.length; i++) {
      if (i === currentIdx) enriched[i].status = 'current';
      else if (enriched[i].endMin <= now || (currentIdx >= 0 && i < currentIdx)) enriched[i].status = 'past';
      else enriched[i].status = 'upcoming';
    }
    return enriched;
  }, [todaysBlocks, todayKey, now]);

  const current = states.find((s) => s.status === 'current') || null;
  const upcoming = states.filter((s) => s.status === 'upcoming');
  const past = states.filter((s) => s.status === 'past');
  const nextUp = upcoming[0] || null;

  const totalSubTasks = states.reduce((sum, s) => sum + s.todaySubTasks.length, 0);
  const doneSubTasks = states.reduce((sum, s) => sum + s.doneCount, 0);

  if (states.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Header today={today} doneSubTasks={0} totalSubTasks={0} />
          <div className="mt-8 text-center py-16 px-4 border-2 border-dashed border-gray-200 rounded-2xl bg-white">
            <p className="text-base font-semibold text-gray-700">Nothing scheduled for today</p>
            <p className="text-sm text-gray-500 mt-2 mb-4">Add a block in the calendar to start tracking your progress here.</p>
            <button
              onClick={onSwitchToCalendar}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
            >
              Open Calendar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        <Header today={today} doneSubTasks={doneSubTasks} totalSubTasks={totalSubTasks} />

        {/* Now pin */}
        {current ? (
          <BlockCard
            state={current}
            variant="now"
            now={now}
            onToggleSubTask={onToggleSubTask}
          />
        ) : nextUp ? (
          <UpNextCard state={nextUp} now={now} />
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 text-center">
            <p className="text-sm font-semibold text-gray-700">You're done for the day ✓</p>
            <p className="text-xs text-gray-500 mt-1">No upcoming blocks left.</p>
          </div>
        )}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <Section title="Up next">
            {upcoming.map((s) => (
              <BlockCard
                key={s.block.id}
                state={s}
                variant="upcoming"
                now={now}
                onToggleSubTask={onToggleSubTask}
              />
            ))}
          </Section>
        )}

        {/* Past */}
        {past.length > 0 && (
          <Section title="Earlier today">
            {past.map((s) => (
              <BlockCard
                key={s.block.id}
                state={s}
                variant="past"
                now={now}
                onToggleSubTask={onToggleSubTask}
              />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

// ---------- Top header ----------

function Header({ today, doneSubTasks, totalSubTasks }: { today: Date; doneSubTasks: number; totalSubTasks: number }) {
  const pct = totalSubTasks > 0 ? Math.round((doneSubTasks / totalSubTasks) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Today</h1>
        {totalSubTasks > 0 && (
          <span className="text-xs text-gray-500 font-mono">
            {doneSubTasks}/{totalSubTasks} done · {pct}%
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 mt-1">{formatFullDate(today)}</p>
      {totalSubTasks > 0 && (
        <div className="mt-3 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ---------- Section wrapper ----------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 px-1">{title}</h2>
      {children}
    </div>
  );
}

// ---------- Block card (now / upcoming / past) ----------

function BlockCard({
  state,
  variant,
  now,
  onToggleSubTask,
}: {
  state: BlockState;
  variant: 'now' | 'upcoming' | 'past';
  now: number;
  onToggleSubTask: (blockId: string, subTaskId: string) => void;
}) {
  const { block, todaySubTasks, doneCount } = state;
  const total = todaySubTasks.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const containerClass =
    variant === 'now'
      ? 'bg-white border-2 border-indigo-500 ring-4 ring-indigo-100 shadow-lg'
      : variant === 'past'
      ? 'bg-gray-50 border border-gray-200 opacity-70'
      : 'bg-white border border-gray-200 shadow-sm';

  const nextSub = variant === 'now' ? nextUncheckedFrom(todaySubTasks, now) : null;

  return (
    <div className={`rounded-2xl overflow-hidden transition-all ${containerClass}`}>
      {/* Header row */}
      <div className={`px-4 pt-4 pb-3 ${variant === 'now' ? 'bg-indigo-50/40' : ''}`}>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {variant === 'now' && (
            <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold text-white bg-indigo-600 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> Now
            </span>
          )}
          {variant === 'past' && (
            <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold text-gray-500 bg-gray-200 rounded-full">
              Earlier
            </span>
          )}
          <span className={`text-xs font-mono ${variant === 'now' ? 'text-indigo-700' : 'text-gray-500'}`}>
            {formatTime24to12(block.mainTime)}
          </span>
          {total > 0 && (
            <span className="ml-auto text-xs text-gray-500 font-mono tabular-nums">
              {doneCount}/{total}
            </span>
          )}
        </div>
        <h3 className={`text-lg font-semibold leading-tight ${variant === 'past' && pct === 100 ? 'line-through text-gray-500' : 'text-gray-900'}`}>
          {block.mainTask}
        </h3>
        {total > 0 && (
          <div className={`mt-3 h-1.5 rounded-full overflow-hidden ${variant === 'now' ? 'bg-indigo-100' : 'bg-gray-100'}`}>
            <div
              className={`h-full transition-all duration-300 ${variant === 'now' ? 'bg-indigo-600' : variant === 'past' ? 'bg-gray-400' : 'bg-indigo-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      {/* Subtasks */}
      {total > 0 && (
        <div className="px-2 pb-2">
          {todaySubTasks
            .slice()
            .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))
            .map((sub) => (
              <SubTaskCheckRow
                key={sub.id}
                subTask={sub}
                isNext={nextSub?.id === sub.id}
                onToggle={() => onToggleSubTask(block.id, sub.id)}
              />
            ))}
        </div>
      )}
      {total === 0 && (
        <div className="px-4 pb-4 -mt-1 text-xs text-gray-400 italic">No subtasks for today.</div>
      )}
    </div>
  );
}

function nextUncheckedFrom(subs: SubTask[], now: number): SubTask | null {
  const sorted = [...subs].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  // Prefer the next uncompleted subtask whose time >= now-5 (close-to-now or ahead).
  return sorted.find((s) => !s.completed && timeToMinutes(s.time) >= now - 5) || null;
}

// ---------- Subtask row with big tap target ----------

function SubTaskCheckRow({
  subTask,
  isNext,
  onToggle,
}: {
  subTask: SubTask;
  isNext: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors ${
        isNext
          ? 'bg-amber-50 hover:bg-amber-100'
          : subTask.completed
          ? 'hover:bg-gray-50'
          : 'hover:bg-gray-50'
      }`}
    >
      <span
        className={`flex-shrink-0 w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-colors ${
          subTask.completed
            ? 'bg-indigo-600 border-indigo-600'
            : isNext
            ? 'border-amber-500 bg-white'
            : 'border-gray-300 bg-white'
        }`}
      >
        {subTask.completed && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      <span className={`text-xs font-medium px-2 py-0.5 rounded font-mono min-w-[60px] text-center tabular-nums ${
        isNext ? 'bg-amber-200 text-amber-800' : subTask.completed ? 'bg-gray-100 text-gray-400' : 'bg-indigo-50 text-indigo-700'
      }`}>
        {formatTime24to12(subTask.time)}
      </span>
      <span className={`flex-1 text-base leading-snug ${
        subTask.completed ? 'line-through text-gray-400' : 'text-gray-900'
      }`}>
        {subTask.label}
      </span>
      {isNext && !subTask.completed && (
        <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700">Next</span>
      )}
    </button>
  );
}

// ---------- Up next card (when nothing is currently active) ----------

function UpNextCard({ state, now }: { state: BlockState; now: number }) {
  const minsAway = state.startMin - now;
  const label =
    minsAway <= 0
      ? 'Starting now'
      : minsAway < 60
      ? `in ${minsAway} min`
      : `in ${Math.floor(minsAway / 60)}h ${minsAway % 60}m`;
  return (
    <div className="bg-white border-2 border-dashed border-indigo-300 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold text-indigo-700 bg-indigo-100 rounded-full">
          Up next
        </span>
        <span className="text-xs font-mono text-indigo-700">
          {formatTime24to12(state.block.mainTime)} · {label}
        </span>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 leading-tight">{state.block.mainTask}</h3>
      {state.todaySubTasks.length > 0 && (
        <p className="text-xs text-gray-500 mt-2">
          {state.todaySubTasks.length} subtask{state.todaySubTasks.length === 1 ? '' : 's'} planned
        </p>
      )}
    </div>
  );
}
