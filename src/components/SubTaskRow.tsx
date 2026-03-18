import { formatTime24to12 } from '../utils/dateHelpers';

interface SubTaskRowProps {
  time: string;
  label: string;
  completed?: boolean;
  onDelete?: () => void;
  onToggle?: () => void;
  editable?: boolean;
}

export default function SubTaskRow({ time, label, completed, onDelete, onToggle, editable = true }: SubTaskRowProps) {
  return (
    <div className="flex items-center gap-2 py-1 group">
      {onToggle && (
        <input
          type="checkbox"
          checked={completed}
          onChange={onToggle}
          className="w-4 h-4 rounded border-gray-300 text-indigo-600"
        />
      )}
      <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded min-w-[60px] text-center">
        {formatTime24to12(time)}
      </span>
      <span className={`text-sm text-gray-700 flex-1 ${completed ? 'line-through opacity-50' : ''}`}>
        {label}
      </span>
      {editable && onDelete && (
        <button
          onClick={onDelete}
          className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-lg leading-none"
        >
          &times;
        </button>
      )}
    </div>
  );
}
