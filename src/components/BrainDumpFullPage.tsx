import { useState, useCallback } from 'react';
import type { BrainDumpTask } from '../types';
import { useVoiceDictation } from '../hooks/useVoiceDictation';

interface BrainDumpFullPageProps {
  unscheduledTasks: BrainDumpTask[];
  schedulingTask: BrainDumpTask | null;
  extracting: boolean;
  onExtractTasks: (text: string) => Promise<BrainDumpTask[]>;
  onAddManualTask: (label: string) => void;
  onStartScheduling: (task: BrainDumpTask) => void;
  onCancelScheduling: () => void;
  onDeleteTask: (taskId: string) => void;
  onSwitchToCalendar: () => void;
}

export default function BrainDumpFullPage({
  unscheduledTasks,
  schedulingTask,
  extracting,
  onExtractTasks,
  onAddManualTask,
  onStartScheduling,
  onCancelScheduling,
  onDeleteTask,
  onSwitchToCalendar,
}: BrainDumpFullPageProps) {
  const [dumpText, setDumpText] = useState('');
  const [quickTask, setQuickTask] = useState('');

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

  const handleScheduleClick = (task: BrainDumpTask) => {
    onStartScheduling(task);
    onSwitchToCalendar();
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Brain dump input */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Brain Dump</h2>
            {isSupported && (
              <button
                onClick={toggleVoice}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  isListening
                    ? 'bg-red-100 text-red-600 animate-pulse'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
                {isListening ? 'Stop Dictation' : 'Dictate'}
              </button>
            )}
          </div>
          <p className="text-sm text-gray-500 mb-3">
            Type or dictate everything on your mind. AI will extract actionable tasks.
          </p>
          <textarea
            value={dumpText}
            onChange={(e) => setDumpText(e.target.value)}
            placeholder="I need to pick up groceries, also have a dentist appointment next Tuesday, should probably call mom this weekend, and I need to finish the report for work by Thursday..."
            className="w-full h-40 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
          />
          <button
            onClick={handleExtract}
            disabled={!dumpText.trim() || extracting}
            className="w-full mt-3 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {extracting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Extracting tasks...
              </>
            ) : (
              'Extract Tasks with AI'
            )}
          </button>
        </div>

        {/* Quick add */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Quick Add</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={quickTask}
              onChange={(e) => setQuickTask(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
              placeholder="Add a single task..."
              className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <button
              onClick={handleQuickAdd}
              disabled={!quickTask.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              Add
            </button>
          </div>
        </div>

        {/* Task list */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Unscheduled Tasks ({unscheduledTasks.length})
            </h3>
          </div>

          {unscheduledTasks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              No unscheduled tasks. Dump your thoughts above to get started.
            </p>
          ) : (
            <div className="space-y-2">
              {unscheduledTasks.map((task) => (
                <div
                  key={task.id}
                  className={`group flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    schedulingTask?.id === task.id
                      ? 'bg-indigo-100 border-2 border-indigo-400'
                      : 'bg-gray-50 border border-gray-100 hover:bg-gray-100'
                  }`}
                >
                  <span className="flex-1 text-sm text-gray-800">{task.label}</span>
                  <button
                    onClick={() =>
                      schedulingTask?.id === task.id
                        ? onCancelScheduling()
                        : handleScheduleClick(task)
                    }
                    className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                      schedulingTask?.id === task.id
                        ? 'bg-gray-200 text-gray-700'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    {schedulingTask?.id === task.id ? 'Cancel' : 'Schedule'}
                  </button>
                  <button
                    onClick={() => onDeleteTask(task.id)}
                    className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
