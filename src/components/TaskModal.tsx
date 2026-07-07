import { useMemo, useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { TaskBlock, SubTask, SubStep, BlockTemplate } from '../types';
import { BLOCK_COLORS_RAW } from '../constants';
import { formatFullDate, formatTime24to12 } from '../utils/dateHelpers';
import { parseTaskInput, parseDurationInput, timeToMinutes, minutesToTime } from '../utils/timeParser';
import { suggestTimes, buildDayOptions, type TimeSuggestion } from '../utils/timeSuggestions';
import SubTaskRow from './SubTaskRow';
import AiBreakdownButton from './AiBreakdownButton';

interface TaskModalProps {
  date: Date;
  editingBlock: TaskBlock | null;
  prefillTaskName?: string;
  prefillTime?: string; // "HH:MM" — seeded when the user taps a specific time slot
  templates: BlockTemplate[];
  // Blocks lookup used to compute suggestion chips (gaps between existing
  // blocks on the active date). Includes virtual spirals so their times
  // block out slots too.
  getBlocksForDate?: (date: Date) => TaskBlock[];
  onSave: (block: TaskBlock) => void;
  onSaveTemplate: (input: {
    name: string;
    mainTaskLabel: string;
    color?: string;
    subTasks: SubTask[];
    mainTime: string;
    mainDateKey: string;
  }) => BlockTemplate;
  onDeleteTemplate: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function dateKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function TaskModal({ date, editingBlock, prefillTaskName, prefillTime, templates, getBlocksForDate, onSave, onSaveTemplate, onDeleteTemplate, onDelete, onClose }: TaskModalProps) {
  // The date the modal is currently editing/creating on. Local so the
  // day-picker chip row can shift days without unmounting the modal.
  const [activeDate, setActiveDate] = useState<Date>(date);
  useEffect(() => {
    setActiveDate(date);
  }, [date]);
  const [mainInput, setMainInput] = useState('');
  const [mainTask, setMainTask] = useState('');
  const [mainTime, setMainTime] = useState('');
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);
  const [subInput, setSubInput] = useState('');
  const [mainParsed, setMainParsed] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [rescheduleInput, setRescheduleInput] = useState('');
  const [showReschedule, setShowReschedule] = useState(false);
  // "Reserve the day" mode. Skips time selection; the block renders as a band
  // above the hour grid. Sub-tasks with specific times still work inside it.
  const [isAllDay, setIsAllDay] = useState(false);

  const mainInputRef = useRef<HTMLInputElement>(null);
  const subInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingBlock) {
      setMainTask(editingBlock.mainTask);
      setMainTime(editingBlock.mainTime);
      setSubTasks(editingBlock.subTasks);
      setIsAllDay(!!editingBlock.isAllDay);
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
    // All-day mode: the input is name-only, no time parsing needed.
    if (isAllDay && mainInput.trim()) {
      setMainTask(mainInput.trim());
      setMainTime('00:00');
      setMainParsed(true);
      setTimeout(() => subInputRef.current?.focus(), 50);
      return;
    }
    const parsed = parseTaskInput(mainInput, activeDate);
    if (parsed) {
      // User typed a time in the input — explicit wins over any prefill.
      setMainTask(parsed.label);
      setMainTime(parsed.time);
      setMainParsed(true);
      setTimeout(() => subInputRef.current?.focus(), 50);
      return;
    }
    // No time in the input. If we already have a picked time (from a prefill
    // or a suggestion chip tap), commit with the whole input as the label.
    if (mainTime && mainInput.trim()) {
      setMainTask(mainInput.trim());
      // mainTime already set — no change needed
      setMainParsed(true);
      setTimeout(() => subInputRef.current?.focus(), 50);
    }
  };

  const handleReschedule = () => {
    // Parse just the time from user input — append a dummy label so chrono can match
    const parsed = parseTaskInput(`${rescheduleInput} task`, activeDate);
    if (!parsed) return;

    const oldMinutes = timeToMinutes(mainTime);
    const newMinutes = timeToMinutes(parsed.time);
    const delta = newMinutes - oldMinutes;

    if (delta === 0) {
      setShowReschedule(false);
      return;
    }

    const blockDateKey = dateKeyOf(activeDate);
    const prevDate = new Date(activeDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateKey = dateKeyOf(prevDate);

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
      const blockDateKey = dateKeyOf(activeDate);
      const prevDate = new Date(activeDate);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateKey = dateKeyOf(prevDate);

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
    const parsed = parseTaskInput(subInput, activeDate);
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
    // In all-day mode we don't need a real mainTime — the block renders as a
    // band above the hour grid. Store "00:00" as a sentinel so downstream code
    // that expects a string doesn't have to change.
    if (!mainTask || (!isAllDay && !mainTime)) return;

    const block: TaskBlock = {
      id: editingBlock?.id || uuidv4(),
      date: dateKeyOf(activeDate),
      mainTask,
      mainTime: isAllDay ? '00:00' : mainTime,
      subTasks,
      color: editingBlock?.color || BLOCK_COLORS_RAW[Math.floor(Math.random() * BLOCK_COLORS_RAW.length)],
      createdAt: editingBlock?.createdAt || new Date().toISOString(),
      isAllDay: isAllDay || undefined,
    };

    onSave(block);
    onClose();
  };

  const handleAiSubTasks = (generated: SubTask[]) => {
    setSubTasks((prev) => [...prev, ...generated]);
  };

  const blockDateKey = dateKeyOf(activeDate);

  // Suggestion chips: computed once per (activeDate, blocks-snapshot). No
  // suggestions when editing an existing block or when a specific time was
  // already prefilled (the user already committed to a slot).
  const timeSuggestions: TimeSuggestion[] = useMemo(() => {
    if (editingBlock) return [];
    if (prefillTime) return [];
    if (!getBlocksForDate) return [];
    return suggestTimes(activeDate, getBlocksForDate(activeDate));
  }, [editingBlock, prefillTime, getBlocksForDate, activeDate]);

  const dayOptions = useMemo(() => buildDayOptions(activeDate, 5), [activeDate]);

  // Confirm a suggested time chip. Sets mainTime and pushes focus onto the
  // task-name input so the user just types the name.
  const applySuggestion = (s: TimeSuggestion) => {
    setMainTime(s.time);
    setTimeout(() => mainInputRef.current?.focus(), 20);
  };

  // Apply a saved template at the current main time. Replaces the sub-task list
  // (the user can still tweak before saving). Sub-tasks with negative offsets
  // that cross midnight backwards get pushed onto the previous day, matching
  // the existing reschedule / duration-parse logic.
  const applyTemplate = (tpl: BlockTemplate) => {
    if (!mainTime) return;
    if (!mainTask) setMainTask(tpl.mainTaskLabel);
    const mainMinutes = timeToMinutes(mainTime);
    const prevDate = new Date(activeDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateKey = `${prevDate.getFullYear()}-${(prevDate.getMonth() + 1).toString().padStart(2, '0')}-${prevDate.getDate().toString().padStart(2, '0')}`;

    const next: SubTask[] = tpl.subTasks.map((s) => {
      const absMinutes = mainMinutes + s.offsetMinutes;
      if (absMinutes < 0) {
        return {
          id: uuidv4(),
          time: minutesToTime(absMinutes + 1440),
          label: s.label,
          completed: false,
          date: prevDateKey,
        };
      }
      return {
        id: uuidv4(),
        time: minutesToTime(absMinutes % 1440),
        label: s.label,
        completed: false,
      };
    });
    setSubTasks(next);
  };

  const handleSaveAsTemplate = (name: string) => {
    if (!mainTask || !mainTime) return;
    onSaveTemplate({
      name,
      mainTaskLabel: mainTask,
      color: editingBlock?.color,
      subTasks,
      mainTime,
      mainDateKey: blockDateKey,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      // `100svh` uses the smallest possible viewport height (constant when the
      // keyboard is up), avoiding a jumpy resize on iOS Safari when the input
      // opens the keyboard. `overscroll-contain` on the body below also stops
      // background page scroll leaking in.
      style={{ height: '100svh' }}
      // When the modal container itself gets a focus event bubbling up from
      // an input, iOS Safari sometimes doesn't scroll the input into view
      // because the modal is fixed. Force-scroll on any focus inside.
      onFocus={(e) => {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
          setTimeout(() => {
            target.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }, 250);
        }
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-xl flex flex-col animate-slide-up overscroll-contain"
        style={{
          // `svh` for a stable ceiling when the keyboard opens. Together with
          // the flex layout and scrollable body, this keeps the header/footer
          // visible while the middle scrolls to expose focused inputs.
          maxHeight: 'calc(100svh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {editingBlock ? 'Edit Task' : 'New Task'}
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{formatFullDate(activeDate)}</span>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
              &times;
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Day picker — only in create mode; editing keeps the original date */}
          {!editingBlock && (
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1.5 block">
                Day
              </label>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
                {dayOptions.map((d) => {
                  const active = dateKeyOf(activeDate) === d.key;
                  return (
                    <button
                      key={d.key}
                      onClick={() => setActiveDate(d.date)}
                      className={`flex-shrink-0 min-w-[64px] px-2.5 py-1.5 rounded-lg text-left transition-colors border ${
                        active
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                          : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'
                      }`}
                    >
                      <div className="text-[11px] font-semibold leading-tight">{d.label}</div>
                      {d.sub && (
                        <div
                          className={`text-[9px] font-mono leading-tight ${
                            active ? 'text-white/80' : 'text-gray-400'
                          }`}
                        >
                          {d.sub}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* All-day toggle. When engaged, the block reserves the whole day —
              no time picker, no suggestions. Useful when you want to book
              Saturday for Great America and schedule specifics later. */}
          <div className="flex items-center justify-between px-1">
            <label className="text-[11px] font-semibold text-gray-700 flex items-center gap-2">
              Reserve the whole day
              <span className="text-[10px] text-gray-400 font-normal">All-day event</span>
            </label>
            <button
              onClick={() => setIsAllDay(!isAllDay)}
              className={`w-10 h-6 rounded-full border-2 transition-colors flex items-center ${
                isAllDay
                  ? 'bg-indigo-600 border-indigo-600 justify-end'
                  : 'bg-white border-gray-300 justify-start'
              }`}
              title={isAllDay ? 'Disable — pick a specific time' : 'Enable — book the whole day'}
            >
              <span className="w-4 h-4 bg-white rounded-full shadow-sm mx-0.5" />
            </button>
          </div>

          {/* Main task input */}
          {!mainParsed ? (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {isAllDay ? 'Name your all-day event' : mainTime ? 'Name your task' : 'What do you need to do?'}
              </label>
              {!isAllDay && mainTime && (
                <div className="mt-1 mb-2 flex items-center gap-2">
                  <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                    {formatTime24to12(mainTime)}
                  </span>
                  <button
                    onClick={() => setMainTime('')}
                    className="text-[11px] text-gray-400 hover:text-gray-700"
                    title="Clear the picked time"
                  >
                    Change
                  </button>
                </div>
              )}

              {/* Time suggestion chips — surface a handful of empty slots so the
                  user rarely has to type a time. Hidden once a time is picked
                  (or when editing). */}
              {!isAllDay && !mainTime && timeSuggestions.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1.5">
                    Suggested times
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {timeSuggestions.map((s) => (
                      <button
                        key={`${s.time}-${s.reason}`}
                        onClick={() => applySuggestion(s)}
                        className={`px-2.5 py-1.5 rounded-lg text-left transition-colors border ${
                          s.reason === 'now'
                            ? 'bg-emerald-50 border-emerald-300 hover:bg-emerald-100 text-emerald-800'
                            : 'bg-white border-gray-200 hover:border-indigo-300 text-gray-700'
                        }`}
                      >
                        <div className="text-[12px] font-semibold leading-tight">{s.label}</div>
                        {s.sub && (
                          <div
                            className={`text-[9px] font-mono leading-tight ${
                              s.reason === 'now' ? 'text-emerald-600' : 'text-gray-400'
                            }`}
                          >
                            {s.sub}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <input
                ref={mainInputRef}
                type="text"
                value={mainInput}
                onChange={(e) => setMainInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleMainSubmit()}
                placeholder={
                  isAllDay
                    ? 'e.g. "Great America day"'
                    : mainTime
                    ? 'e.g. "go for a run"'
                    : 'e.g. "9am go for a run"'
                }
                className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                {isAllDay
                  ? 'Press Enter to reserve the whole day. Add sub-tasks with specific times inside if you want.'
                  : mainTime
                  ? 'Press Enter to use the picked time, or include a new time like "7pm meeting"'
                  : 'Tap a suggested time above or type "9am task"'}
              </p>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded ${
                      isAllDay ? 'text-amber-700 bg-amber-50' : 'text-indigo-600 bg-indigo-50'
                    }`}
                  >
                    {isAllDay ? 'All day' : formatTime24to12(mainTime)}
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
                <div className="flex items-center justify-between mb-2 gap-2">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Steps to get ready
                  </label>
                  <div className="flex items-center gap-1.5">
                    <TemplatesPicker
                      templates={templates}
                      canSave={subTasks.length > 0 && !!mainTask && !!mainTime}
                      onApply={applyTemplate}
                      onSaveCurrent={handleSaveAsTemplate}
                      onDelete={onDeleteTemplate}
                    />
                    <AiBreakdownButton
                      mainTask={mainTask}
                      mainTime={mainTime}
                      onSubTasksGenerated={handleAiSubTasks}
                    />
                  </div>
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

// Saved-templates picker. Sits next to the AI breakdown button. Opens a popover
// listing saved templates (tap to apply, replacing the current sub-task list)
// plus an inline "Save current as template" row when the user has a draft worth
// saving. Templates store offsets from main-time so applying them at any time
// stamps the right sub-task times.
function TemplatesPicker({
  templates,
  canSave,
  onApply,
  onSaveCurrent,
  onDelete,
}: {
  templates: BlockTemplate[];
  canSave: boolean;
  onApply: (tpl: BlockTemplate) => void;
  onSaveCurrent: (name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const submitSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSaveCurrent(trimmed);
    setName('');
    setOpen(false);
  };

  const hasAny = templates.length > 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 hover:text-indigo-700 px-2 py-1 rounded-md border border-indigo-200 hover:bg-indigo-50 transition-colors"
        title="Saved templates: apply one or save the current sub-tasks for reuse"
      >
        Templates ▾
      </button>
      {open && (
        <div
          ref={popRef}
          className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-40 overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            {hasAny ? 'Apply a template' : 'No saved templates yet'}
          </div>
          {hasAny && (
            <ul className="max-h-48 overflow-y-auto divide-y divide-gray-100">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center gap-1 px-2 py-1.5 hover:bg-indigo-50 group">
                  <button
                    onClick={() => { onApply(t); setOpen(false); }}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="text-[12px] font-medium text-gray-900 truncate">{t.name}</div>
                    <div className="text-[10px] text-gray-500 truncate">
                      {t.subTasks.length} step{t.subTasks.length === 1 ? '' : 's'} · default: {t.mainTaskLabel}
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete template "${t.name}"?`)) onDelete(t.id);
                    }}
                    className="text-gray-300 hover:text-red-500 text-base leading-none px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete template"
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
              Save current as template
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && canSave && submitSave()}
                placeholder='e.g. "Morning routine"'
                disabled={!canSave}
                className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
              />
              <button
                onClick={submitSave}
                disabled={!canSave || !name.trim()}
                className="text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed rounded-md px-2 py-1"
              >
                Save
              </button>
            </div>
            {!canSave && (
              <p className="text-[10px] text-gray-400 mt-1">
                Add a main task, time, and at least one step first.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
