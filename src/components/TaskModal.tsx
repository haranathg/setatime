import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { TaskBlock, SubTask } from '../types';
import { BLOCK_COLORS_RAW } from '../constants';
import { formatFullDate, formatTime24to12 } from '../utils/dateHelpers';
import { parseTaskInput } from '../utils/timeParser';
import SubTaskRow from './SubTaskRow';
import AiBreakdownButton from './AiBreakdownButton';

interface TaskModalProps {
  date: Date;
  editingBlock: TaskBlock | null;
  onSave: (block: TaskBlock) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function TaskModal({ date, editingBlock, onSave, onDelete, onClose }: TaskModalProps) {
  const [mainInput, setMainInput] = useState('');
  const [mainTask, setMainTask] = useState('');
  const [mainTime, setMainTime] = useState('');
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);
  const [subInput, setSubInput] = useState('');
  const [mainParsed, setMainParsed] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const mainInputRef = useRef<HTMLInputElement>(null);
  const subInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingBlock) {
      setMainTask(editingBlock.mainTask);
      setMainTime(editingBlock.mainTime);
      setSubTasks(editingBlock.subTasks);
      setMainParsed(true);
    } else {
      mainInputRef.current?.focus();
    }
  }, [editingBlock]);

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

  const handleSubSubmit = () => {
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[85vh] flex flex-col animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
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
                className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                      .sort((a, b) => a.time.localeCompare(b.time))
                      .map((sub) => (
                        <SubTaskRow
                          key={sub.id}
                          time={sub.time}
                          label={sub.label}
                          onDelete={() => handleDeleteSubTask(sub.id)}
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
                  placeholder='e.g. "7:55am wake up"'
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <p className="text-[11px] text-gray-400 mt-1">Add steps one at a time, press Enter after each</p>
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
