import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { TaskBlock, SubTask, SubStep } from '../types';
import { BLOCK_COLORS_RAW } from '../constants';
import { formatFullDate, formatTime24to12 } from '../utils/dateHelpers';
import { parseTaskInput, parseDurationInput, timeToMinutes, minutesToTime } from '../utils/timeParser';
import SubTaskRow from './SubTaskRow';
import AiBreakdownButton from './AiBreakdownButton';

interface TaskModalProps {
  date: Date;
  editingBlock: TaskBlock | null;
  prefillTaskName?: string;
  prefillTime?: string; // "HH:MM" — seeded when the user taps a specific time slot
  onSave: (block: TaskBlock) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function TaskModal({ date, editingBlock, prefillTaskName, prefillTime, onSave, onDelete, onClose }: TaskModalProps) {
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
    } else if (prefillTime && prefillTaskName) {
      // Scheduling a brain-dump task by tapping a time slot — we have both
      // the time and the task name, so jump straight to the confirmed state.
      // User can still hit "Edit" to change either value.
      setMainTime(prefillTime);
      setMainTask(prefillTaskName);
      setMainParsed(true);
      setTimeout(() => subInputRef.current?.focus(), 50);
    } else if (prefillTime) {
      // User tapped a specific time slot but no brain-dump task selected —
      // seed the time and ask for the task name.
      setMainTime(prefillTime);
      mainInputRef.current?.focus();
    } else if (prefillTaskName) {
      // Pre-fill from brain dump — user still needs to add a time
      setMainInput(prefillTaskName);
      mainInputRef.current?.focus();
    } else {
      mainInputRef.current?.focus();
    }
  }, [editingBlock, prefillTaskName, prefillTime]);

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
      // User typed a time in the input — explicit wins over any prefill.
      setMainTask(parsed.label);
      setMainTime(parsed.time);
      setMainParsed(true);
      setTimeout(() => subInputRef.current?.focus(), 50);
      return;
    }
    // No time in the input. If the user tapped a specific time slot, fall back
    // to that and use the whole input as the label.
    if (prefillTime && mainInput.trim()) {
      setMainTask(mainInput.trim());
      setMainTime(prefillTime);
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

  const handleAddStep = (subTaskId: string, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setSubTasks((prev) =>
      prev.map((s) =>
        s.id === subTaskId
          ? { ...s, steps: [...(s.steps || []), { id: uuidv4(), label: trimmed, done: false }] }
          : s
      )
    );
  };

  const handleDeleteStep = (subTaskId: string, stepId: string) => {
    setSubTasks((prev) =>
      prev.map((s) => {
        if (s.id !== subTaskId || !s.steps) return s;
        const steps = s.steps.filter((st) => st.id !== stepId);
        // Drop the empty `steps` array entirely so the subtask reverts to a
        // plain checkbox and `completed` stops getting rolled-up from nothing.
        const next: SubTask = { ...s, steps: steps.length > 0 ? steps : undefined };
        if (!next.steps) delete next.steps;
        return next;
      })
    );
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
                {prefillTime ? 'Name your task' : 'What do you need to do?'}
              </label>
              {prefillTime && (
                <div className="mt-1 mb-2 flex items-center gap-2">
                  <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                    {formatTime24to12(prefillTime)}
                  </span>
                  <span className="text-[11px] text-gray-400">Tap-selected time (type a new time to override)</span>
                </div>
              )}
              <input
                ref={mainInputRef}
                type="text"
                value={mainInput}
                onChange={(e) => setMainInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleMainSubmit()}
                placeholder={prefillTime ? 'e.g. "go for a run"' : 'e.g. "9am go for a run"'}
                className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                {prefillTime
                  ? 'Press Enter to use the tapped time, or include a new time like "7pm meeting"'
                  : 'Type a time and task, then press Enter'}
              </p>
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
                  <div className="space-y-1.5 mb-3">
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
                        <div key={sub.id}>
                          <SubTaskRow
                            time={sub.time}
                            label={sub.label}
                            onDelete={() => handleDeleteSubTask(sub.id)}
                            isPrevDay={!!sub.date}
                          />
                          <StepsEditor
                            subTask={sub}
                            onAddStep={(label) => handleAddStep(sub.id, label)}
                            onDeleteStep={(stepId) => handleDeleteStep(sub.id, stepId)}
                          />
                        </div>
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

// Inline editor for the optional `steps` of a sub-task. Collapsed when there
// are no steps and the user hasn't tapped "Break down"; expands to a list
// of mini-rows plus an input row. Steps are simple labels (no times).
function StepsEditor({
  subTask,
  onAddStep,
  onDeleteStep,
}: {
  subTask: SubTask;
  onAddStep: (label: string) => void;
  onDeleteStep: (stepId: string) => void;
}) {
  const steps: SubStep[] = subTask.steps || [];
  const [open, setOpen] = useState(steps.length > 0);
  const [draft, setDraft] = useState('');

  const submit = () => {
    if (!draft.trim()) return;
    onAddStep(draft);
    setDraft('');
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="ml-7 mt-0.5 text-[11px] text-indigo-500 hover:text-indigo-700 font-medium"
      >
        + Break down
      </button>
    );
  }

  return (
    <div className="ml-7 mt-1 pl-3 border-l-2 border-gray-200 space-y-0.5">
      {steps.map((step) => (
        <div key={step.id} className="flex items-center gap-2 group">
          <span className="w-3 h-3 rounded border border-gray-300 bg-white flex-shrink-0" />
          <span className="text-xs text-gray-700 flex-1">{step.label}</span>
          <button
            onClick={() => onDeleteStep(step.id)}
            className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-base leading-none"
          >
            &times;
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 py-0.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="step (e.g. socks)"
          className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          onClick={submit}
          disabled={!draft.trim()}
          className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 disabled:text-gray-300"
        >
          Add
        </button>
      </div>
      {steps.length === 0 && (
        <button
          onClick={() => setOpen(false)}
          className="text-[10px] text-gray-400 hover:text-gray-600"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
