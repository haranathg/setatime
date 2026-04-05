import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { TaskBlock, SubTask } from '../types';
import { BLOCK_COLORS_RAW } from '../constants';
import { formatFullDate, formatTime24to12 } from '../utils/dateHelpers';
import { parseTaskInput, parseDurationInput, timeToMinutes, minutesToTime } from '../utils/timeParser';
import SubTaskRow from './SubTaskRow';
import AiBreakdownButton from './AiBreakdownButton';

interface TaskModalProps {
  date: Date;
  editingBlock: TaskBlock | null;
  prefillTaskName?: string;
  onSave: (block: TaskBlock) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function TaskModal({ date, editingBlock, prefillTaskName, onSave, onDelete, onClose }: TaskModalProps) {
  const [mainInput, setMainInput] = useState('');
  const [mainTask, setMainTask] = useState('');
  const [mainTime, setMainTime] = useState('');
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);
  const [subInput, setSubInput] = useState('');
  const [mainParsed, setMainParsed] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [rescheduleInput, setRescheduleInput] = useState('');
  const [showReschedule, setShowReschedule] = useState(false);

  const mainInputRef = useRef<HTMLInputElement>(null);
  const subInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingBlock) {
      setMainTask(editingBlock.mainTask);
      setMainTime(editingBlock.mainTime);
      setSubTasks(editingBlock.subTasks);
      setMainParsed(true);
    } else if (prefillTaskName) {
      // Pre-fill from brain dump — user still needs to add a time
      setMainInput(prefillTaskName);
      mainInputRef.current?.focus();
    } else {
      mainInputRef.current?.focus();
    }
  }, [editingBlock, prefillTaskName]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleMainSubmit = () => {
    const parsed = parseTaskInput(mainInput, date);
    if (parsed) {
      setMainTask(parsed.label);
      setMainTime(parsed.time);
      setMainParsed(true);
      setTimeout(() => subInputRef.current?.focus(), 50);
    }
  };

  const handleReschedule = () => {
    // Parse just the time from user input — append a dummy label so chrono can match
    const parsed = parseTaskInput(`${rescheduleInput} task`, date);
    if (!parsed) return;

    const oldMinutes = timeToMinutes(mainTime);
    const newMinutes = timeToMinutes(parsed.time);
    const delta = newMinutes - oldMinutes;

    if (delta === 0) {
      setShowReschedule(false);
      return;
    }

    const blockDateKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    const prevDate = new Date(date);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateKey = `${prevDate.getFullYear()}-${(prevDate.getMonth() + 1).toString().padStart(2, '0')}-${prevDate.getDate().toString().padStart(2, '0')}`;

    // Shift all incomplete subtasks by the delta
    setSubTasks((prev) =>
      prev.map((sub) => {
        if (sub.completed) return sub;

        // Convert sub-task to absolute minutes from midnight of main task day
        // Previous-day tasks are negative (e.g., 22:00 prev day = -120 relative to midnight)
        const subMinutes = timeToMinutes(sub.time);
        const isPrevDay = !!sub.date && sub.date !== blockDateKey;
        const absoluteMinutes = isPrevDay ? subMinutes - 1440 : subMinutes;
        const shifted = absoluteMinutes + delta;

        if (shifted < 0) {
          // Still on previous day
          const timeOnPrevDay = shifted + 1440; // e.g., -120 + 1440 = 1320 = 22:00
          return { ...sub, time: minutesToTime(timeOnPrevDay), date: prevDateKey };
        } else {
          // On main task day
          const newSub = { ...sub, time: minutesToTime(shifted) };
          if (isPrevDay) delete newSub.date; // moved back to main day
          return newSub;
        }
      })
    );

    setMainTime(parsed.time);
    setRescheduleInput('');
    setShowReschedule(false);
  };

  const handleSubSubmit = () => {
    // Try duration parsing FIRST ("1 hour drive", "sleep for 9 hours")
    // because chrono-node also matches durations like "for 9 hours" as relative times
    const duration = parseDurationInput(subInput);
    if (duration && mainTime) {
      const blockDateKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
      const prevDate = new Date(date);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateKey = `${prevDate.getFullYear()}-${(prevDate.getMonth() + 1).toString().padStart(2, '0')}-${prevDate.getDate().toString().padStart(2, '0')}`;

      // Check if there are already previous-day sub-tasks
      const prevDaySubs = subTasks.filter((s) => s.date === prevDateKey);

      if (prevDaySubs.length > 0) {
        // Subtract from the earliest previous-day sub-task
        const earliestPrevMinutes = Math.min(...prevDaySubs.map((s) => timeToMinutes(s.time)));
        const newMinutes = earliestPrevMinutes - duration.minutes;
        const newTime = minutesToTime(newMinutes);

        // Still on previous day if >= 0, otherwise wraps to two days ago (unlikely but safe)
        setSubTasks((prev) => [
          ...prev,
          { id: uuidv4(), time: newTime, label: `${duration.label} (${duration.minutes}min)`, completed: false, date: prevDateKey },
        ]);
      } else {
        // No previous-day subs — subtract from earliest same-day time
        const sameDayTimes = [mainTime, ...subTasks.filter((s) => !s.date || s.date === blockDateKey).map((s) => s.time)];
        const earliestMinutes = Math.min(...sameDayTimes.map(timeToMinutes));
        const rawMinutes = earliestMinutes - duration.minutes;

        if (rawMinutes < 0) {
          // Crosses midnight — place on previous day
          const wrappedTime = minutesToTime(rawMinutes);
          setSubTasks((prev) => [
            ...prev,
            { id: uuidv4(), time: wrappedTime, label: `${duration.label} (${duration.minutes}min)`, completed: false, date: prevDateKey },
          ]);
        } else {
          const newTime = minutesToTime(rawMinutes);
          setSubTasks((prev) => [
            ...prev,
            { id: uuidv4(), time: newTime, label: `${duration.label} (${duration.minutes}min)`, completed: false },
          ]);
        }
      }
      setSubInput('');
      return;
    }

    // Fallback: try exact time parsing ("7:55am wake up")
    const parsed = parseTaskInput(subInput, date);
    if (parsed) {
      setSubTasks((prev) => [
        ...prev,
        { id: uuidv4(), time: parsed.time, label: parsed.label, completed: false },
      ]);
      setSubInput('');
    }
  };

  const handleDeleteSubTask = (id: string) => {
    setSubTasks((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSave = () => {
    if (!mainTask || !mainTime) return;

    const block: TaskBlock = {
      id: editingBlock?.id || uuidv4(),
      date: `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`,
      mainTask,
      mainTime,
      subTasks,
      color: editingBlock?.color || BLOCK_COLORS_RAW[Math.floor(Math.random() * BLOCK_COLORS_RAW.length)],
      createdAt: editingBlock?.createdAt || new Date().toISOString(),
    };

    onSave(block);
    onClose();
  };

  const handleAiSubTasks = (generated: SubTask[]) => {
    setSubTasks((prev) => [...prev, ...generated]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ height: '100dvh' }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-xl flex flex-col animate-slide-up"
        style={{
          maxHeight: 'calc(85dvh - env(safe-area-inset-bottom, 0px))',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {editingBlock ? 'Edit Task' : 'New Task'}
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{formatFullDate(date)}</span>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
              &times;
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Main task input */}
          {!mainParsed ? (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                What do you need to do?
              </label>
              <input
                ref={mainInputRef}
                type="text"
                value={mainInput}
                onChange={(e) => setMainInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleMainSubmit()}
                placeholder='e.g. "9am go for a run"'
                className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <p className="text-[11px] text-gray-400 mt-1">Type a time and task, then press Enter</p>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                    {formatTime24to12(mainTime)}
                  </span>
                  <span className="ml-2 text-sm font-semibold text-gray-900">{mainTask}</span>
                </div>
                <div className="flex items-center gap-2">
                  {subTasks.length > 0 && (
                    <button
                      onClick={() => setShowReschedule(!showReschedule)}
                      className="text-xs text-indigo-500 hover:text-indigo-700"
                    >
                      Reschedule
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setMainParsed(false);
                      setMainInput(`${formatTime24to12(mainTime)} ${mainTask}`);
                    }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Edit
                  </button>
                </div>
              </div>
              {showReschedule && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={rescheduleInput}
                    onChange={(e) => setRescheduleInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleReschedule()}
                    placeholder='New time, e.g. "7pm"'
                    className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    autoFocus
                  />
                  <button
                    onClick={handleReschedule}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                  >
                    Move
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Sub-tasks */}
          {mainParsed && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Steps to get ready
                  </label>
                  <AiBreakdownButton
                    mainTask={mainTask}
                    mainTime={mainTime}
                    onSubTasksGenerated={handleAiSubTasks}
                  />
                </div>

                {/* Sub-task list */}
                {subTasks.length > 0 && (
                  <div className="space-y-0.5 mb-3">
                    {subTasks
                      .slice()
                      .sort((a, b) => {
                        // Cross-day (previous day) sub-tasks sort last (they're earliest chronologically)
                        const aHasDate = a.date ? 0 : 1;
                        const bHasDate = b.date ? 0 : 1;
                        if (aHasDate !== bHasDate) return bHasDate - aHasDate;
                        return b.time.localeCompare(a.time);
                      })
                      .map((sub) => (
                        <SubTaskRow
                          key={sub.id}
                          time={sub.time}
                          label={sub.label}
                          onDelete={() => handleDeleteSubTask(sub.id)}
                          isPrevDay={!!sub.date}
                        />
                      ))}
                  </div>
                )}

                {/* Sub-task input */}
                <input
                  ref={subInputRef}
                  type="text"
                  value={subInput}
                  onChange={(e) => setSubInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubSubmit()}
                  placeholder='e.g. "7:55am wake up" or "1 hour drive"'
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <p className="text-[11px] text-gray-400 mt-1">Time ("7:55am wake up") or duration ("1 hour drive") — press Enter</p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-3">
          {editingBlock && (
            <>
              {showDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600">Delete this task?</span>
                  <button
                    onClick={() => { onDelete(editingBlock.id); onClose(); }}
                    className="text-xs font-medium text-white bg-red-500 rounded-lg px-3 py-1.5 hover:bg-red-600"
                  >
                    Yes, delete
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-sm text-red-500 hover:text-red-600"
                >
                  Delete
                </button>
              )}
            </>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!mainParsed || !mainTask}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {editingBlock ? 'Update' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
