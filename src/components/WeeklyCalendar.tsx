import { useState, useRef, useEffect } from 'react';
import type { TaskBlock, BrainDumpTask } from '../types';
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
  schedulingTask,
  onScheduleComplete,
}: WeeklyCalendarProps) {
  const [modalDate, setModalDate] = useState<Date | null>(null);
  const [editingBlock, setEditingBlock] = useState<TaskBlock | null>(null);
  const [mobileSelectedDay, setMobileSelectedDay] = useState<number>(() => new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);
  const scrollRef = useRef<HTMLDivElement>(null);

  const weekDays = getWeekDays(currentWeekStart);

  // Auto-scroll to default hour on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (DEFAULT_SCROLL_HOUR - START_HOUR) * HOUR_HEIGHT_PX;
    }
  }, []);

  const handleDayClick = (date: Date) => {
    setModalDate(date);
    setEditingBlock(null);
  };

  const handleBlockClick = (block: TaskBlock) => {
    const blockDate = new Date(block.date + 'T00:00:00');
    setModalDate(blockDate);
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
          prefillTaskName={schedulingTask?.label}
          onSave={handleSave}
          onDelete={onDeleteBlock}
          onClose={() => { setModalDate(null); setEditingBlock(null); }}
        />
      )}
    </div>
  );
}
