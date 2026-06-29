import { useEffect, useMemo, useState } from 'react';
import type { TaskBlock, SubTask, SubStep, Pin, PredictionEntry, BasicIndicator, IndicatorMode } from '../types';
import { formatTime24to12, formatFullDate } from '../utils/dateHelpers';
import { isCheckedToday } from '../hooks/usePins';
import type { IndicatorView } from '../hooks/useDashboard';

interface TodayViewProps {
  todaysBlocks: TaskBlock[];
  onToggleSubTask: (blockId: string, subTaskId: string) => void;
  onToggleSubStep: (blockId: string, subTaskId: string, stepId: string) => void;
  onSwitchToCalendar: () => void;
  pins: Pin[];
  onAddPin: (label: string) => void;
  onTogglePin: (id: string) => void;
  onEditPin: (id: string, label: string) => void;
  onRemovePin: (id: string) => void;
  overduePredictions: PredictionEntry[];
  onReflectPrediction: (id: string) => void;
  // Car-dashboard tiles
  dashboardIndicators: BasicIndicator[];
  dashboardViews: IndicatorView[];
  onLogIndicator: (id: string) => void;
  onUndoLastIndicatorLog: (id: string) => void;
  onToggleIndicatorEnabled: (id: string) => void;
  onAddCustomIndicator: (input: {
    name: string;
    icon: string;
    mode: IndicatorMode;
    hint?: string;
    dailyTarget?: number;
    warnAfterMinutes?: number;
    urgentAfterMinutes?: number;
    warnAfterHourOfDay?: number;
    urgentAfterHourOfDay?: number;
  }) => BasicIndicator;
  onRemoveIndicator: (id: string) => void;
  onPushIndicatorToDump: (label: string) => void;
}

function effectiveCompleted(sub: SubTask): boolean {
  if (sub.steps && sub.steps.length > 0) return sub.steps.every((st) => st.done);
  return sub.completed;
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

export default function TodayView({
  todaysBlocks,
  onToggleSubTask,
  onToggleSubStep,
  onSwitchToCalendar,
  pins,
  onAddPin,
  onTogglePin,
  onEditPin,
  onRemovePin,
  overduePredictions,
  onReflectPrediction,
  dashboardIndicators,
  dashboardViews,
  onLogIndicator,
  onUndoLastIndicatorLog,
  onToggleIndicatorEnabled,
  onAddCustomIndicator,
  onRemoveIndicator,
  onPushIndicatorToDump,
}: TodayViewProps) {
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
      const doneCount = todaySubTasks.filter(effectiveCompleted).length;
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
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
          <Header today={today} doneSubTasks={0} totalSubTasks={0} />
          <BasicsDashboard
            indicators={dashboardIndicators}
            views={dashboardViews}
            onLog={onLogIndicator}
            onUndoLast={onUndoLastIndicatorLog}
            onToggle={onToggleIndicatorEnabled}
            onAddCustom={onAddCustomIndicator}
            onRemove={onRemoveIndicator}
            onPushToDump={onPushIndicatorToDump}
          />
          <OverduePredictionsStrip
            overdue={overduePredictions}
            onReflect={onReflectPrediction}
          />
          <PinsStrip
            pins={pins}
            onAddPin={onAddPin}
            onTogglePin={onTogglePin}
            onEditPin={onEditPin}
            onRemovePin={onRemovePin}
          />
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

        <BasicsDashboard
          indicators={dashboardIndicators}
          views={dashboardViews}
          onLog={onLogIndicator}
          onUndoLast={onUndoLastIndicatorLog}
          onToggle={onToggleIndicatorEnabled}
          onAddCustom={onAddCustomIndicator}
          onRemove={onRemoveIndicator}
          onPushToDump={onPushIndicatorToDump}
        />

        <OverduePredictionsStrip
          overdue={overduePredictions}
          onReflect={onReflectPrediction}
        />

        <PinsStrip
          pins={pins}
          onAddPin={onAddPin}
          onTogglePin={onTogglePin}
          onEditPin={onEditPin}
          onRemovePin={onRemovePin}
        />

        {/* Now pin */}
        {current ? (
          <BlockCard
            state={current}
            variant="now"
            now={now}
            onToggleSubTask={onToggleSubTask}
            onToggleSubStep={onToggleSubStep}
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
                onToggleSubStep={onToggleSubStep}
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
                onToggleSubStep={onToggleSubStep}
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
  onToggleSubStep,
}: {
  state: BlockState;
  variant: 'now' | 'upcoming' | 'past';
  now: number;
  onToggleSubTask: (blockId: string, subTaskId: string) => void;
  onToggleSubStep: (blockId: string, subTaskId: string, stepId: string) => void;
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
                onToggleStep={(stepId) => onToggleSubStep(block.id, sub.id, stepId)}
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
  // Prefer the next not-yet-effectively-done subtask whose time >= now-5 (close-to-now or ahead).
  return sorted.find((s) => !effectiveCompleted(s) && timeToMinutes(s.time) >= now - 5) || null;
}

// ---------- Subtask row with big tap target ----------

function SubTaskCheckRow({
  subTask,
  isNext,
  onToggle,
  onToggleStep,
}: {
  subTask: SubTask;
  isNext: boolean;
  onToggle: () => void;
  onToggleStep: (stepId: string) => void;
}) {
  const done = effectiveCompleted(subTask);
  const hasSteps = !!subTask.steps && subTask.steps.length > 0;
  const stepsDone = hasSteps ? subTask.steps!.filter((s) => s.done).length : 0;
  const stepsTotal = hasSteps ? subTask.steps!.length : 0;
  return (
    <div>
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors ${
          isNext ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50'
        }`}
      >
        <span
          className={`flex-shrink-0 w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-colors ${
            done
              ? 'bg-indigo-600 border-indigo-600'
              : isNext
              ? 'border-amber-500 bg-white'
              : 'border-gray-300 bg-white'
          }`}
        >
          {done && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded font-mono min-w-[60px] text-center tabular-nums ${
          isNext ? 'bg-amber-200 text-amber-800' : done ? 'bg-gray-100 text-gray-400' : 'bg-indigo-50 text-indigo-700'
        }`}>
          {formatTime24to12(subTask.time)}
        </span>
        <span className={`flex-1 text-base leading-snug ${
          done ? 'line-through text-gray-400' : 'text-gray-900'
        }`}>
          {subTask.label}
        </span>
        {hasSteps && (
          <span className="text-[10px] font-mono tabular-nums text-gray-500 px-1.5 py-0.5 bg-gray-100 rounded">
            {stepsDone}/{stepsTotal}
          </span>
        )}
        {isNext && !done && (
          <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700">Next</span>
        )}
      </button>
      {hasSteps && (
        <div className="ml-8 pl-3 my-1 border-l-2 border-gray-200 space-y-0.5">
          {subTask.steps!.map((step) => (
            <StepRow key={step.id} step={step} parentDone={done} onToggle={() => onToggleStep(step.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function StepRow({
  step,
  parentDone,
  onToggle,
}: {
  step: SubStep;
  parentDone: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-left hover:bg-gray-50 transition-colors"
    >
      <span
        className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
          step.done ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300 bg-white'
        }`}
      >
        {step.done && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      <span className={`flex-1 text-sm leading-snug ${
        step.done || parentDone ? 'line-through text-gray-400' : 'text-gray-800'
      }`}>
        {step.label}
      </span>
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

// "Don't forget" pinned strip. Friction-free todos with daily reset — a sticky
// note on the fridge. Checked state is derived from `lastCheckedAt`'s local
// date matching today's, so unchecked items resurface every morning without
// the user touching anything.
function PinsStrip({
  pins,
  onAddPin,
  onTogglePin,
  onEditPin,
  onRemovePin,
}: {
  pins: Pin[];
  onAddPin: (label: string) => void;
  onTogglePin: (id: string) => void;
  onEditPin: (id: string, label: string) => void;
  onRemovePin: (id: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const submit = () => {
    const t = draft.trim();
    if (!t) return;
    onAddPin(t);
    setDraft('');
  };

  const startEdit = (p: Pin) => {
    setEditingId(p.id);
    setEditDraft(p.label);
  };

  const commitEdit = () => {
    if (editingId) {
      const t = editDraft.trim();
      if (t) onEditPin(editingId, t);
    }
    setEditingId(null);
    setEditDraft('');
  };

  const total = pins.length;
  const doneCount = pins.filter((p) => isCheckedToday(p)).length;

  return (
    <section className="bg-white border-2 border-amber-300 rounded-2xl shadow-sm overflow-hidden">
      <header className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">📌</span>
          <h3 className="text-[13px] font-semibold text-amber-900">Don't forget</h3>
        </div>
        <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700">
          {total === 0 ? 'Pin friction-free todos' : `${doneCount}/${total} today`}
        </span>
      </header>
      {pins.length > 0 && (
        <ul className="divide-y divide-amber-100">
          {pins.map((p) => {
            const checked = isCheckedToday(p);
            return (
              <li key={p.id} className="flex items-center gap-2 px-3 py-1.5">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onTogglePin(p.id)}
                  className="w-4 h-4 accent-amber-500 flex-shrink-0"
                  title={checked ? 'Done for today — uncheck to undo' : 'Mark done for today'}
                />
                {editingId === p.id ? (
                  <input
                    type="text"
                    autoFocus
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit();
                      if (e.key === 'Escape') { setEditingId(null); setEditDraft(''); }
                    }}
                    className="flex-1 min-w-0 px-2 py-0.5 text-sm border border-amber-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                ) : (
                  <button
                    onClick={() => startEdit(p)}
                    className={`flex-1 min-w-0 text-left text-sm truncate ${
                      checked ? 'line-through text-gray-400' : 'text-gray-900'
                    }`}
                    title="Click to edit"
                  >
                    {p.label}
                  </button>
                )}
                <button
                  onClick={() => onRemovePin(p.id)}
                  className="flex-shrink-0 text-gray-300 hover:text-red-500 text-base leading-none px-1"
                  title="Remove pin"
                >
                  &times;
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="px-3 py-2 border-t border-amber-100 bg-amber-50/40 flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder='e.g. "take vitamins", "reply to mom"'
          className="flex-1 min-w-0 px-2 py-1 text-sm border border-amber-200 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder:text-amber-400"
        />
        <button
          onClick={submit}
          disabled={!draft.trim()}
          className="px-3 py-1 text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:bg-amber-200 disabled:cursor-not-allowed rounded-md transition-colors"
        >
          Pin
        </button>
      </div>
      {pins.length === 0 && (
        <div className="px-4 pb-3 text-[11px] text-amber-700 leading-snug">
          Friction-free todos that just need to be in sight: vitamins, refills, the email you keep forgetting. Resets every morning so you see them again.
        </div>
      )}
    </section>
  );
}

// Overdue Prediction-Lab reflections surfaced on Today. Closes the calibration
// loop visibly so unreflected predictions don't quietly die. Tapping a row
// jumps to the Lab's reflection wizard for that specific entry.
function OverduePredictionsStrip({
  overdue,
  onReflect,
}: {
  overdue: PredictionEntry[];
  onReflect: (id: string) => void;
}) {
  if (overdue.length === 0) return null;
  return (
    <section className="bg-white border-2 border-indigo-300 rounded-2xl shadow-sm overflow-hidden">
      <header className="px-4 py-2 bg-indigo-50 border-b border-indigo-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🔍</span>
          <h3 className="text-[13px] font-semibold text-indigo-900">Close the loop</h3>
        </div>
        <span className="text-[10px] uppercase tracking-wider font-bold text-indigo-700">
          {overdue.length} prediction{overdue.length === 1 ? '' : 's'} ready to reflect on
        </span>
      </header>
      <ul className="divide-y divide-indigo-50">
        {overdue.slice(0, 5).map((e) => (
          <li key={e.id}>
            <button
              onClick={() => onReflect(e.id)}
              className="w-full text-left px-3 py-2 hover:bg-indigo-50/60 transition-colors flex items-center gap-3"
            >
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-gray-900 truncate">{e.prediction}</span>
                <span className="block text-[10px] text-gray-500 mt-0.5">
                  Predicted {formatRelativeDays(e.createdAt)} · {e.confidence}% confidence
                </span>
              </span>
              <span className="flex-shrink-0 text-[10px] uppercase tracking-wider font-bold text-indigo-700">
                Reflect ›
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatRelativeDays(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

// ---------- Car-dashboard tiles ----------
//
// Iconified daily basics. Tap to log. Tiles flow green → amber → red+pulse
// the longer they go unlogged; in amber/red an ↗ shortcut appears to push
// the indicator into the BrainDump as an urgent task so it gets done.
function BasicsDashboard({
  indicators,
  views,
  onLog,
  onUndoLast,
  onToggle,
  onAddCustom,
  onRemove,
  onPushToDump,
}: {
  indicators: BasicIndicator[];
  views: IndicatorView[];
  onLog: (id: string) => void;
  onUndoLast: (id: string) => void;
  onToggle: (id: string) => void;
  onAddCustom: TodayViewProps['onAddCustomIndicator'];
  onRemove: (id: string) => void;
  onPushToDump: (label: string) => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Disabled indicators don't appear in `views` — render only the live tiles.
  if (views.length === 0 && !settingsOpen) {
    return (
      <section className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
        <header className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-gray-800">Daily basics</h3>
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-[11px] uppercase tracking-wider text-gray-400 hover:text-gray-700"
          >
            ⚙ Configure
          </button>
        </header>
        <p className="text-[11px] text-gray-500 mt-2">
          No active indicators. Open settings to turn on hydration, meals, exercise, sleep, etc.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <header className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-gray-800">Daily basics</h3>
        <button
          onClick={() => setSettingsOpen(true)}
          className="text-[10px] uppercase tracking-wider text-gray-400 hover:text-gray-700"
          title="Manage indicators"
        >
          ⚙
        </button>
      </header>
      <div className="grid grid-cols-3 gap-2 p-3">
        {views.map((v) => (
          <IndicatorTile
            key={v.indicator.id}
            view={v}
            onLog={() => onLog(v.indicator.id)}
            onUndoLast={() => onUndoLast(v.indicator.id)}
            onPushToDump={() => onPushToDump(`Log ${v.indicator.name.toLowerCase()}`)}
          />
        ))}
      </div>
      {settingsOpen && (
        <IndicatorSettingsModal
          indicators={indicators}
          onToggle={onToggle}
          onAddCustom={onAddCustom}
          onRemove={onRemove}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </section>
  );
}

const STATE_STYLES: Record<IndicatorView['state'], string> = {
  cold: 'bg-gray-50 border-gray-200 text-gray-500',
  green: 'bg-emerald-50 border-emerald-300 text-emerald-800',
  amber: 'bg-amber-50 border-amber-300 text-amber-800',
  red: 'bg-red-50 border-red-300 text-red-800 animate-pulse',
};

function IndicatorTile({
  view,
  onLog,
  onUndoLast,
  onPushToDump,
}: {
  view: IndicatorView;
  onLog: () => void;
  onUndoLast: () => void;
  onPushToDump: () => void;
}) {
  const { indicator: ind, state, todayCount, minutesSinceLast } = view;
  const sub = (() => {
    if (ind.mode === 'counter') {
      const target = ind.dailyTarget ? `/${ind.dailyTarget}` : '';
      return `${todayCount}${target}`;
    }
    return todayCount > 0 ? 'Done today' : 'Not yet';
  })();
  const microLine = (() => {
    if (ind.mode === 'counter' && minutesSinceLast != null) {
      if (minutesSinceLast < 60) return `${minutesSinceLast}m ago`;
      const h = Math.floor(minutesSinceLast / 60);
      const m = minutesSinceLast % 60;
      return m === 0 ? `${h}h ago` : `${h}h${m}m ago`;
    }
    if (ind.mode === 'counter' && minutesSinceLast == null) return 'Not yet today';
    return null;
  })();

  const showEscalation = state === 'amber' || state === 'red';

  return (
    <div className="relative">
      <button
        onClick={onLog}
        className={`w-full aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-0.5 px-1 transition-colors ${STATE_STYLES[state]}`}
        title={ind.hint || ind.name}
      >
        <div className="text-2xl leading-none">{ind.icon}</div>
        <div className="text-[11px] font-semibold leading-tight">{ind.name}</div>
        <div className="text-[10px] font-mono leading-tight">{sub}</div>
        {microLine && <div className="text-[9px] opacity-70 leading-tight">{microLine}</div>}
      </button>
      {todayCount > 0 && (
        <button
          onClick={onUndoLast}
          className="absolute top-1 left-1 text-[10px] leading-none w-5 h-5 rounded-full bg-white/80 backdrop-blur border border-gray-200 text-gray-400 hover:text-red-500 transition-colors"
          title="Undo last log"
        >
          ↩
        </button>
      )}
      {showEscalation && (
        <button
          onClick={onPushToDump}
          className="absolute top-1 right-1 text-[10px] uppercase tracking-wider font-bold leading-none px-1.5 py-1 rounded-md bg-white border border-current shadow-sm hover:bg-red-500 hover:text-white transition-colors"
          title="Push as an urgent task to the dump"
        >
          ↗
        </button>
      )}
    </div>
  );
}

function IndicatorSettingsModal({
  indicators,
  onToggle,
  onAddCustom,
  onRemove,
  onClose,
}: {
  indicators: BasicIndicator[];
  onToggle: (id: string) => void;
  onAddCustom: TodayViewProps['onAddCustomIndicator'];
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('⚪');
  const [mode, setMode] = useState<IndicatorMode>('daily');
  const [warnH, setWarnH] = useState(20);
  const [urgentH, setUrgentH] = useState(23);
  const [warnM, setWarnM] = useState(180);
  const [urgentM, setUrgentM] = useState(300);
  const [target, setTarget] = useState(8);

  const submit = () => {
    if (!name.trim()) return;
    onAddCustom({
      name: name.trim(),
      icon: icon.trim() || '⚪',
      mode,
      ...(mode === 'daily'
        ? { warnAfterHourOfDay: warnH, urgentAfterHourOfDay: urgentH }
        : {
            warnAfterMinutes: warnM,
            urgentAfterMinutes: urgentM,
            dailyTarget: target,
          }),
    });
    setName('');
    setIcon('⚪');
    setShowAdd(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Daily basics</h3>
          <button
            onClick={onClose}
            className="text-xl leading-none text-gray-400 hover:text-gray-700"
          >
            &times;
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <ul className="divide-y divide-gray-100">
            {indicators.map((ind) => (
              <li key={ind.id} className="py-2 flex items-center gap-3">
                <span className="text-xl">{ind.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">{ind.name}</div>
                  {ind.hint && (
                    <div className="text-[10px] text-gray-500 truncate">{ind.hint}</div>
                  )}
                </div>
                <button
                  onClick={() => onToggle(ind.id)}
                  className={`w-10 h-6 rounded-full border-2 transition-colors flex items-center ${
                    ind.enabled
                      ? 'bg-indigo-600 border-indigo-600 justify-end'
                      : 'bg-white border-gray-300 justify-start'
                  }`}
                  title={ind.enabled ? 'Disable' : 'Enable'}
                >
                  <span className="w-4 h-4 bg-white rounded-full shadow-sm mx-0.5" />
                </button>
                {!ind.preset && (
                  <button
                    onClick={() => {
                      if (confirm(`Remove ${ind.name}? Its history will be cleared.`)) {
                        onRemove(ind.id);
                      }
                    }}
                    className="text-[16px] leading-none text-gray-300 hover:text-red-500"
                    title="Remove custom indicator"
                  >
                    &times;
                  </button>
                )}
              </li>
            ))}
          </ul>

          {showAdd ? (
            <div className="border-t border-gray-100 pt-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
                Add custom indicator
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value.slice(0, 4))}
                  placeholder="🔆"
                  className="w-14 px-2 py-2 text-center text-xl border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name (e.g. Sunlight)"
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setMode('daily')}
                  className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                    mode === 'daily'
                      ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                      : 'bg-white border-gray-200 text-gray-700'
                  }`}
                >
                  Once a day
                </button>
                <button
                  onClick={() => setMode('counter')}
                  className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                    mode === 'counter'
                      ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                      : 'bg-white border-gray-200 text-gray-700'
                  }`}
                >
                  Multi-tap with target
                </button>
              </div>
              {mode === 'daily' ? (
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] uppercase tracking-wider text-gray-500">
                    Amber after (hour)
                    <input
                      type="number"
                      min={0}
                      max={24}
                      value={warnH}
                      onChange={(e) => setWarnH(Number(e.target.value))}
                      className="w-full mt-1 px-2 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </label>
                  <label className="text-[10px] uppercase tracking-wider text-gray-500">
                    Red after (hour)
                    <input
                      type="number"
                      min={0}
                      max={26}
                      value={urgentH}
                      onChange={(e) => setUrgentH(Number(e.target.value))}
                      className="w-full mt-1 px-2 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </label>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <label className="text-[10px] uppercase tracking-wider text-gray-500">
                    Target/day
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={target}
                      onChange={(e) => setTarget(Number(e.target.value))}
                      className="w-full mt-1 px-2 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </label>
                  <label className="text-[10px] uppercase tracking-wider text-gray-500">
                    Amber (min)
                    <input
                      type="number"
                      min={1}
                      max={1440}
                      value={warnM}
                      onChange={(e) => setWarnM(Number(e.target.value))}
                      className="w-full mt-1 px-2 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </label>
                  <label className="text-[10px] uppercase tracking-wider text-gray-500">
                    Red (min)
                    <input
                      type="number"
                      min={1}
                      max={1440}
                      value={urgentM}
                      onChange={(e) => setUrgentM(Number(e.target.value))}
                      className="w-full mt-1 px-2 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </label>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={submit}
                  disabled={!name.trim()}
                  className="flex-1 px-3 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  Add indicator
                </button>
                <button
                  onClick={() => setShowAdd(false)}
                  className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="w-full px-3 py-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700 border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-lg transition-colors"
            >
              + Add custom indicator
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
