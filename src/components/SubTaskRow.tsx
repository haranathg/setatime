import { formatTime24to12 } from '../utils/dateHelpers';

interface SubTaskRowProps {
  time: string;
  label: string;
  completed?: boolean;
  onDelete?: () => void;
  onToggle?: () => void;
  editable?: boolean;
  isPrevDay?: boolean;
}

export default function SubTaskRow({ time, label, completed, onDelete, onToggle, editable = true, isPrevDay }: SubTaskRowProps) {
  return (
    <div className="flex items-center gap-2 py-1 group">
      {onToggle && (
        <input
          type="checkbox"
          checked={completed}
          onChange={onToggle}
          className="w-4 h-4 rounded border-gray-300 dark:border-gray-700 text-indigo-600 dark:text-indigo-400"
        />
      )}
      <span className={`text-xs font-medium px-1.5 py-0.5 rounded min-w-[60px] text-center ${isPrevDay ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40' : 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40'}`}>
        {isPrevDay ? 'prev day ' : ''}{formatTime24to12(time)}
      </span>
      <span className={`text-sm text-gray-700 dark:text-gray-300 flex-1 ${completed ? 'line-through opacity-50' : ''}`}>
        {label}
      </span>
      {editable && onDelete && (
        <button
          onClick={onDelete}
          className="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-lg leading-none"
        >
          &times;
        </button>
      )}
    </div>
  );
}
