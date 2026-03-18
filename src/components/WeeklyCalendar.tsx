import { useState } from 'react';
import type { TaskBlock } from '../types';
import { HOURS, HOUR_HEIGHT_PX } from '../constants';
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
}: WeeklyCalendarProps) {
  const [modalDate, setModalDate] = useState<Date | null>(null);
  const [editingBlock, setEditingBlock] = useState<TaskBlock | null>(null);
  const [mobileSelectedDay, setMobileSelectedDay] = useState<number>(() => new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);

  const weekDays = getWeekDays(currentWeekStart);

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
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white sticky top-[53px] z-20">
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
      <div className="sm:hidden flex border-b border-gray-200 bg-white overflow-x-auto">
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

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto">
        {/* Desktop: full week */}
        <div className="hidden sm:grid" style={{ gridTemplateColumns: '50px repeat(7, 1fr)' }}>
          {/* Empty corner for header alignment */}
          <div className="border-b border-gray-200" />
          {/* Day headers */}
          {weekDays.map((_day, i) => (
            <div key={i} className="border-b border-gray-200" />
          ))}

          {/* Time gutter + day columns */}
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
          {weekDays.map((day, i) => (
            <div key={i} className="border-l border-gray-100">
              <DayColumn
                date={day}
                blocks={getBlocksForDate(day)}
                onDayClick={handleDayClick}
                onBlockClick={handleBlockClick}
                onToggleSubTask={onToggleSubTask}
              />
            </div>
          ))}
        </div>

        {/* Mobile: single day */}
        <div className="sm:hidden grid" style={{ gridTemplateColumns: '44px 1fr' }}>
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
          <div className="border-l border-gray-100">
            <DayColumn
              date={weekDays[mobileSelectedDay]}
              blocks={getBlocksForDate(weekDays[mobileSelectedDay])}
              onDayClick={handleDayClick}
              onBlockClick={handleBlockClick}
              onToggleSubTask={onToggleSubTask}
            />
          </div>
        </div>

        {/* Empty state */}
        {weekDays.every((day) => getBlocksForDate(day).length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-gray-400">Click any day to plan your first task</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalDate && (
        <TaskModal
          date={modalDate}
          editingBlock={editingBlock}
          onSave={handleSave}
          onDelete={onDeleteBlock}
          onClose={() => { setModalDate(null); setEditingBlock(null); }}
        />
      )}
    </div>
  );
}
