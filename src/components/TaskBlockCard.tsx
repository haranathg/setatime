import type { RenderedBlock } from '../types';
import { BLOCK_COLORS, BLOCK_COLORS_RAW } from '../constants';
import { formatTime24to12 } from '../utils/dateHelpers';

/** The clock time `durationMinutes` before `end`, as "HH:MM". */
function startTimeOf(end: string, durationMinutes: number): string {
  const [h, m] = end.split(':').map(Number);
  const mins = Math.max(0, (h || 0) * 60 + (m || 0) - durationMinutes);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}


interface TaskBlockCardProps {
  rendered: RenderedBlock;
  colorIndex: number;
  onToggleSubTask: (blockId: string, subTaskId: string) => void;
  onClick: () => void;
}

export default function TaskBlockCard({ rendered, colorIndex, onToggleSubTask, onClick }: TaskBlockCardProps) {
  const { block, topPx, heightPx, left, width, isCrossDay } = rendered;
  // Colour normally follows a block's position in the day, which is fine for
  // blocks you made but wrong for imported ones: the same lecture would be
  // indigo on a day it happens to be first and green on a day it is second,
  // so a calendar could never be recognised at a glance. A block carrying a
  // colour from the palette uses it; everything else is unchanged.
  const ownIndex = BLOCK_COLORS_RAW.indexOf(block.color);
  const colors = BLOCK_COLORS[(ownIndex >= 0 ? ownIndex : colorIndex) % BLOCK_COLORS.length];

  return (
    <div
      className={`absolute rounded-md border-l-3 ${colors.bg} ${colors.border} px-2 py-1 cursor-pointer hover:shadow-md transition-shadow overflow-hidden ${isCrossDay ? 'opacity-80 border-dashed' : ''} ${
        block.commitment?.locked ? 'ring-2 ring-indigo-500/60 dark:ring-indigo-400/60' : ''
      }`}
      style={{
        top: `${topPx}px`,
        height: `${heightPx}px`,
        left,
        width,
      }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {/* Sub-tasks */}
      {block.subTasks.length > 0 && (
        <div className="space-y-0.5">
          {block.subTasks
            .slice()
            .sort((a, b) => a.time.localeCompare(b.time))
            .map((sub) => {
              const stepCount = sub.steps?.length || 0;
              const stepsDone = sub.steps?.filter((st) => st.done).length || 0;
              return (
                <div key={sub.id} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={sub.completed}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onToggleSubTask(block.id, sub.id)}
                    className="w-3 h-3 rounded border-gray-300 dark:border-gray-700 shrink-0"
                  />
                  <span
                    className={`text-[10px] leading-tight ${colors.sub} ${
                      sub.completed ? 'line-through opacity-50' : ''
                    }`}
                  >
                    {formatTime24to12(sub.time)} {sub.label}
                    {stepCount > 0 && (
                      <span className="ml-1 opacity-70 font-mono tabular-nums">[{stepsDone}/{stepCount}]</span>
                    )}
                  </span>
                </div>
              );
            })}
        </div>
      )}

      {/* Main task.
          A block's `mainTime` is its anchor, which for anything you created
          is the time that matters. An imported commitment is different: it
          is a span you are sitting inside, and labelling a 1–4pm lab "4:00
          PM" reads as the wrong start time. Those get the range instead. */}
      <div className={`font-semibold text-xs ${colors.text} mt-0.5 leading-tight`}>
        {/* A locked block is a decision, not a hope. Marked rather than
            having everything else dimmed, so an unlocked week does not
            suddenly read as provisional. */}
        {block.commitment?.locked && <span title="Locked in">● </span>}
        {block.calendar && block.durationMinutes && !block.isAllDay
          ? `${formatTime24to12(startTimeOf(block.mainTime, block.durationMinutes))}–${formatTime24to12(block.mainTime)}`
          : formatTime24to12(block.mainTime)}{' '}
        {block.mainTask}
      </div>
    </div>
  );
}
