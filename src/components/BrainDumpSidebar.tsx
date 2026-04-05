import { useState, useRef, useCallback } from 'react';
import type { BrainDumpTask, EisenhowerPriority } from '../types';
import { useVoiceDictation } from '../hooks/useVoiceDictation';

const PRIORITY_DOTS: Record<EisenhowerPriority, string> = {
  'do-first': 'bg-red-500',
  'schedule': 'bg-indigo-500',
  'delegate': 'bg-amber-500',
  'drop': 'bg-gray-400',
};

interface BrainDumpSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  unscheduledTasks: BrainDumpTask[];
  schedulingTask: BrainDumpTask | null;
  extracting: boolean;
  onExtractTasks: (text: string) => Promise<BrainDumpTask[]>;
  onAddManualTask: (label: string) => void;
  onStartScheduling: (task: BrainDumpTask) => void;
  onCancelScheduling: () => void;
  onDeleteTask: (taskId: string) => void;
}

export default function BrainDumpSidebar({
  isOpen,
  onToggle,
  unscheduledTasks,
  schedulingTask,
  extracting,
  onExtractTasks,
  onAddManualTask,
  onStartScheduling,
  onCancelScheduling,
  onDeleteTask,
}: BrainDumpSidebarProps) {
  const [dumpText, setDumpText] = useState('');
  const [quickTask, setQuickTask] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTranscript = useCallback((text: string) => {
    setDumpText((prev) => (prev ? prev + ' ' + text : text));
  }, []);

  const { isListening, isSupported, toggle: toggleVoice } = useVoiceDictation(handleTranscript);

  const handleExtract = async () => {
    if (!dumpText.trim()) return;
    await onExtractTasks(dumpText.trim());
    setDumpText('');
  };

  const handleQuickAdd = () => {
    if (!quickTask.trim()) return;
    onAddManualTask(quickTask.trim());
    setQuickTask('');
  };

  return (
    <>
      {/* Toggle button — always visible */}
      <button
        onClick={onToggle}
        className={`fixed z-30 shadow-lg transition-all ${
          isOpen
            ? 'right-80 top-1/2 -translate-y-1/2 bg-gray-200 text-gray-600 px-1.5 py-4 rounded-l-lg'
            : 'sm:right-0 sm:top-1/2 sm:-translate-y-1/2 sm:px-1.5 sm:py-4 sm:rounded-l-lg bottom-6 right-5 sm:bottom-auto w-14 h-14 sm:w-auto sm:h-auto rounded-full bg-white sm:bg-indigo-600 sm:text-white text-gray-700 border border-gray-200 sm:border-0'
        }`}
        title={isOpen ? 'Hide Brain Dump' : 'Brain Dump'}
      >
        {isOpen ? (
          <span className="text-xs font-medium" style={{ writingMode: 'vertical-rl' }}>&times;</span>
        ) : (
          <>
            {/* Desktop: vertical text */}
            <span className="hidden sm:block text-xs font-medium" style={{ writingMode: 'vertical-rl' }}>
              {`Brain Dump${unscheduledTasks.length > 0 ? ` (${unscheduledTasks.length})` : ''}`}
            </span>
            {/* Mobile: brain icon FAB */}
            <span className="sm:hidden flex items-center justify-center relative">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                {/* Left hemisphere */}
                <path d="M9.5 2a4.5 4.5 0 0 0-3.8 6.9A4 4 0 0 0 4 12.5a4 4 0 0 0 1.5 3.1A3.5 3.5 0 0 0 9 19.5a3.5 3.5 0 0 0 3-1.7" />
                {/* Right hemisphere */}
                <path d="M14.5 2a4.5 4.5 0 0 1 3.8 6.9A4 4 0 0 1 20 12.5a4 4 0 0 1-1.5 3.1 3.5 3.5 0 0 1-3.5 3.9 3.5 3.5 0 0 1-3-1.7" />
                {/* Center line */}
                <path d="M12 2v20" />
                {/* Folds */}
                <path d="M8 8h.5" />
                <path d="M15.5 8H16" />
                <path d="M7.5 12H8" />
                <path d="M16 12h.5" />
              </svg>
              {unscheduledTasks.length > 0 && (
                <span className="absolute -top-2 -right-2 w-5 h-5 text-[10px] font-bold bg-indigo-600 text-white rounded-full flex items-center justify-center">
                  {unscheduledTasks.length}
                </span>
              )}
            </span>
          </>
        )}
      </button>

      {/* Sidebar panel */}
      <div
        className={`fixed right-0 top-0 h-full w-full sm:w-80 bg-white border-l border-gray-200 shadow-xl z-40 transition-transform duration-300 flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Brain Dump</h2>
          <button onClick={onToggle} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Text area for brain dump */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Dump your thoughts
              </label>
              {isSupported && (
                <button
                  onClick={toggleVoice}
                  className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors ${
                    isListening
                      ? 'bg-red-100 text-red-600 animate-pulse'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                  {isListening ? 'Stop' : 'Dictate'}
                </button>
              )}
            </div>
            <textarea
              ref={textareaRef}
              value={dumpText}
              onChange={(e) => setDumpText(e.target.value)}
              placeholder="Type or dictate everything on your mind... groceries, meetings, errands, goals..."
              className="w-full h-32 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
            <button
              onClick={handleExtract}
              disabled={!dumpText.trim() || extracting}
              className="w-full mt-2 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {extracting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Extracting...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v18" /><path d="m5 12 7-7 7 7" />
                  </svg>
                  Extract Tasks with AI
                </>
              )}
            </button>
          </div>

          {/* Quick add */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Or add a task manually
            </label>
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={quickTask}
                onChange={(e) => setQuickTask(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
                placeholder="e.g. Buy groceries"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <button
                onClick={handleQuickAdd}
                disabled={!quickTask.trim()}
                className="px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 disabled:opacity-50 transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Unscheduled tasks */}
          {unscheduledTasks.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Unscheduled ({unscheduledTasks.length})
              </label>
              <p className="text-[11px] text-gray-400 mt-0.5 mb-2">
                {schedulingTask ? 'Now click a time slot on the calendar to place it' : 'Click a task to schedule it'}
              </p>
              <div className="space-y-1.5">
                {unscheduledTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`group flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all ${
                      schedulingTask?.id === task.id
                        ? 'bg-indigo-100 border-2 border-indigo-400 ring-2 ring-indigo-200'
                        : 'bg-gray-50 border border-gray-100 hover:bg-indigo-50 hover:border-indigo-200'
                    }`}
                    onClick={() => {
                      if (schedulingTask?.id === task.id) {
                        onCancelScheduling();
                      } else {
                        onStartScheduling(task);
                        onToggle(); // close sidebar to reveal the calendar for time-slot selection
                      }
                    }}
                  >
                    {task.priority && (
                      <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOTS[task.priority]}`} />
                    )}
                    <span className="flex-1 text-sm text-gray-800 truncate">{task.label}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteTask(task.id);
                      }}
                      className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
