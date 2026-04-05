import type { TaskBlock } from '../types';
import { HOURS, HOUR_HEIGHT_PX, START_HOUR, END_HOUR } from '../constants';
import { formatDayHeader, isToday, formatDateKey } from '../utils/dateHelpers';
import { computeRenderedBlocks } from '../utils/calendarLayout';
import TaskBlockCard from './TaskBlockCard';

interface DayColumnProps {
  date: Date;
  blocks: TaskBlock[];
  onDayClick: (date: Date, prefillTime?: string) => void;
  onBlockClick: (block: TaskBlock) => void;
  onToggleSubTask: (blockId: string, subTaskId: string) => void;
  hideHeader?: boolean;
}

// Snap minutes to the nearest 15-minute slot, clamp to the visible day range.
function snapMinutesToSlot(minutes: number): number {
  const snapped = Math.round(minutes / 15) * 15;
  const minM = START_HOUR * 60;
  const maxM = END_HOUR * 60 + 45; // last 15-min slot of the last hour
  return Math.max(minM, Math.min(maxM, snapped));
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export default function DayColumn({ date, blocks, onDayClick, onBlockClick, onToggleSubTask, hideHeader }: DayColumnProps) {
  const today = isToday(date);
  const dateKey = formatDateKey(date);
  const rendered = computeRenderedBlocks(blocks, dateKey);

  // Current time indicator
  const now = new Date();
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const showTimeLine = today && currentMinute >= START_HOUR * 60;
  const timeLineTop = ((currentMinute - START_HOUR * 60) / 60) * HOUR_HEIGHT_PX;

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Compute Y offset relative to the grid, independent of any scroll ancestor.
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const minutesFromStart = (offsetY / HOUR_HEIGHT_PX) * 60;
    const absoluteMinutes = START_HOUR * 60 + minutesFromStart;
    const snapped = snapMinutesToSlot(absoluteMinutes);
    onDayClick(date, minutesToHHMM(snapped));
  };

  return (
    <div className="flex flex-col min-w-0">
      {/* Day header — only shown when not hidden by parent */}
      {!hideHeader && (
        <div
          className={`text-center py-2 text-sm font-medium border-b border-gray-200 bg-white z-10 ${
            today ? 'text-indigo-600' : 'text-gray-700'
          }`}
        >
          <span className={today ? 'bg-indigo-600 text-white rounded-full px-2 py-0.5' : ''}>
            {formatDayHeader(date)}
          </span>
        </div>
      )}

      {/* Hour grid */}
      <div
        className="relative cursor-pointer"
        style={{ height: `${HOURS.length * HOUR_HEIGHT_PX}px`, minHeight: `${HOURS.length * HOUR_HEIGHT_PX}px` }}
        onClick={handleGridClick}
      >
        {/* Hour lines */}
        {HOURS.map((hour) => (
          <div
            key={hour}
            className="absolute w-full border-t border-gray-100"
            style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT_PX}px` }}
          />
        ))}

        {/* Current time line */}
        {showTimeLine && (
          <div
            className="absolute w-full z-20 pointer-events-none"
            style={{ top: `${timeLineTop}px` }}
          >
            <div className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
              <div className="flex-1 h-[2px] bg-red-500" />
            </div>
          </div>
        )}

        {/* Task blocks */}
        <div className="absolute inset-0 mx-1">
          {rendered.map((rb, i) => (
            <TaskBlockCard
              key={rb.block.id}
              rendered={rb}
              colorIndex={i}
              onToggleSubTask={onToggleSubTask}
              onClick={() => onBlockClick(rb.block)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
