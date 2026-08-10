import { useEffect, useMemo, useState } from 'react';
import type {
  TaskBlock,
  SubTask,
  SubStep,
  Pin,
  PredictionEntry,
  BasicIndicator,
  IndicatorMode,
  SpiralCadence,
  SpiralSchedule,
  NorthStar,
  BrainDumpTask,
  StateLogEntry,
  EnergyLevel,
  EnergyDirection,
  DailyPlanTask,
  DailyPlanSize,
  WeekBoardItem,
} from '../types';
import { effectiveEnergy, DAILY_PLAN_CAPS } from '../types';
import { formatTime24to12, formatFullDate } from '../utils/dateHelpers';
import { isCheckedToday } from '../hooks/usePins';
import type { IndicatorView } from '../hooks/useDashboard';
import { colorFor } from '../hooks/useNorthStars';
import { IndicatorIcon } from './IndicatorIcons';

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
  // Upward Spirals (formerly "daily basics")
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
  onSetCadence: (id: string, cadence: SpiralCadence, daysOfWeek?: number[]) => void;
  onSetSchedule: (id: string, schedule: SpiralSchedule | null) => void;
  onSetPause: (id: string, until: string | null | undefined) => void;
  // North Stars
  northStars: NorthStar[];
  onOpenStar: (id: string) => void;
  onOpenAllStars: () => void;
  onToggleIndicatorStar: (indicatorId: string, starId: string) => void;
  // Aged BrainDump tasks (>= 5 days old) surfaced for schedule-or-drop triage
  agedDumpTasks: BrainDumpTask[];
  onScheduleDumpTask: (task: BrainDumpTask) => void;
  onDropDumpTask: (id: string) => void;
  // State log — periodic "Feeling ___ because ___" entries
  stateLogTodaysEntries: StateLogEntry[];
  stateLogRecentReasons: string[];
  onAddStateLogEntry: (input: {
    energy: EnergyLevel;
    direction?: EnergyDirection;
    reasons: string[];
    note?: string;
  }) => StateLogEntry;
  onDeleteStateLogEntry: (id: string) => void;
  // Activation menu — external memory of the strategies the user forgets
  // when overwhelmed. Rendered at the top of the view; each button fast-
  // paths into a specific mode.
  underwayMantra: string;
  onGoStuck: () => void;         // → Underway, jump to stuck phase
  onGoStart: () => void;         // → Underway, jump to quickstart phase
  onGoKnockOne: () => void;      // → Underway, auto-picks a small dump task
  onGoTriage: () => void;        // → Triage session (batch cards)
  onGoPredict: () => void;       // → Predictions
  onGoSort: () => void;          // → Compass
  onGoBreathe: () => void;       // → Grounding
  // Count of active (non-someday) dump tasks — surfaced as a badge on
  // the Triage button so the size of the pile is visible.
  activeDumpCount: number;
  // Today's plan — 1/3/5 daily commitment surface. Renders as its own
  // card between Activate now and North Stars.
  todaysPlan: DailyPlanTask[];
  planCounts: { total: Record<DailyPlanSize, number>; done: Record<DailyPlanSize, number> };
  activeDumpTasks: BrainDumpTask[];  // for the plan's Add picker
  onAddToPlan: (size: DailyPlanSize, label: string, sourceDumpId?: string) => DailyPlanTask | null;
  onCompletePlanTask: (id: string) => void;
  onRemovePlanTask: (id: string) => void;
  onUpdatePlanTask: (id: string, updates: Partial<Pick<DailyPlanTask, 'helpByTime' | 'resources'>>) => void;
  onStartPlanTask: (task: DailyPlanTask) => void;  // launches Underway with this task
  // Week board — loose weekly dump. Items get promoted into today's
  // 1/3/5 (with a size) or dropped intentionally.
  weekBoardItems: WeekBoardItem[];
  weekBoardDropsThisWeek: number;
  onAddWeekBoardItem: (label: string, day?: string) => WeekBoardItem | null;
  onDropWeekBoardItem: (id: string) => void;
  onPromoteWeekBoardItem: (id: string, size: DailyPlanSize) => void;
  onSetWeekBoardItemDay: (id: string, day: string | undefined) => void;
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
  onSetCadence,
  onSetSchedule,
  onSetPause,
  northStars,
  onOpenStar,
  onOpenAllStars,
  onToggleIndicatorStar,
  agedDumpTasks,
  onScheduleDumpTask,
  onDropDumpTask,
  stateLogTodaysEntries,
  stateLogRecentReasons,
  onAddStateLogEntry,
  onDeleteStateLogEntry,
  underwayMantra,
  onGoStuck,
  onGoStart,
  onGoKnockOne,
  onGoTriage,
  onGoPredict,
  onGoSort,
  onGoBreathe,
  activeDumpCount,
  todaysPlan,
  planCounts,
  activeDumpTasks,
  onAddToPlan,
  onCompletePlanTask,
  onRemovePlanTask,
  onUpdatePlanTask,
  onStartPlanTask,
  weekBoardItems,
  weekBoardDropsThisWeek,
  onAddWeekBoardItem,
  onDropWeekBoardItem,
  onPromoteWeekBoardItem,
  onSetWeekBoardItemDay,
}: TodayViewProps) {
  // "Show more on today" — collapses the secondary widgets (State log,
  // Basics, Overdue predictions, Aged dump, Pins, North Stars) below a
  // toggle so the default surface is only the essential workflow
  // (Activate → Plan → Week). Preference persists per-user via
  // localStorage.
  const [showMoreToday, setShowMoreToday] = useState<boolean>(() => {
    try {
      return localStorage.getItem('setatime.today.showMore') === 'true';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('setatime.today.showMore', String(showMoreToday));
    } catch {
      // storage unavailable — non-fatal
    }
  }, [showMoreToday]);

  // Gmail-style "Logged · Undo" toast at the bottom; auto-dismisses after 5s.
  const [undoToast, setUndoToast] = useState<{ id: string; spiralId: string; label: string } | null>(null);
  useEffect(() => {
    if (!undoToast) return;
    const id = setTimeout(() => setUndoToast(null), 5000);
    return () => clearTimeout(id);
  }, [undoToast]);

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

  // All-day events for today. Skip timeline math for these — they render as
  // a banner above the Now/Up-next cards.
  const allDayToday = useMemo(
    () => todaysBlocks.filter((b) => b.isAllDay && b.date === todayKey),
    [todaysBlocks, todayKey]
  );
  const timedBlocks = useMemo(
    () => todaysBlocks.filter((b) => !b.isAllDay),
    [todaysBlocks]
  );

  const states: BlockState[] = useMemo(() => {
    // Pick the subtasks that belong to today, regardless of which block they came from.
    // Cross-midnight subtasks may live on a block dated yesterday but have date=today.
    const enriched = timedBlocks.map<BlockState>((block) => {
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
  }, [timedBlocks, todayKey, now]);

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
          <ActivateNowStrip
            mantra={underwayMantra}
            onStuck={onGoStuck}
            onStart={onGoStart}
            onKnockOne={onGoKnockOne}
            onTriage={onGoTriage}
            onPredict={onGoPredict}
            onSort={onGoSort}
            onBreathe={onGoBreathe}
            activeDumpCount={activeDumpCount}
          />
          <TodaysPlanStrip
            plan={todaysPlan}
            counts={planCounts}
            dumpTasks={activeDumpTasks}
            onAddToPlan={onAddToPlan}
            onComplete={onCompletePlanTask}
            onRemove={onRemovePlanTask}
            onUpdate={onUpdatePlanTask}
            onStart={onStartPlanTask}
          />
          <WeekBoardStrip
            items={weekBoardItems}
            dropsThisWeek={weekBoardDropsThisWeek}
            planCounts={planCounts}
            dumpTasks={activeDumpTasks}
            onAdd={onAddWeekBoardItem}
            onDrop={onDropWeekBoardItem}
            onPromote={onPromoteWeekBoardItem}
            onSetDay={onSetWeekBoardItemDay}
          />
          <button
            onClick={() => setShowMoreToday((v) => !v)}
            className="w-full text-[11px] font-semibold text-gray-500 hover:text-indigo-700 py-1.5 border-t border-dashed border-gray-200"
          >
            {showMoreToday ? '− hide more on today' : '▶ show more on today (6)'}
          </button>
          {showMoreToday && (
            <>
              <NorthStarsStrip
                stars={northStars}
                onOpenStar={onOpenStar}
                onOpenAll={onOpenAllStars}
              />
              <StateLogStrip
                todaysEntries={stateLogTodaysEntries}
                recentReasons={stateLogRecentReasons}
                onAdd={onAddStateLogEntry}
                onDelete={onDeleteStateLogEntry}
              />
              <BasicsDashboard
                indicators={dashboardIndicators}
                views={dashboardViews}
                onLog={(id) => {
                  onLogIndicator(id);
                  const ind = dashboardIndicators.find((i) => i.id === id);
                  if (ind) setUndoToast({ id: `t-${Date.now()}`, spiralId: id, label: ind.name });
                }}
                onUndoLast={onUndoLastIndicatorLog}
                onToggle={onToggleIndicatorEnabled}
                onAddCustom={onAddCustomIndicator}
                onRemove={onRemoveIndicator}
                onPushToDump={onPushIndicatorToDump}
                onSetCadence={onSetCadence}
                onSetSchedule={onSetSchedule}
                onSetPause={onSetPause}
                northStars={northStars}
                onToggleIndicatorStar={onToggleIndicatorStar}
              />
              <OverduePredictionsStrip
                overdue={overduePredictions}
                onReflect={onReflectPrediction}
              />
              <AgedDumpStrip
                tasks={agedDumpTasks}
                onSchedule={onScheduleDumpTask}
                onDrop={onDropDumpTask}
              />
              <PinsStrip
                pins={pins}
                onAddPin={onAddPin}
                onTogglePin={onTogglePin}
                onEditPin={onEditPin}
                onRemovePin={onRemovePin}
              />
            </>
          )}
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
        <UndoLogToast toast={undoToast} onUndo={(spiralId) => { onUndoLastIndicatorLog(spiralId); setUndoToast(null); }} onDismiss={() => setUndoToast(null)} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        <Header today={today} doneSubTasks={doneSubTasks} totalSubTasks={totalSubTasks} />

        <ActivateNowStrip
          mantra={underwayMantra}
          onStuck={onGoStuck}
          onStart={onGoStart}
          onKnockOne={onGoKnockOne}
          onTriage={onGoTriage}
          onPredict={onGoPredict}
          onSort={onGoSort}
          onBreathe={onGoBreathe}
          activeDumpCount={activeDumpCount}
        />

        <TodaysPlanStrip
          plan={todaysPlan}
          counts={planCounts}
          dumpTasks={activeDumpTasks}
          onAddToPlan={onAddToPlan}
          onComplete={onCompletePlanTask}
          onRemove={onRemovePlanTask}
          onUpdate={onUpdatePlanTask}
          onStart={onStartPlanTask}
        />

        <WeekBoardStrip
          items={weekBoardItems}
          dropsThisWeek={weekBoardDropsThisWeek}
          planCounts={planCounts}
          dumpTasks={activeDumpTasks}
          onAdd={onAddWeekBoardItem}
          onDrop={onDropWeekBoardItem}
          onPromote={onPromoteWeekBoardItem}
          onSetDay={onSetWeekBoardItemDay}
        />

        {/* Show more on today — the 6 secondary widgets. Hidden by
            default; user preference persists per device. */}
        <button
          onClick={() => setShowMoreToday((v) => !v)}
          className="w-full text-[11px] font-semibold text-gray-500 hover:text-indigo-700 py-1.5 border-t border-dashed border-gray-200"
        >
          {showMoreToday ? '− hide more on today' : '▶ show more on today (6)'}
        </button>

        {showMoreToday && (
          <>
            <NorthStarsStrip
              stars={northStars}
              onOpenStar={onOpenStar}
              onOpenAll={onOpenAllStars}
            />

            <StateLogStrip
              todaysEntries={stateLogTodaysEntries}
              recentReasons={stateLogRecentReasons}
              onAdd={onAddStateLogEntry}
              onDelete={onDeleteStateLogEntry}
            />

            <BasicsDashboard
              indicators={dashboardIndicators}
              views={dashboardViews}
              onLog={(id) => {
                onLogIndicator(id);
                const ind = dashboardIndicators.find((i) => i.id === id);
                if (ind) setUndoToast({ id: `t-${Date.now()}`, spiralId: id, label: ind.name });
              }}
              onUndoLast={onUndoLastIndicatorLog}
              onToggle={onToggleIndicatorEnabled}
              onAddCustom={onAddCustomIndicator}
              onRemove={onRemoveIndicator}
              onPushToDump={onPushIndicatorToDump}
              onSetCadence={onSetCadence}
              onSetSchedule={onSetSchedule}
              onSetPause={onSetPause}
              northStars={northStars}
              onToggleIndicatorStar={onToggleIndicatorStar}
            />

            <OverduePredictionsStrip
              overdue={overduePredictions}
              onReflect={onReflectPrediction}
            />

            <AgedDumpStrip
              tasks={agedDumpTasks}
              onSchedule={onScheduleDumpTask}
              onDrop={onDropDumpTask}
            />

            <PinsStrip
              pins={pins}
              onAddPin={onAddPin}
              onTogglePin={onTogglePin}
              onEditPin={onEditPin}
              onRemovePin={onRemovePin}
            />
          </>
        )}

        {/* All-day banner — reserved-day events surface here as compact chips */}
        {allDayToday.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-2">
              All-day today
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allDayToday.map((b) => (
                <span
                  key={b.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold text-gray-900"
                  style={{ backgroundColor: b.color }}
                >
                  {b.mainTask}
                </span>
              ))}
            </div>
          </div>
        )}

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
      <UndoLogToast toast={undoToast} onUndo={(spiralId) => { onUndoLastIndicatorLog(spiralId); setUndoToast(null); }} onDismiss={() => setUndoToast(null)} />
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

// ---------- Spiral editor (cadence + schedule + pause) ----------

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function cadenceLabel(ind: BasicIndicator): string {
  const cad = ind.cadence ?? 'daily';
  if (cad === 'daily') return 'Every day';
  if (cad === 'weekdays') return 'Weekdays';
  if (cad === 'specific') {
    const days = ind.daysOfWeek ?? [];
    if (days.length === 0) return 'No days selected';
    return days
      .slice()
      .sort()
      .map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d])
      .join('·');
  }
  return 'Every day';
}

function SpiralEditor({
  ind,
  paused,
  onSetCadence,
  onSetSchedule,
  onSetPause,
  northStars,
  onToggleIndicatorStar,
}: {
  ind: BasicIndicator;
  paused: boolean;
  onSetCadence: TodayViewProps['onSetCadence'];
  onSetSchedule: TodayViewProps['onSetSchedule'];
  onSetPause: TodayViewProps['onSetPause'];
  northStars: NorthStar[];
  onToggleIndicatorStar: (indicatorId: string, starId: string) => void;
}) {
  const activeStars = northStars.filter((s) => !s.archivedAt);
  const tagged = new Set(ind.northStarIds ?? []);
  const cad: SpiralCadence = ind.cadence ?? 'daily';
  const daysOfWeek = ind.daysOfWeek ?? [];
  const scheduleOn = !!ind.schedule;
  return (
    <div className="mt-2 ml-10 pl-3 border-l-2 border-indigo-100 space-y-3">
      {/* Cadence */}
      <div>
        <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">
          Cadence
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(['daily', 'weekdays', 'specific'] as SpiralCadence[]).map((c) => (
            <button
              key={c}
              onClick={() => onSetCadence(ind.id, c, c === 'specific' ? daysOfWeek : undefined)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg border ${
                cad === c
                  ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-200'
              }`}
            >
              {c === 'daily' ? 'Every day' : c === 'weekdays' ? 'Weekdays' : 'Pick days'}
            </button>
          ))}
        </div>
        {cad === 'specific' && (
          <div className="mt-2 flex gap-1">
            {DAY_LABELS.map((label, i) => {
              const active = daysOfWeek.includes(i);
              return (
                <button
                  key={i}
                  onClick={() => {
                    const next = active
                      ? daysOfWeek.filter((d) => d !== i)
                      : [...daysOfWeek, i];
                    onSetCadence(ind.id, 'specific', next);
                  }}
                  className={`w-7 h-7 text-xs font-bold rounded-full transition-colors ${
                    active
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-500 border border-gray-200 hover:border-indigo-300'
                  }`}
                  title={['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Schedule */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
            Schedule on the calendar
          </div>
          <button
            onClick={() =>
              scheduleOn
                ? onSetSchedule(ind.id, null)
                : onSetSchedule(ind.id, { time: '09:00', durationMinutes: 30 })
            }
            className={`w-10 h-5 rounded-full border-2 transition-colors flex items-center ${
              scheduleOn
                ? 'bg-indigo-600 border-indigo-600 justify-end'
                : 'bg-white border-gray-300 justify-start'
            }`}
            title={scheduleOn ? 'Disable schedule' : 'Schedule on calendar'}
          >
            <span className="w-3 h-3 bg-white rounded-full shadow-sm mx-0.5" />
          </button>
        </div>
        {scheduleOn && ind.schedule && (
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-gray-500 flex items-center gap-1.5">
              At
              <input
                type="time"
                value={ind.schedule.time}
                onChange={(e) =>
                  onSetSchedule(ind.id, {
                    time: e.target.value,
                    durationMinutes: ind.schedule!.durationMinutes ?? 30,
                  })
                }
                className="px-2 py-1 text-sm border border-gray-200 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </label>
            <label className="text-[10px] text-gray-500 flex items-center gap-1.5">
              For
              <input
                type="number"
                min={5}
                max={480}
                step={5}
                value={ind.schedule.durationMinutes ?? 30}
                onChange={(e) =>
                  onSetSchedule(ind.id, {
                    time: ind.schedule!.time,
                    durationMinutes: Math.max(5, Number(e.target.value) || 30),
                  })
                }
                className="w-16 px-2 py-1 text-sm border border-gray-200 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              min
            </label>
          </div>
        )}
        {scheduleOn && (
          <p className="text-[10px] text-gray-400 mt-1.5">
            Auto-renders as a virtual block on every active day. Tap the block in the
            calendar to log, skip, or open these settings.
          </p>
        )}
      </div>

      {/* Pause */}
      <div>
        <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">
          Pause
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {paused ? (
            <button
              onClick={() => onSetPause(ind.id, null)}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg border bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100"
            >
              Resume
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 7);
                  onSetPause(ind.id, d.toISOString());
                }}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border bg-white border-gray-200 text-gray-700 hover:border-amber-300"
              >
                For a week
              </button>
              <button
                onClick={() => {
                  const d = new Date();
                  d.setMonth(d.getMonth() + 1);
                  onSetPause(ind.id, d.toISOString());
                }}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border bg-white border-gray-200 text-gray-700 hover:border-amber-300"
              >
                For a month
              </button>
              <button
                onClick={() => onSetPause(ind.id, undefined)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border bg-white border-gray-200 text-gray-700 hover:border-amber-300"
              >
                Indefinitely
              </button>
            </>
          )}
        </div>
      </div>

      {/* North Star tags */}
      {activeStars.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">
            Feeds North Star
          </div>
          <div className="flex flex-wrap gap-1.5">
            {activeStars.map((star) => {
              const on = tagged.has(star.id);
              const c = colorFor(star.color);
              return (
                <button
                  key={star.id}
                  onClick={() => onToggleIndicatorStar(ind.id, star.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                    on
                      ? `${c.bg} ${c.text} border-transparent`
                      : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: c.hex, opacity: on ? 1 : 0.5 }}
                  />
                  {star.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Undo-last-log toast ----------
//
// Mounted once at the root of TodayView. Fades into the bottom for ~5s after
// the user taps a spiral tile so accidental logs are one-tap reversible.

function UndoLogToast({
  toast,
  onUndo,
  onDismiss,
}: {
  toast: { id: string; spiralId: string; label: string } | null;
  onUndo: (spiralId: string) => void;
  onDismiss: () => void;
}) {
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      className="fixed left-1/2 -translate-x-1/2 bottom-6 z-50 flex items-center gap-3 px-4 py-2 bg-gray-900 text-white rounded-full shadow-xl text-sm animate-[fadeIn_120ms_ease-out]"
      style={{ paddingBottom: `calc(0.5rem + env(safe-area-inset-bottom, 0px))` }}
    >
      <span className="text-emerald-300">✓</span>
      <span className="font-medium">
        Logged <span className="text-gray-300">·</span> {toast.label}
      </span>
      <button
        onClick={() => onUndo(toast.spiralId)}
        className="ml-2 text-amber-300 hover:text-amber-200 font-semibold uppercase tracking-wider text-xs"
      >
        Undo
      </button>
      <button
        onClick={onDismiss}
        className="text-gray-400 hover:text-gray-200 text-base leading-none"
        title="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

// ---------- Upward Spirals (car-dashboard tiles) ----------
//
// Iconified recurring commitments (formerly "Daily basics"). Tap to log.
// Tiles flow green → amber → red+pulse the longer they go unlogged; in
// amber/red an ↗ shortcut appears to push the indicator into the BrainDump
// as an urgent task. When a spiral has a schedule, the calendar renders a
// virtual block on its cadence.
function BasicsDashboard({
  indicators,
  views,
  onLog,
  onUndoLast,
  onToggle,
  onAddCustom,
  onRemove,
  onPushToDump,
  onSetCadence,
  onSetSchedule,
  onSetPause,
  northStars,
  onToggleIndicatorStar,
}: {
  indicators: BasicIndicator[];
  views: IndicatorView[];
  onLog: (id: string) => void;
  onUndoLast: (id: string) => void;
  onToggle: (id: string) => void;
  onAddCustom: TodayViewProps['onAddCustomIndicator'];
  onRemove: (id: string) => void;
  onPushToDump: (label: string) => void;
  onSetCadence: TodayViewProps['onSetCadence'];
  onSetSchedule: TodayViewProps['onSetSchedule'];
  onSetPause: TodayViewProps['onSetPause'];
  northStars: NorthStar[];
  onToggleIndicatorStar: (indicatorId: string, starId: string) => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Disabled indicators don't appear in `views` — render only the live tiles.
  if (views.length === 0 && !settingsOpen) {
    return (
      <section className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
        <header className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-gray-800">Upward spirals</h3>
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
            stars={northStars}
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
          onSetCadence={onSetCadence}
          onSetSchedule={onSetSchedule}
          onSetPause={onSetPause}
          northStars={northStars}
          onToggleIndicatorStar={onToggleIndicatorStar}
        />
      )}
    </section>
  );
}

// Background gradient + ring per state. Simulates a warning-light "lamp"
// rather than a flat block: soft inner gradient, ring acts as bezel, the
// glyph picks up the state color via currentColor.
const TILE_STYLES: Record<IndicatorView['state'], string> = {
  cold: 'bg-gradient-to-br from-gray-50 to-gray-100 ring-1 ring-gray-200 text-gray-400',
  green:
    'bg-gradient-to-br from-emerald-50 to-emerald-100 ring-1 ring-emerald-200 text-emerald-700',
  amber:
    'bg-gradient-to-br from-amber-50 to-amber-100 ring-1 ring-amber-300 text-amber-700 shadow-[inset_0_0_0_1px_rgba(217,119,6,0.15)]',
  red:
    'bg-gradient-to-br from-red-50 to-red-100 ring-2 ring-red-300 text-red-700 shadow-[inset_0_0_18px_rgba(239,68,68,0.25)] animate-pulse',
};

function IndicatorTile({
  view,
  stars,
  onLog,
  onUndoLast,
  onPushToDump,
}: {
  view: IndicatorView;
  stars: NorthStar[];
  onLog: () => void;
  onUndoLast: () => void;
  onPushToDump: () => void;
}) {
  const { indicator: ind, state, todayCount, minutesSinceLast } = view;
  const taggedStars = (ind.northStarIds ?? [])
    .map((id) => stars.find((s) => s.id === id))
    .filter((s): s is NorthStar => !!s && !s.archivedAt);
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
        className={`w-full aspect-square rounded-[22px] flex flex-col items-center justify-center gap-1 px-1.5 pt-2 pb-1 transition-all ${TILE_STYLES[state]}`}
        title={ind.hint || ind.name}
      >
        <IndicatorIcon indicator={ind} size={30} />
        <div className="text-[11px] font-semibold tracking-tight leading-tight">{ind.name}</div>
        <div className="text-[10px] font-mono leading-tight opacity-90">{sub}</div>
        {microLine && <div className="text-[9px] opacity-60 leading-tight">{microLine}</div>}
        {taggedStars.length > 0 && (
          <div className="absolute bottom-1 left-1 flex items-center gap-0.5">
            {taggedStars.slice(0, 3).map((s) => (
              <span
                key={s.id}
                title={s.name}
                className="w-1.5 h-1.5 rounded-full ring-1 ring-white/70"
                style={{ backgroundColor: colorFor(s.color).hex }}
              />
            ))}
          </div>
        )}
      </button>
      {todayCount > 0 && (
        <button
          onClick={onUndoLast}
          className="absolute top-1 left-1 text-[10px] leading-none w-5 h-5 rounded-full bg-white/80 backdrop-blur ring-1 ring-gray-200 text-gray-400 hover:text-red-500 transition-colors"
          title="Undo last log"
        >
          ↩
        </button>
      )}
      {showEscalation && (
        <button
          onClick={onPushToDump}
          className="absolute top-1 right-1 text-[10px] uppercase tracking-wider font-bold leading-none px-1.5 py-1 rounded-md bg-white ring-1 ring-current shadow-sm hover:bg-red-500 hover:text-white hover:ring-red-500 transition-colors"
          title="Push as an urgent task to the Hold"
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
  onSetCadence,
  onSetSchedule,
  onSetPause,
  northStars,
  onToggleIndicatorStar,
}: {
  indicators: BasicIndicator[];
  onToggle: (id: string) => void;
  onAddCustom: TodayViewProps['onAddCustomIndicator'];
  onRemove: (id: string) => void;
  onClose: () => void;
  onSetCadence: TodayViewProps['onSetCadence'];
  onSetSchedule: TodayViewProps['onSetSchedule'];
  onSetPause: TodayViewProps['onSetPause'];
  northStars: NorthStar[];
  onToggleIndicatorStar: (indicatorId: string, starId: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
            {indicators.map((ind) => {
              const isExpanded = expandedId === ind.id;
              const paused = !!ind.pausedUntil && new Date(ind.pausedUntil).getTime() > Date.now();
              return (
                <li key={ind.id} className="py-2">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 flex items-center justify-center text-gray-600">
                      <IndicatorIcon indicator={ind} size={22} />
                    </span>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : ind.id)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                        {ind.name}
                        {paused && (
                          <span className="text-[9px] uppercase tracking-wider font-bold text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
                            Paused
                          </span>
                        )}
                        {ind.schedule && (
                          <span className="text-[9px] uppercase tracking-wider font-semibold text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5">
                            {ind.schedule.time}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-500 truncate">
                        {cadenceLabel(ind)}
                        {ind.hint ? ` · ${ind.hint}` : ''}
                      </div>
                    </button>
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
                  </div>
                  {isExpanded && (
                    <SpiralEditor
                      ind={ind}
                      paused={paused}
                      onSetCadence={onSetCadence}
                      onSetSchedule={onSetSchedule}
                      onSetPause={onSetPause}
                      northStars={northStars}
                      onToggleIndicatorStar={onToggleIndicatorStar}
                    />
                  )}
                </li>
              );
            })}
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

// ---------- Activate now strip ----------
//
// The rescue menu. Overwhelm displaces the working memory that holds your
// activation strategies, so the fix isn't remembering harder — it's making
// the app the external memory. This surface renders every strategy the
// app offers as a big, tap-and-go button, right at the top of Today.
//
// The mantra shown above the buttons is the same one the user edits from
// the Stuck screen — pulled through so it's visible every time they
// open the app, not just when they specifically go looking.

type ActivateKey = 'stuck' | 'start' | 'knockOne' | 'triage' | 'predict' | 'sort' | 'breathe';

const ACTIVATE_OPTIONS: {
  key: ActivateKey;
  emoji: string;
  label: string;
  sub: string;
  tone: string;  // classes for the tile
}[] = [
  {
    key: 'stuck', emoji: '🌱', label: 'Stuck?',
    sub: 'start ridiculously small · uses your BA reminder',
    tone: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-900',
  },
  {
    key: 'start', emoji: '🚀', label: 'Start a session',
    sub: 'Underway · 15 min · one thing',
    tone: 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-900',
  },
  {
    key: 'knockOne', emoji: '🎯', label: 'Knock one out',
    sub: '2 min · picks a small one from your hold',
    tone: 'bg-teal-50 hover:bg-teal-100 border-teal-200 text-teal-900',
  },
  {
    key: 'triage', emoji: '🎴', label: 'Triage the dump',
    sub: 'one card at a time · Do now / Pin / Someday / Drop',
    tone: 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-900',
  },
  {
    key: 'predict', emoji: '🔮', label: 'Make a prediction',
    sub: 'small bet · prove yourself right · Lab',
    tone: 'bg-violet-50 hover:bg-violet-100 border-violet-200 text-violet-900',
  },
  {
    key: 'sort', emoji: '🧭', label: 'Sort what\'s on my mind',
    sub: 'Circle of Control · Compass',
    tone: 'bg-sky-50 hover:bg-sky-100 border-sky-200 text-sky-900',
  },
  {
    key: 'breathe', emoji: '🌊', label: 'Breathe',
    sub: '4-4-4-4 box breathing · Grounding',
    tone: 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-900',
  },
];

function ActivateNowStrip({
  mantra,
  onStuck,
  onStart,
  onKnockOne,
  onTriage,
  onPredict,
  onSort,
  onBreathe,
  activeDumpCount,
}: {
  mantra: string;
  onStuck: () => void;
  onStart: () => void;
  onKnockOne: () => void;
  onTriage: () => void;
  onPredict: () => void;
  onSort: () => void;
  onBreathe: () => void;
  activeDumpCount: number;
}) {
  const handlers: Record<ActivateKey, () => void> = {
    stuck: onStuck, start: onStart, knockOne: onKnockOne, triage: onTriage,
    predict: onPredict, sort: onSort, breathe: onBreathe,
  };

  // Split the menu into primary (default-visible) and secondary
  // (behind "+ more strategies"). Keeps the daily surface calm without
  // hiding anything — one tap reveals the rest. Ordered by
  // frequency-of-use from the conversation with the user.
  const PRIMARY_KEYS: ActivateKey[] = ['stuck', 'start', 'predict', 'triage'];
  const [showMoreStrategies, setShowMoreStrategies] = useState(false);
  const visibleOptions = showMoreStrategies
    ? ACTIVATE_OPTIONS
    : ACTIVATE_OPTIONS.filter((o) => PRIMARY_KEYS.includes(o.key));

  // "Surprise me" — random pick from the five when the user can't decide.
  // Direct anti-decision-paralysis affordance; the exact choice matters
  // less than moving at all. Draws from ALL options (including tucked)
  // so hidden strategies still get a fair shot.
  const surpriseMe = () => {
    const pick = ACTIVATE_OPTIONS[Math.floor(Math.random() * ACTIVATE_OPTIONS.length)];
    handlers[pick.key]();
  };

  return (
    <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <header className="px-4 py-2 border-b border-gray-100 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-gray-800">Activate now</h3>
        <button
          onClick={surpriseMe}
          className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800"
          title="Random pick — when you can't choose"
        >
          🎲 surprise me
        </button>
      </header>

      {/* Mantra — always visible, so the principle you forget shows up
          every time you open the app. Tap to jump into Stuck (where it's
          editable). */}
      <button
        onClick={onStuck}
        className="w-full text-left px-4 py-3 border-b border-gray-100 bg-emerald-50/50 hover:bg-emerald-50 transition-colors"
        title="Edit on the Stuck screen"
      >
        <div className="flex items-start gap-2">
          <span className="text-sm leading-tight pt-0.5">🌱</span>
          <p className="flex-1 text-[13px] leading-relaxed text-emerald-900 font-medium">
            {mantra}
          </p>
        </div>
      </button>

      {/* Stacked action buttons — one strategy per row, large touch targets,
          scan-in-one-glance labels. */}
      <ul className="p-3 space-y-2">
        {visibleOptions.map((opt) => {
          // Show a count badge on the Triage tile so the size of the pile
          // is visible. Same for Knock one out — if the dump is empty,
          // the button still works (falls back to freeform) but the
          // badge tells you there's nothing aged to auto-pick.
          const showDumpBadge = opt.key === 'triage' || opt.key === 'knockOne';
          return (
            <li key={opt.key}>
              <button
                onClick={handlers[opt.key]}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${opt.tone}`}
              >
                <span className="text-2xl leading-none">{opt.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold tracking-tight">{opt.label}</div>
                  <div className="text-[11px] opacity-80 mt-0.5">{opt.sub}</div>
                </div>
                {showDumpBadge && activeDumpCount > 0 && (
                  <span
                    className="text-[10px] font-semibold text-gray-700 bg-white/70 border border-gray-200 rounded-full px-1.5 py-0.5 tabular-nums"
                    title={`${activeDumpCount} in your hold`}
                  >
                    {activeDumpCount}
                  </span>
                )}
                <span className="text-gray-400 text-lg">→</span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* More strategies toggle — reveals Knock one out / Sort / Breathe.
          Small, quiet; the whole point is the default surface stays calm. */}
      <div className="px-3 pb-3">
        <button
          onClick={() => setShowMoreStrategies((v) => !v)}
          className="w-full text-[11px] font-semibold text-gray-500 hover:text-indigo-700 py-1"
        >
          {showMoreStrategies
            ? '− fewer strategies'
            : `+ more strategies (${ACTIVATE_OPTIONS.length - PRIMARY_KEYS.length})`}
        </button>
      </div>
    </section>
  );
}

// ---------- Today's plan (1/3/5) strip ----------
//
// Daily state-based commitment surface. Cap: 1 big + 3 medium + 5 small
// tasks (see DAILY_PLAN_CAPS). The card sits between Activate now and North
// Stars so it's visible on every open.
//
// Interaction model:
//   * Empty slot → "+ add" opens an inline picker (dump items + freeform)
//   * Filled slot → checkbox on left completes/uncompletes; task label
//     is a tap target that launches an Underway session
//   * Wrap-Done from Underway auto-checks the plan slot (App handles this)
//   * Section header shows N/CAP so caps are visible without shaming
//
// Deliberately no size-change action — you commit to a size when you
// add. If you got it wrong, remove + re-add.

const PLAN_SIZE_META: Record<DailyPlanSize, {
  label: string;
  glyph: string;
  tone: string;
  headerTone: string;
}> = {
  big: {
    label: 'Big',
    glyph: '★',
    tone: 'bg-amber-50/40 border-amber-100',
    headerTone: 'text-amber-800',
  },
  medium: {
    label: 'Medium',
    glyph: '●',
    tone: 'bg-indigo-50/40 border-indigo-100',
    headerTone: 'text-indigo-800',
  },
  small: {
    label: 'Small',
    glyph: '●',
    tone: 'bg-teal-50/40 border-teal-100',
    headerTone: 'text-teal-800',
  },
};

function TodaysPlanStrip({
  plan,
  counts,
  dumpTasks,
  onAddToPlan,
  onComplete,
  onRemove,
  onUpdate,
  onStart,
}: {
  plan: DailyPlanTask[];
  counts: { total: Record<DailyPlanSize, number>; done: Record<DailyPlanSize, number> };
  dumpTasks: BrainDumpTask[];
  onAddToPlan: (size: DailyPlanSize, label: string, sourceDumpId?: string) => DailyPlanTask | null;
  onComplete: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Pick<DailyPlanTask, 'helpByTime' | 'resources'>>) => void;
  onStart: (task: DailyPlanTask) => void;
}) {
  // Which slot is currently in "add" mode. Only one add form open at
  // a time so the card doesn't sprawl.
  const [adding, setAdding] = useState<DailyPlanSize | null>(null);

  const bigTasks    = plan.filter((t) => t.size === 'big');
  const mediumTasks = plan.filter((t) => t.size === 'medium');
  const smallTasks  = plan.filter((t) => t.size === 'small');

  const totalCap  = DAILY_PLAN_CAPS.big + DAILY_PLAN_CAPS.medium + DAILY_PLAN_CAPS.small; // 9
  const totalDone = counts.done.big + counts.done.medium + counts.done.small;
  const totalHave = counts.total.big + counts.total.medium + counts.total.small;

  const cap = (size: DailyPlanSize) => DAILY_PLAN_CAPS[size];
  const atCap = (size: DailyPlanSize) => counts.total[size] >= cap(size);

  const isEmpty = totalHave === 0;

  return (
    <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <header className="px-4 py-2 border-b border-gray-100 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-gray-800">Today's plan</h3>
        <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 tabular-nums">
          {isEmpty
            ? `1 · 3 · 5`
            : `${totalDone} / ${totalHave} done · ${totalHave}/${totalCap}`}
        </span>
      </header>

      {isEmpty ? (
        <div className="px-4 py-4 text-center text-[12px] text-gray-500 space-y-2">
          <p>
            Pick <strong>1 big</strong>, <strong>3 medium</strong>, and <strong>5 small</strong> things
            you'll actually do today.
          </p>
          <p className="text-[11px] text-gray-400">
            No scheduling. State-based. Completing anything counts.
          </p>
        </div>
      ) : null}

      <div className="p-3 space-y-3">
        <PlanSection
          size="big"
          tasks={bigTasks}
          cap={cap('big')}
          count={counts.total.big}
          isAdding={adding === 'big'}
          onOpenAdd={() => setAdding('big')}
          onCloseAdd={() => setAdding(null)}
          onComplete={onComplete}
          onRemove={onRemove}
          onUpdate={onUpdate}
          onStart={onStart}
          onAdd={(label, dumpId) => {
            const r = onAddToPlan('big', label, dumpId);
            if (r) setAdding(null);
          }}
          dumpTasks={dumpTasks}
          atCap={atCap('big')}
        />
        <PlanSection
          size="medium"
          tasks={mediumTasks}
          cap={cap('medium')}
          count={counts.total.medium}
          isAdding={adding === 'medium'}
          onOpenAdd={() => setAdding('medium')}
          onCloseAdd={() => setAdding(null)}
          onComplete={onComplete}
          onRemove={onRemove}
          onUpdate={onUpdate}
          onStart={onStart}
          onAdd={(label, dumpId) => {
            const r = onAddToPlan('medium', label, dumpId);
            if (r) setAdding(null);
          }}
          dumpTasks={dumpTasks}
          atCap={atCap('medium')}
        />
        <PlanSection
          size="small"
          tasks={smallTasks}
          cap={cap('small')}
          count={counts.total.small}
          isAdding={adding === 'small'}
          onOpenAdd={() => setAdding('small')}
          onCloseAdd={() => setAdding(null)}
          onComplete={onComplete}
          onRemove={onRemove}
          onUpdate={onUpdate}
          onStart={onStart}
          onAdd={(label, dumpId) => {
            const r = onAddToPlan('small', label, dumpId);
            if (r) setAdding(null);
          }}
          dumpTasks={dumpTasks}
          atCap={atCap('small')}
        />
      </div>
    </section>
  );
}

function PlanSection({
  size, tasks, cap, count, isAdding,
  onOpenAdd, onCloseAdd, onAdd,
  onComplete, onRemove, onUpdate, onStart,
  dumpTasks, atCap,
}: {
  size: DailyPlanSize;
  tasks: DailyPlanTask[];
  cap: number;
  count: number;
  isAdding: boolean;
  onOpenAdd: () => void;
  onCloseAdd: () => void;
  onAdd: (label: string, dumpId?: string) => void;
  onComplete: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Pick<DailyPlanTask, 'helpByTime' | 'resources'>>) => void;
  onStart: (task: DailyPlanTask) => void;
  dumpTasks: BrainDumpTask[];
  atCap: boolean;
}) {
  const meta = PLAN_SIZE_META[size];
  return (
    <div className={`rounded-xl border ${meta.tone} px-3 py-2`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className={`text-[11px] uppercase tracking-wider font-bold ${meta.headerTone} flex items-center gap-1`}>
          <span>{meta.glyph}</span>
          <span>{meta.label}</span>
          <span className="opacity-60 tabular-nums font-mono">
            {count}/{cap}
          </span>
        </div>
      </div>
      <ul className="space-y-1">
        {tasks.map((t) => (
          <PlanRow
            key={t.id}
            task={t}
            onComplete={onComplete}
            onRemove={onRemove}
            onUpdate={onUpdate}
            onStart={onStart}
          />
        ))}
      </ul>
      {isAdding ? (
        <PlanAddForm
          dumpTasks={dumpTasks}
          onCancel={onCloseAdd}
          onSubmit={onAdd}
        />
      ) : (
        !atCap && (
          <button
            onClick={onOpenAdd}
            className="mt-1 w-full py-1.5 text-[11px] font-semibold text-gray-500 border border-dashed border-gray-300 rounded-lg hover:border-indigo-400 hover:text-indigo-700"
          >
            + add {meta.label.toLowerCase()}
          </button>
        )
      )}
      {atCap && !isAdding && (
        <p className="text-[10px] text-gray-400 mt-1 text-center">
          {cap}/{cap} · full · remove one to add
        </p>
      )}
    </div>
  );
}

// Format "HH:MM" 24h → "3:00 PM" 12h for display. Cheaper than pulling
// a full date library — the input is always a valid HH:MM string.
function fmtHelpBy(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return hhmm;
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

// True when the help-by time has already passed (based on local wall
// clock). Used to shift the chip amber so you notice.
function helpByPassed(hhmm: string): boolean {
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return false;
  const now = new Date();
  return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
}

// Auto-linkify simple http(s) URLs in a free-form resource line. Kept
// intentionally narrow — no bare-domain autolink.
function LinkifiedResource({ text }: { text: string }) {
  const URL_RE = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (URL_RE.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noreferrer noopener"
              className="text-indigo-700 underline underline-offset-2 hover:text-indigo-900 break-all"
            >
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function PlanRow({
  task,
  onComplete,
  onRemove,
  onUpdate,
  onStart,
}: {
  task: DailyPlanTask;
  onComplete: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Pick<DailyPlanTask, 'helpByTime' | 'resources'>>) => void;
  onStart: (task: DailyPlanTask) => void;
}) {
  const done = !!task.completedAt;
  const [expanded, setExpanded] = useState(false);
  const [helpDraft, setHelpDraft] = useState(task.helpByTime || '');
  const [resDraft, setResDraft] = useState((task.resources || []).join('\n'));

  const hasHelp = !!task.helpByTime;
  const hasRes  = !!(task.resources && task.resources.length > 0);
  const helpLate = hasHelp && !done && helpByPassed(task.helpByTime!);

  // Reset drafts when the task's persisted values change externally
  // (e.g. cloud sync, or when this row's expand toggles).
  useEffect(() => {
    setHelpDraft(task.helpByTime || '');
    setResDraft((task.resources || []).join('\n'));
  }, [task.helpByTime, task.resources]);

  const saveDetails = () => {
    onUpdate(task.id, {
      helpByTime: helpDraft || undefined,
      resources: resDraft
        .split('\n')
        .map((r) => r.trim())
        .filter((r) => r.length > 0),
    });
    setExpanded(false);
  };
  const clearHelp = () => {
    setHelpDraft('');
    onUpdate(task.id, { helpByTime: undefined });
  };

  return (
    <li className="bg-white/80 rounded-lg border border-gray-100">
      <div className="group flex items-center gap-2 px-2 py-1.5">
        <button
          onClick={() => onComplete(task.id)}
          className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
            done
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : 'border-gray-300 hover:border-emerald-400'
          }`}
          aria-label={done ? 'Uncomplete' : 'Complete'}
        >
          {done && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
        <span
          className={`flex-1 min-w-0 truncate text-[13px] ${
            done ? 'text-gray-400 line-through' : 'text-gray-900'
          }`}
          title={task.label}
        >
          {task.label}
        </span>

        {/* Chips: help-by + resources count. Always visible when set. */}
        {hasHelp && (
          <span
            className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border tabular-nums whitespace-nowrap ${
              helpLate
                ? 'bg-amber-100 border-amber-300 text-amber-900'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
            title={helpLate ? 'Help-by time passed' : 'Get help by this time if stuck'}
          >
            🆘 {fmtHelpBy(task.helpByTime!)}
          </span>
        )}
        {hasRes && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-indigo-50 border-indigo-200 text-indigo-800 tabular-nums whitespace-nowrap"
            title={`${task.resources!.length} resource${task.resources!.length === 1 ? '' : 's'}`}
          >
            🔗 {task.resources!.length}
          </span>
        )}

        {!done && (
          <button
            onClick={() => onStart(task)}
            className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Start a session for this"
          >
            → Do
          </button>
        )}
        <button
          onClick={() => setExpanded((v) => !v)}
          className={`text-[10px] font-semibold transition-opacity ${
            expanded || hasHelp || hasRes
              ? 'text-gray-500 hover:text-gray-800'
              : 'text-gray-400 hover:text-gray-800 opacity-0 group-hover:opacity-100'
          }`}
          title="Details: help-by + resources"
          aria-expanded={expanded}
        >
          {expanded ? '▴' : '▾'}
        </button>
        <button
          onClick={() => onRemove(task.id)}
          className="text-gray-300 hover:text-red-500 text-sm leading-none opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove"
        >
          ×
        </button>
      </div>

      {/* Details panel — collapsed by default; shows what's set (read-only)
          plus the edit form. */}
      {expanded && (
        <div className="border-t border-gray-100 px-3 py-2 space-y-2">
          {/* Read-only quick view of what's already set */}
          {(hasRes) && (
            <ul className="space-y-0.5 text-[12px] text-gray-700 pl-3">
              {task.resources!.map((r, i) => (
                <li key={i} className="leading-relaxed">
                  · <LinkifiedResource text={r} />
                </li>
              ))}
            </ul>
          )}

          {/* Edit form */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2">
              <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 flex-shrink-0">
                🆘 Get help by
              </label>
              <input
                type="time"
                value={helpDraft}
                onChange={(e) => setHelpDraft(e.target.value)}
                className="px-2 py-1 text-[12px] border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-400 tabular-nums"
              />
              {helpDraft && (
                <button
                  onClick={clearHelp}
                  className="text-[10px] text-gray-500 hover:text-red-500"
                  title="Clear"
                >
                  clear
                </button>
              )}
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">
                🔗 Resources
              </label>
              <textarea
                value={resDraft}
                onChange={(e) => setResDraft(e.target.value)}
                placeholder="One per line — links, docs, phone numbers, anything you'll need."
                rows={3}
                className="w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setHelpDraft(task.helpByTime || '');
                  setResDraft((task.resources || []).join('\n'));
                  setExpanded(false);
                }}
                className="text-[11px] text-gray-500 hover:text-gray-800"
              >
                cancel
              </button>
              <button
                onClick={saveDetails}
                className="px-2 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded"
              >
                save
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function PlanAddForm({
  dumpTasks,
  onCancel,
  onSubmit,
}: {
  dumpTasks: BrainDumpTask[];
  onCancel: () => void;
  onSubmit: (label: string, dumpId?: string) => void;
}) {
  const [label, setLabel] = useState('');
  // Show dump items only when the user is typing/browsing (small list
  // to avoid recreating the overwhelm the plan is meant to escape).
  const suggestions = useMemo(() => {
    const l = label.trim().toLowerCase();
    const source = [...dumpTasks].sort((a, b) => a.label.length - b.label.length);
    if (!l) return source.slice(0, 5);
    return source.filter((t) => t.label.toLowerCase().includes(l)).slice(0, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, dumpTasks]);

  const commit = () => {
    if (!label.trim()) return;
    onSubmit(label.trim());
  };

  return (
    <div className="mt-2 space-y-1.5 bg-white/80 border border-gray-200 rounded-lg p-2">
      <div className="flex gap-1.5">
        <input
          autoFocus
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && label.trim()) {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
          }}
          placeholder="What is it?"
          className="flex-1 min-w-0 px-2 py-1.5 text-[13px] border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <button
          onClick={commit}
          disabled={!label.trim()}
          className="px-2 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-40"
        >
          Add
        </button>
        <button
          onClick={onCancel}
          className="px-1.5 py-1 text-[11px] text-gray-500 hover:text-gray-800"
        >
          ×
        </button>
      </div>
      {suggestions.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">
            {label.trim() ? 'From your hold' : 'Recent in hold'}
          </div>
          <div className="flex flex-wrap gap-1">
            {suggestions.map((t) => (
              <button
                key={t.id}
                onClick={() => onSubmit(t.label, t.id)}
                className="px-2 py-0.5 text-[11px] rounded-full bg-white border border-gray-200 text-gray-700 hover:border-indigo-400 hover:bg-indigo-50/40 max-w-[15rem] truncate"
                title={t.label}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Week board strip ----------
//
// A loose weekly pool sitting just below Today's plan. Populated by
// dumping what's on your mind for the coming week — no dates, no sizes.
// Each item's two first-class actions are:
//
//   ★ / ● / ●  — promote into today's 1/3/5 with a size
//   ✕          — drop (intentional, celebrated)
//
// The "dropped this week" counter in the header quietly rewards the
// "not doing" muscle — the user named that as the harder half of
// prioritization, so the app makes the drop feel like a win rather
// than a deletion.

// Local YYYY-MM-DD from a Date, honoring the browser's local zone.
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function WeekBoardStrip({
  items,
  dropsThisWeek,
  planCounts,
  dumpTasks,
  onAdd,
  onDrop,
  onPromote,
  onSetDay,
}: {
  items: WeekBoardItem[];
  dropsThisWeek: number;
  planCounts: { total: Record<DailyPlanSize, number>; done: Record<DailyPlanSize, number> };
  dumpTasks: BrainDumpTask[];
  onAdd: (label: string, day?: string) => WeekBoardItem | null;
  onDrop: (id: string) => void;
  onPromote: (id: string, size: DailyPlanSize) => void;
  onSetDay: (id: string, day: string | undefined) => void;
}) {
  // Which section is currently in add-mode. Only one open at a time so
  // the card doesn't sprawl. `null` = closed; `''` = adding to Unsorted;
  // a YYYY-MM-DD string = adding to that day.
  const [addingSection, setAddingSection] = useState<string | null>(null);
  const [flashDrop, setFlashDrop] = useState<number>(0);

  const capBig = planCounts.total.big     >= DAILY_PLAN_CAPS.big;
  const capMed = planCounts.total.medium  >= DAILY_PLAN_CAPS.medium;
  const capSm  = planCounts.total.small   >= DAILY_PLAN_CAPS.small;

  const doDrop = (id: string) => {
    onDrop(id);
    setFlashDrop(Date.now());
    setTimeout(() => setFlashDrop((prev) => (Date.now() - prev >= 1200 ? 0 : prev)), 1300);
  };

  // Build the 7-day day-key window (today + next 6). This is also the
  // set of valid values for the per-item day picker.
  const daySections = useMemo(() => {
    const out: { key: string; label: string; sub?: string; date: Date }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const key = ymd(d);
      let label: string;
      let sub: string | undefined;
      if (i === 0) {
        label = 'Today';
        sub = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      } else if (i === 1) {
        label = 'Tomorrow';
        sub = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      } else {
        label = d.toLocaleDateString([], { weekday: 'short' });
        sub = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }
      out.push({ key, label, sub, date: d });
    }
    return out;
  }, []);

  // Bucket items by section:
  //   - undefined day → Unsorted
  //   - day matching a window key → that section
  //   - day BEFORE today (missed) → folded into Today so nothing
  //     silently disappears
  //   - day AFTER window (day+7 or later) → folded into last section
  //     (rare — user usually won't file that far out)
  const buckets = useMemo(() => {
    const map = new Map<string, WeekBoardItem[]>();
    map.set('', []); // Unsorted
    for (const s of daySections) map.set(s.key, []);

    const todayKey = daySections[0].key;
    const lastKey  = daySections[daySections.length - 1].key;

    for (const item of items) {
      if (!item.day) {
        map.get('')!.push(item);
      } else if (map.has(item.day)) {
        map.get(item.day)!.push(item);
      } else if (item.day < todayKey) {
        // past → fold into today
        map.get(todayKey)!.push(item);
      } else {
        // future beyond window → fold into last visible day
        map.get(lastKey)!.push(item);
      }
    }
    // Sort each bucket by addedAt (oldest first — feels chronological).
    for (const list of map.values()) {
      list.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
    }
    return map;
  }, [items, daySections]);

  return (
    <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <header className="px-4 py-2 border-b border-gray-100 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-gray-800">This week</h3>
        <div className="flex items-center gap-2">
          {flashDrop > 0 && (
            <span className="text-[10px] font-semibold text-emerald-700 animate-pulse">
              ✓ dropped
            </span>
          )}
          {dropsThisWeek > 0 && (
            <span
              className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 tabular-nums"
              title="Intentional drops in the last 7 days — protecting your capacity"
            >
              {dropsThisWeek} dropped
            </span>
          )}
          <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 tabular-nums">
            {items.length} in pool
          </span>
        </div>
      </header>

      <div className="p-2 space-y-2">
        {/* Unsorted — always visible at the top, becomes the "landing
            pad" for items that need to be filed. */}
        <WeekBoardSection
          sectionKey=""
          label="Unsorted"
          sub="no day set"
          items={buckets.get('') || []}
          daySections={daySections}
          isAdding={addingSection === ''}
          onOpenAdd={() => setAddingSection('')}
          onCloseAdd={() => setAddingSection(null)}
          onAdd={(label) => {
            const r = onAdd(label);
            if (r) setAddingSection(null);
          }}
          onPromote={onPromote}
          onDrop={doDrop}
          onSetDay={onSetDay}
          dumpTasks={dumpTasks}
          capBig={capBig}
          capMed={capMed}
          capSm={capSm}
        />

        {daySections.map((s) => (
          <WeekBoardSection
            key={s.key}
            sectionKey={s.key}
            label={s.label}
            sub={s.sub}
            items={buckets.get(s.key) || []}
            daySections={daySections}
            isAdding={addingSection === s.key}
            onOpenAdd={() => setAddingSection(s.key)}
            onCloseAdd={() => setAddingSection(null)}
            onAdd={(label) => {
              const r = onAdd(label, s.key);
              if (r) setAddingSection(null);
            }}
            onPromote={onPromote}
            onDrop={doDrop}
            onSetDay={onSetDay}
            dumpTasks={dumpTasks}
            capBig={capBig}
            capMed={capMed}
            capSm={capSm}
          />
        ))}
      </div>
    </section>
  );
}

function WeekBoardSection({
  sectionKey,
  label,
  sub,
  items,
  daySections,
  isAdding,
  onOpenAdd,
  onCloseAdd,
  onAdd,
  onPromote,
  onDrop,
  onSetDay,
  dumpTasks,
  capBig,
  capMed,
  capSm,
}: {
  sectionKey: string;
  label: string;
  sub?: string;
  items: WeekBoardItem[];
  daySections: { key: string; label: string; sub?: string }[];
  isAdding: boolean;
  onOpenAdd: () => void;
  onCloseAdd: () => void;
  onAdd: (label: string) => void;
  onPromote: (id: string, size: DailyPlanSize) => void;
  onDrop: (id: string) => void;
  onSetDay: (id: string, day: string | undefined) => void;
  dumpTasks: BrainDumpTask[];
  capBig: boolean;
  capMed: boolean;
  capSm: boolean;
}) {
  const isUnsorted = sectionKey === '';
  const isToday = !isUnsorted && sectionKey === daySections[0]?.key;
  const headerTone = isUnsorted
    ? 'text-gray-600'
    : isToday
    ? 'text-indigo-800'
    : 'text-gray-700';

  return (
    <div className={`rounded-xl border ${isToday ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-100 bg-gray-50/40'} px-2 py-1.5`}>
      <div className="flex items-baseline justify-between mb-1">
        <div className={`text-[11px] uppercase tracking-wider font-bold ${headerTone} flex items-baseline gap-1.5`}>
          <span>{label}</span>
          {sub && <span className="text-[10px] font-normal opacity-70 normal-case tracking-normal">{sub}</span>}
          {items.length > 0 && (
            <span className="text-[10px] font-normal opacity-60 tabular-nums font-mono">
              {items.length}
            </span>
          )}
        </div>
      </div>
      <ul className="space-y-1">
        {items.map((item) => (
          <WeekBoardRow
            key={item.id}
            item={item}
            daySections={daySections}
            capBig={capBig}
            capMed={capMed}
            capSm={capSm}
            onPromote={onPromote}
            onDrop={onDrop}
            onSetDay={onSetDay}
          />
        ))}
      </ul>
      {isAdding ? (
        <WeekBoardAddInput
          onCancel={onCloseAdd}
          onSubmit={onAdd}
          dumpTasks={dumpTasks}
          placeholder={isUnsorted ? 'e.g. "finalize loan"' : `Add to ${label.toLowerCase()}`}
        />
      ) : (
        <button
          onClick={onOpenAdd}
          className="mt-1 w-full py-1 text-[10px] font-semibold text-gray-400 hover:text-indigo-700 border border-dashed border-transparent hover:border-indigo-300 rounded"
        >
          + add {isUnsorted ? 'to unsorted' : label.toLowerCase()}
        </button>
      )}
    </div>
  );
}

function WeekBoardAddInput({
  onCancel,
  onSubmit,
  dumpTasks,
  placeholder,
}: {
  onCancel: () => void;
  onSubmit: (label: string) => void;
  dumpTasks: BrainDumpTask[];
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');
  const holdChips = useMemo(() => {
    return [...dumpTasks].sort((a, b) => a.label.length - b.label.length).slice(0, 5);
  }, [dumpTasks]);
  const commit = () => {
    if (!draft.trim()) return;
    onSubmit(draft.trim());
    setDraft('');
  };
  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="flex gap-1.5">
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
          }}
          placeholder={placeholder}
          className="flex-1 min-w-0 px-2 py-1 text-[12px] border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        />
        <button
          onClick={commit}
          disabled={!draft.trim()}
          className="px-2 py-0.5 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-40"
        >
          Add
        </button>
        <button
          onClick={onCancel}
          className="px-1 py-0.5 text-[11px] text-gray-500 hover:text-gray-800"
        >
          ×
        </button>
      </div>
      {holdChips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {holdChips.map((t) => (
            <button
              key={t.id}
              onClick={() => onSubmit(t.label)}
              className="px-2 py-0.5 text-[10px] rounded-full bg-white border border-gray-200 text-gray-700 hover:border-indigo-400 hover:bg-indigo-50/40 max-w-[15rem] truncate"
              title={t.label}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WeekBoardRow({
  item,
  daySections,
  capBig,
  capMed,
  capSm,
  onPromote,
  onDrop,
  onSetDay,
}: {
  item: WeekBoardItem;
  daySections: { key: string; label: string; sub?: string }[];
  capBig: boolean;
  capMed: boolean;
  capSm: boolean;
  onPromote: (id: string, size: DailyPlanSize) => void;
  onDrop: (id: string) => void;
  onSetDay: (id: string, day: string | undefined) => void;
}) {
  return (
    <li className="group flex items-center gap-1 bg-white hover:shadow-sm rounded-lg px-2 py-1.5 border border-gray-100">
      <span className="flex-1 min-w-0 truncate text-[13px] text-gray-900" title={item.label}>
        {item.label}
      </span>
      <select
        value={item.day || ''}
        onChange={(e) => onSetDay(item.id, e.target.value || undefined)}
        title="Change day"
        aria-label="Change day"
        className="text-[10px] text-gray-500 bg-transparent border border-transparent rounded px-1 py-0.5 hover:bg-gray-50 hover:border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 max-w-[5.5rem]"
      >
        <option value="">Unsorted</option>
        {daySections.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      <SizePromoteButton
        glyph="★"
        label="Big"
        tone="text-amber-700 hover:bg-amber-50"
        disabled={capBig}
        title={capBig ? 'Big slot full for today' : 'Promote to today · Big'}
        onClick={() => onPromote(item.id, 'big')}
      />
      <SizePromoteButton
        glyph="●"
        label="Medium"
        tone="text-indigo-700 hover:bg-indigo-50"
        disabled={capMed}
        title={capMed ? 'Medium slots full for today' : 'Promote to today · Medium'}
        onClick={() => onPromote(item.id, 'medium')}
      />
      <SizePromoteButton
        glyph="●"
        label="Small"
        tone="text-teal-700 hover:bg-teal-50"
        disabled={capSm}
        title={capSm ? 'Small slots full for today' : 'Promote to today · Small'}
        onClick={() => onPromote(item.id, 'small')}
      />
      <button
        onClick={() => onDrop(item.id)}
        className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
        title="Drop — protect capacity"
        aria-label="Drop"
      >
        ✕
      </button>
    </li>
  );
}

function SizePromoteButton({
  glyph,
  label,
  tone,
  disabled,
  title,
  onClick,
}: {
  glyph: string;
  label: string;
  tone: string;
  disabled: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={`Promote to ${label}`}
      className={`w-6 h-6 flex items-center justify-center rounded text-[11px] font-bold transition-colors ${
        disabled ? 'text-gray-300 cursor-not-allowed' : tone
      }`}
    >
      {glyph}
    </button>
  );
}

// ---------- North Stars strip ----------
//
// Persistent macro-layer visibility: the 1-3 anchors surface at the top of
// TodayView every launch. Same visibility pattern as pinned todos, one level
// up. Tap a star to jump to its detail page; tap "+ Add" or the empty state
// to open the Stars tab.
function NorthStarsStrip({
  stars,
  onOpenStar,
  onOpenAll,
}: {
  stars: NorthStar[];
  onOpenStar: (id: string) => void;
  onOpenAll: () => void;
}) {
  const active = stars.filter((s) => !s.archivedAt);
  if (active.length === 0) {
    return (
      <button
        onClick={onOpenAll}
        className="w-full text-left bg-white border-2 border-dashed border-gray-200 hover:border-indigo-300 rounded-2xl px-4 py-3 transition-colors"
      >
        <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
          North Stars · 0 anchors
        </div>
        <div className="text-sm text-gray-700 mt-1 leading-snug">
          Pick 1–3 long-term anchors. Everything you do here can attribute to them.
        </div>
      </button>
    );
  }
  return (
    <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <header className="px-4 py-2 flex items-center justify-between border-b border-gray-100">
        <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
          North Stars · steering toward
        </div>
        <button
          onClick={onOpenAll}
          className="text-[10px] uppercase tracking-wider font-semibold text-indigo-600 hover:text-indigo-700"
        >
          Manage ›
        </button>
      </header>
      <ul className="divide-y divide-gray-50">
        {active.map((star) => {
          const c = colorFor(star.color);
          return (
            <li key={star.id}>
              <button
                onClick={() => onOpenStar(star.id)}
                className="w-full text-left px-4 py-2 flex items-center gap-3 hover:bg-gray-50 transition-colors"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: c.hex }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">{star.name}</div>
                  {star.direction && (
                    <div className="text-[11px] text-gray-500 italic truncate">
                      {star.direction}
                    </div>
                  )}
                </div>
                <span className="text-[10px] uppercase tracking-wider text-gray-400 flex-shrink-0">
                  Open ›
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------- Aged-dump strip ----------
//
// BrainDump tasks that have been sitting for 5+ days surface here so long-lived
// intent doesn't quietly rot in the dump. Schedule now (jumps to the calendar
// with the task pre-filled) or drop.
function AgedDumpStrip({
  tasks,
  onSchedule,
  onDrop,
}: {
  tasks: BrainDumpTask[];
  onSchedule: (task: BrainDumpTask) => void;
  onDrop: (id: string) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <section className="bg-white border-2 border-sky-300 rounded-2xl shadow-sm overflow-hidden">
      <header className="px-4 py-2 bg-sky-50 border-b border-sky-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">📥</span>
          <h3 className="text-[13px] font-semibold text-sky-900">Aging in the Hold</h3>
        </div>
        <span className="text-[10px] uppercase tracking-wider font-bold text-sky-700">
          {tasks.length} task{tasks.length === 1 ? '' : 's'} · schedule or drop
        </span>
      </header>
      <ul className="divide-y divide-sky-50">
        {tasks.slice(0, 5).map((t) => {
          const ageDays = Math.floor(
            (Date.now() - new Date(t.extractedAt).getTime()) / (24 * 60 * 60 * 1000)
          );
          return (
            <li key={t.id} className="px-3 py-2 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-900 truncate">{t.label}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  {ageDays}d ago
                </div>
              </div>
              <button
                onClick={() => onSchedule(t)}
                className="flex-shrink-0 px-2.5 py-1 text-[11px] font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-md transition-colors"
                title="Schedule this task on the calendar"
              >
                ↳ Schedule
              </button>
              <button
                onClick={() => {
                  if (confirm(`Drop "${t.label}"? It'll be removed from the Hold.`)) {
                    onDrop(t.id);
                  }
                }}
                className="flex-shrink-0 text-[14px] leading-none text-gray-300 hover:text-red-500 px-1.5 py-1"
                title="Drop this task"
              >
                &times;
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------- State-log strip ----------
//
// Periodic "Feeling ___ because ___" logger. Three feeling chips (Off /
// Neutral / Good), a reason input with autocomplete of previously-used
// reason tags, and a save. Today's entries display as a compact chip strip
// underneath — an at-a-glance view of the day's state trajectory.
//
// No rule mining in v2a; the log itself is half the intervention (making
// state and attribution explicit is calibrating in its own right). v2b
// will mine correlations and feed suggestions into TaskModal.

// Nautical energy dial. Doldrums (dead calm, no wind) → Following seas (aligned
// current + wind at your back). Colors go rose → amber → gray → sky → emerald
// so a glance at the Today trail shows the day's trajectory instantly.
const ENERGY_OPTIONS: {
  value: EnergyLevel;
  label: string;
  emoji: string;
  ring: string;
  bg: string;
  text: string;
  dot: string; // solid color for the trail dot
}[] = [
  { value: 1, label: 'Doldrums', emoji: '🪫', ring: 'ring-rose-300', bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
  { value: 2, label: 'Fog', emoji: '🌫', ring: 'ring-amber-300', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  { value: 3, label: 'Cruising', emoji: '⛵', ring: 'ring-gray-300', bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' },
  { value: 4, label: 'Tailwind', emoji: '💨', ring: 'ring-sky-300', bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
  { value: 5, label: 'Following seas', emoji: '🌊', ring: 'ring-emerald-300', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
];

function energyStyle(level: EnergyLevel) {
  return ENERGY_OPTIONS.find((o) => o.value === level) ?? ENERGY_OPTIONS[2];
}

// Direction chips — did the reasons top up your reserves or spend them down?
// Kept as three explicit options (not a "leave blank to mean neutral" implicit
// default) so the meaning stays legible in the log.
const DIRECTION_OPTIONS: {
  value: EnergyDirection;
  label: string;
  glyph: string;
  activeClass: string;
}[] = [
  { value: 'recharged', label: 'Recharged', glyph: '↑', activeClass: 'bg-emerald-50 border-emerald-300 text-emerald-800' },
  { value: 'neutral',   label: 'Neutral',   glyph: '·', activeClass: 'bg-gray-100 border-gray-300 text-gray-800' },
  { value: 'drained',   label: 'Drained',   glyph: '↓', activeClass: 'bg-rose-50 border-rose-300 text-rose-800' },
];

function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function StateLogStrip({
  todaysEntries,
  recentReasons,
  onAdd,
  onDelete,
}: {
  todaysEntries: StateLogEntry[];
  recentReasons: string[];
  onAdd: (input: {
    energy: EnergyLevel;
    direction?: EnergyDirection;
    reasons: string[];
    note?: string;
  }) => StateLogEntry;
  onDelete: (id: string) => void;
}) {
  // Picking an energy level opens the reason editor. Nothing selected → the
  // strip stays compact with just the 5-chip dial.
  const [pendingEnergy, setPendingEnergy] = useState<EnergyLevel | null>(null);
  const [direction, setDirection] = useState<EnergyDirection>('neutral');
  const [reasonDraft, setReasonDraft] = useState('');
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState('');

  const cancel = () => {
    setPendingEnergy(null);
    setDirection('neutral');
    setReasonDraft('');
    setReasons([]);
    setNote('');
  };

  const commitReasonDraft = () => {
    const trimmed = reasonDraft.trim().toLowerCase();
    if (!trimmed) return;
    if (reasons.includes(trimmed)) {
      setReasonDraft('');
      return;
    }
    setReasons((prev) => [...prev, trimmed]);
    setReasonDraft('');
  };

  const toggleReason = (r: string) => {
    setReasons((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  const submit = () => {
    if (!pendingEnergy) return;
    // Commit any half-typed draft so a Tab-and-Save flow doesn't lose it.
    const trimmed = reasonDraft.trim().toLowerCase();
    const finalReasons =
      trimmed && !reasons.includes(trimmed) ? [...reasons, trimmed] : reasons;
    onAdd({
      energy: pendingEnergy,
      direction,
      reasons: finalReasons,
      note,
    });
    cancel();
  };

  const suggestedReasons = recentReasons.slice(0, 10);

  return (
    <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <header className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-gray-800">Log a moment</h3>
        <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">
          {todaysEntries.length === 0
            ? 'How are you sailing right now?'
            : `${todaysEntries.length} today`}
        </span>
      </header>

      <div className="px-4 py-3 space-y-3">
        {/* Energy dial — 5-level nautical scale from Doldrums to Following seas */}
        <div className="grid grid-cols-5 gap-1.5">
          {ENERGY_OPTIONS.map((opt) => {
            const active = pendingEnergy === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setPendingEnergy(active ? null : opt.value)}
                className={`flex flex-col items-center justify-center px-1 py-2 rounded-xl transition-all ${
                  active
                    ? `${opt.bg} ring-2 ${opt.ring} ${opt.text}`
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                }`}
                title={opt.label}
              >
                <span className="text-base leading-none">{opt.emoji}</span>
                <span className="mt-1 text-[10px] font-semibold leading-tight text-center">
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Reason editor — appears once an energy level is picked */}
        {pendingEnergy && (
          <div className="space-y-3">
            {/* Direction toggle — did this recharge or drain you? */}
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">
                Trend
              </div>
              <div className="flex gap-1.5">
                {DIRECTION_OPTIONS.map((d) => {
                  const active = direction === d.value;
                  return (
                    <button
                      key={d.value}
                      onClick={() => setDirection(d.value)}
                      className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                        active
                          ? d.activeClass
                          : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-sm leading-none">{d.glyph}</span>
                      <span>{d.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">
                Because…
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  type="text"
                  value={reasonDraft}
                  onChange={(e) => setReasonDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitReasonDraft();
                    }
                  }}
                  placeholder='e.g. "morning run", "8h sleep", "coffee"'
                  className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <button
                  onClick={commitReasonDraft}
                  disabled={!reasonDraft.trim()}
                  className="px-2.5 py-2 text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:text-gray-300"
                >
                  Add
                </button>
              </div>
              {reasons.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {reasons.map((r) => (
                    <button
                      key={r}
                      onClick={() => toggleReason(r)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-full hover:bg-indigo-100"
                    >
                      {r}
                      <span className="text-indigo-400 hover:text-indigo-700">×</span>
                    </button>
                  ))}
                </div>
              )}
              {suggestedReasons.length > 0 && (
                <div className="mt-2">
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
                    Recent
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {suggestedReasons.map((r) => {
                      const active = reasons.includes(r);
                      return (
                        <button
                          key={r}
                          onClick={() => toggleReason(r)}
                          className={`px-2 py-0.5 text-[11px] font-mono rounded-full border transition-colors ${
                            active
                              ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'
                          }`}
                        >
                          {r}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">
                Note (optional)
              </div>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder='One-line context if you want to remember why later'
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={cancel}
                className="text-xs text-gray-500 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                className="px-3 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
              >
                Log
              </button>
            </div>
          </div>
        )}

        {/* Today's compact chip strip. Older entries may only carry the legacy
            3-bucket `feeling`; effectiveEnergy() maps both to the 1-5 scale so
            the day's trajectory reads consistently. */}
        {todaysEntries.length > 0 && (
          <div className="pt-1">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
              Today
            </div>
            <ul className="space-y-1">
              {todaysEntries.map((e) => {
                const s = energyStyle(effectiveEnergy(e));
                const dirGlyph =
                  e.direction === 'recharged' ? '↑' :
                  e.direction === 'drained' ? '↓' :
                  null;
                return (
                  <li key={e.id} className="flex items-center gap-2 group">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] ${s.bg} ${s.text}`}
                    >
                      <span>{s.emoji}</span>
                      <span className="font-semibold">{formatClockTime(e.loggedAt)}</span>
                      {dirGlyph && <span className="leading-none">{dirGlyph}</span>}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-[12px] text-gray-700">
                      {e.reasons.length > 0 ? e.reasons.join(' · ') : (e.note || '—')}
                    </span>
                    <button
                      onClick={() => {
                        if (confirm('Delete this state entry?')) onDelete(e.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-[14px] leading-none text-gray-300 hover:text-red-500 transition-opacity"
                      title="Delete"
                    >
                      &times;
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
