import type { RenderedBlock } from '../types';
import { BLOCK_COLORS } from '../constants';
import { formatTime24to12 } from '../utils/dateHelpers';

interface TaskBlockCardProps {
  rendered: RenderedBlock;
  colorIndex: number;
  onToggleSubTask: (blockId: string, subTaskId: string) => void;
  onClick: () => void;
}

export default function TaskBlockCard({ rendered, colorIndex, onToggleSubTask, onClick }: TaskBlockCardProps) {
  const { block, topPx, heightPx, left, width } = rendered;
  const colors = BLOCK_COLORS[colorIndex % BLOCK_COLORS.length];

  return (
    <div
      className={`absolute rounded-md border-l-3 ${colors.bg} ${colors.border} px-2 py-1 cursor-pointer hover:shadow-md transition-shadow overflow-hidden`}
      style={{
        top: `${topPx}px`,
        height: `${heightPx}px`,
        left,
        width,
      }}
      onClick={onClick}
    >
      {/* Sub-tasks */}
      {block.subTasks.length > 0 && (
        <div className="space-y-0.5">
          {block.subTasks
            .slice()
            .sort((a, b) => a.time.localeCompare(b.time))
            .map((sub) => (
              <div key={sub.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={sub.completed}
                  onChange={(e) => {
                    e.stopPropagation();
                    onToggleSubTask(block.id, sub.id);
                  }}
                  className="w-3 h-3 rounded border-gray-300 shrink-0"
                />
                <span
                  className={`text-[10px] leading-tight ${colors.sub} ${
                    sub.completed ? 'line-through opacity-50' : ''
                  }`}
                >
                  {formatTime24to12(sub.time)} {sub.label}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Main task */}
      <div className={`font-semibold text-xs ${colors.text} mt-0.5 leading-tight`}>
        {formatTime24to12(block.mainTime)} {block.mainTask}
      </div>
    </div>
  );
}
