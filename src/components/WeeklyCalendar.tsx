import { useState, useRef, useEffect } from 'react';
import type { TaskBlock, BrainDumpTask, BlockTemplate, SubTask } from '../types';
import { HOURS, HOUR_HEIGHT_PX, DEFAULT_SCROLL_HOUR, START_HOUR } from '../constants';
import { getWeekDays, getWeekRangeLabel, formatDayHeader, isToday } from '../utils/dateHelpers';
import DayColumn from './DayColumn';
import TaskModal from './TaskModal';

interface WeeklyCalendarProps {
  currentWeekStart: Date;
  getBlocksForDate: (date: Date) => TaskBlock[];
  onNavigateWeek: (direction: -1 | 1) => void;
  onGoToToday: () => void;
  onAddBlock: (block: TaskBlock) => void;
  onUpdateBlock: (block: TaskBlock) => void;
  onDeleteBlock: (id: string) => void;
  onToggleSubTask: (blockId: string, subTaskId: string) => void;
  templates: BlockTemplate[];
  onSaveTemplate: (input: {
    name: string;
    mainTaskLabel: string;
    color?: string;
    subTasks: SubTask[];
    mainTime: string;
    mainDateKey: string;
  }) => BlockTemplate;
  onDeleteTemplate: (id: string) => void;
  onSkipSpiralOccurrence: (spiralId: string, dateKey: string) => void;
  onOpenSpiralSettings: () => void;
  // Initial "schedule this" jump payload from another surface (Lab experiment,
  // Chart plan task, aged dump task). Opens the TaskModal pre-filled once.
  initialPrefill?: {
    taskName?: string;
    time?: string;
    dateKey?: string;
  } | null;
  onConsumedInitialPrefill?: () => void;
  schedulingTask?: BrainDumpTask | null;
  onScheduleComplete?: () => void;
}

export default function WeeklyCalendar({
  currentWeekStart,
  getBlocksForDate,
  onNavigateWeek,
  onGoToToday,
  onAddBlock,
  onUpdateBlock,
  onDeleteBlock,
  onToggleSubTask,
  templates,
  onSaveTemplate,
  onDeleteTemplate,
  onSkipSpiralOccurrence,
  onOpenSpiralSettings,
  initialPrefill,
  onConsumedInitialPrefill,
  schedulingTask,
  onScheduleComplete,
}: WeeklyCalendarProps) {
  const [modalDate, setModalDate] = useState<Date | null>(null);
  const [modalPrefillTime, setModalPrefillTime] = useState<string | undefined>(undefined);
  const [modalPrefillTaskName, setModalPrefillTaskName] = useState<string | undefined>(undefined);
  const [editingBlock, setEditingBlock] = useState<TaskBlock | null>(null);
  // When a virtual spiral block is tapped we open a small popover instead of
  // the regular TaskModal (which expects real, editable TaskBlocks).
  const [spiralPopover, setSpiralPopover] = useState<TaskBlock | null>(null);
  const [mobileSelectedDay, setMobileSelectedDay] = useState<number>(() => new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);
  const scrollRef = useRef<HTMLDivElement>(null);

  const weekDays = getWeekDays(currentWeekStart);

  // Auto-scroll to default hour on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (DEFAULT_SCROLL_HOUR - START_HOUR) * HOUR_HEIGHT_PX;
    }
  }, []);

  // If another surface handed us a "schedule this" payload, open the TaskModal
  // pre-filled once, then clear the parent's state.
  useEffect(() => {
    if (!initialPrefill) return;
    const date = initialPrefill.dateKey
      ? new Date(initialPrefill.dateKey + 'T00:00:00')
      : new Date();
    setModalDate(date);
    setModalPrefillTime(initialPrefill.time);
    setModalPrefillTaskName(initialPrefill.taskName);
    setEditingBlock(null);
    onConsumedInitialPrefill?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrefill]);

  const handleDayClick = (date: Date, prefillTime?: string) => {
    setModalDate(date);
    setModalPrefillTime(prefillTime);
    setEditingBlock(null);
  };

  const handleBlockClick = (block: TaskBlock) => {
    if (block.virtualSpiral) {
      // Virtual spiral instances aren't real, editable TaskBlocks. Show a
      // small popover with Log / Skip / open spiral Settings instead.
      setSpiralPopover(block);
      return;
    }
    const blockDate = new Date(block.date + 'T00:00:00');
    setModalDate(blockDate);
    setModalPrefillTime(undefined);
    setEditingBlock(block);
  };

  const handleSave = (block: TaskBlock) => {
    if (editingBlock) {
      onUpdateBlock(block);
    } else {
      onAddBlock(block);
      // If we were scheduling from brain dump, mark it complete
      if (schedulingTask) {
        onScheduleComplete?.();
      }
    }
  };

  const formatHour = (hour: number) => {
    if (hour === 0) return '12 AM';
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return '12 PM';
    return `${hour - 12} PM`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Navigation bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white z-20 shrink-0">
        <button
          onClick={() => onNavigateWeek(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">{getWeekRangeLabel(currentWeekStart)}</span>
          <button
            onClick={onGoToToday}
            className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            Today
          </button>
        </div>
        <button
          onClick={() => onNavigateWeek(1)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Mobile day selector */}
      <div className="sm:hidden flex border-b border-gray-200 bg-white overflow-x-auto shrink-0">
        {weekDays.map((day, i) => (
          <button
            key={i}
            onClick={() => setMobileSelectedDay(i)}
            className={`flex-1 min-w-[48px] py-2 text-center text-xs font-medium transition-colors ${
              mobileSelectedDay === i
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : isToday(day)
                ? 'text-indigo-500'
                : 'text-gray-500'
            }`}
          >
            {formatDayHeader(day)}
          </button>
        ))}
      </div>

      {/* Desktop day headers — fixed above scroll area */}
      <div className="hidden sm:grid border-b border-gray-200 bg-white shrink-0" style={{ gridTemplateColumns: '50px repeat(7, 1fr)' }}>
        <div />
        {weekDays.map((day, i) => (
          <div
            key={i}
            className={`text-center py-2 text-sm font-medium border-l border-gray-100 ${
              isToday(day) ? 'text-indigo-600' : 'text-gray-700'
            }`}
          >
            <span className={isToday(day) ? 'bg-indigo-600 text-white rounded-full px-2 py-0.5' : ''}>
              {formatDayHeader(day)}
            </span>
          </div>
        ))}
      </div>

      {/* Scheduling mode banner */}
      {schedulingTask && (
        <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2 shrink-0">
          <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
          <span className="text-sm text-indigo-700">
            Click a time slot to schedule: <strong>{schedulingTask.label}</strong>
          </span>
        </div>
      )}

      {/* Scrollable calendar grid */}
      <div ref={scrollRef} className="flex-1 overflow-auto relative">
        {/* Desktop: full week */}
        <div className="hidden sm:grid pt-2" style={{ gridTemplateColumns: '50px repeat(7, 1fr)' }}>
          {/* Time gutter */}
          <div className="relative" style={{ height: `${HOURS.length * HOUR_HEIGHT_PX}px` }}>
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute w-full text-right pr-2 text-[10px] text-gray-400 -mt-2"
                style={{ top: `${(hour - HOURS[0]) * HOUR_HEIGHT_PX}px` }}
              >
                {formatHour(hour)}
              </div>
            ))}
          </div>
          {/* Day columns */}
          {weekDays.map((day, i) => (
            <div key={i} className="border-l border-gray-100" style={{ height: `${HOURS.length * HOUR_HEIGHT_PX}px` }}>
              <DayColumn
                date={day}
                blocks={getBlocksForDate(day)}
                onDayClick={handleDayClick}
                onBlockClick={handleBlockClick}
                onToggleSubTask={onToggleSubTask}
                hideHeader
              />
            </div>
          ))}
        </div>

        {/* Mobile: single day */}
        <div className="sm:hidden grid pt-2" style={{ gridTemplateColumns: '44px 1fr' }}>
          <div className="relative" style={{ height: `${HOURS.length * HOUR_HEIGHT_PX}px` }}>
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute w-full text-right pr-1 text-[10px] text-gray-400 -mt-2"
                style={{ top: `${(hour - HOURS[0]) * HOUR_HEIGHT_PX}px` }}
              >
                {formatHour(hour)}
              </div>
            ))}
          </div>
          <div className="border-l border-gray-100" style={{ height: `${HOURS.length * HOUR_HEIGHT_PX}px` }}>
            <DayColumn
              date={weekDays[mobileSelectedDay]}
              blocks={getBlocksForDate(weekDays[mobileSelectedDay])}
              onDayClick={handleDayClick}
              onBlockClick={handleBlockClick}
              onToggleSubTask={onToggleSubTask}
              hideHeader
            />
          </div>
        </div>

        {/* Empty state */}
        {weekDays.every((day) => getBlocksForDate(day).length === 0) && (
          <div className="flex items-center justify-center py-8 pointer-events-none" style={{ position: 'absolute', top: '40%', left: 0, right: 0 }}>
            <p className="text-sm text-gray-400">Tap any time slot to plan your first task</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalDate && (
        <TaskModal
          date={modalDate}
          editingBlock={editingBlock}
          prefillTaskName={schedulingTask?.label ?? modalPrefillTaskName}
          prefillTime={modalPrefillTime}
          templates={templates}
          getBlocksForDate={getBlocksForDate}
          onSave={handleSave}
          onSaveTemplate={onSaveTemplate}
          onDeleteTemplate={onDeleteTemplate}
          onDelete={onDeleteBlock}
          onClose={() => {
            setModalDate(null);
            setEditingBlock(null);
            setModalPrefillTime(undefined);
            setModalPrefillTaskName(undefined);
          }}
        />
      )}

      {/* Virtual-spiral popover */}
      {spiralPopover && spiralPopover.virtualSpiral && (
        <SpiralPopover
          block={spiralPopover}
          onSkip={() => {
            const ref = spiralPopover.virtualSpiral!;
            onSkipSpiralOccurrence(ref.spiralId, ref.dateKey);
            setSpiralPopover(null);
          }}
          onOpenSettings={() => {
            setSpiralPopover(null);
            onOpenSpiralSettings();
          }}
          onClose={() => setSpiralPopover(null)}
        />
      )}
    </div>
  );
}

// ---------- Virtual-spiral popover ----------
//
// Tapping a recurring spiral's calendar block opens this. v1 actions: skip
// this occurrence, or open the spiral's settings (which lives on TodayView).
// Direct "log it" lives on the dashboard tile; we don't duplicate it here
// because most logging flows naturally through the tile face.
function SpiralPopover({
  block,
  onSkip,
  onOpenSettings,
  onClose,
}: {
  block: TaskBlock;
  onSkip: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ height: '100dvh' }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl shadow-xl flex flex-col animate-slide-up"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-indigo-600 font-bold">
              ↻ Recurring spiral
            </div>
            <h3 className="text-base font-semibold text-gray-900 mt-0.5">{block.mainTask}</h3>
            <div className="text-[11px] text-gray-500 mt-0.5 font-mono">
              {block.mainTime} · {block.date}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            &times;
          </button>
        </div>
        <div className="px-5 py-3 space-y-2">
          <button
            onClick={onSkip}
            className="w-full text-left px-4 py-3 bg-white border border-gray-200 hover:border-amber-300 hover:bg-amber-50 rounded-xl transition-colors"
          >
            <div className="text-sm font-semibold text-gray-900">Skip just this day</div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              The block disappears from this date only. Future occurrences are unaffected.
            </div>
          </button>
          <button
            onClick={onOpenSettings}
            className="w-full text-left px-4 py-3 bg-white border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 rounded-xl transition-colors"
          >
            <div className="text-sm font-semibold text-gray-900">Open spiral settings</div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              Change cadence, time, duration, or pause this spiral.
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
