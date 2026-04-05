import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { BrainDumpTask, EisenhowerPriority } from '../types';
import { useVoiceDictation } from '../hooks/useVoiceDictation';

// --- Eisenhower priority config ---

const PRIORITIES: { key: EisenhowerPriority; label: string; shortLabel: string; color: string; bg: string; border: string; dot: string; description: string }[] = [
  { key: 'do-first',  label: 'Do First',  shortLabel: 'Do',   color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    dot: 'bg-red-500',    description: 'Urgent + Important' },
  { key: 'schedule',  label: 'Schedule',   shortLabel: 'Sched', color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200', dot: 'bg-indigo-500', description: 'Important, Not Urgent' },
  { key: 'delegate',  label: 'Delegate',   shortLabel: 'Del',   color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200',  dot: 'bg-amber-500',  description: 'Urgent, Not Important' },
  { key: 'drop',      label: 'Drop',       shortLabel: 'Drop',  color: 'text-gray-500',   bg: 'bg-gray-50',   border: 'border-gray-200',   dot: 'bg-gray-400',   description: 'Neither' },
];

const PRIORITY_ORDER: Record<string, number> = { 'do-first': 0, 'schedule': 1, 'delegate': 2, 'drop': 3 };

function getPriorityConfig(p?: EisenhowerPriority) {
  return PRIORITIES.find((c) => c.key === p);
}

// --- Tag picker popover ---

function TagPicker({
  task,
  allTags,
  onUpdate,
  onClose,
}: {
  task: BrainDumpTask;
  allTags: string[];
  onUpdate: (taskId: string, updates: Partial<Pick<BrainDumpTask, 'tags'>>) => void;
  onClose: () => void;
}) {
  const [newTag, setNewTag] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const taskTags = task.tags || [];

  const toggleTag = (tag: string) => {
    const next = taskTags.includes(tag) ? taskTags.filter((t) => t !== tag) : [...taskTags, tag];
    onUpdate(task.id, { tags: next });
  };

  const addNew = () => {
    const tag = newTag.trim().toLowerCase();
    if (!tag) return;
    const next = taskTags.includes(tag) ? taskTags : [...taskTags, tag];
    onUpdate(task.id, { tags: next });
    setNewTag('');
  };

  return (
    <div ref={popoverRef} className="absolute left-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-50">
      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">Value Tags</p>
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                taskTags.includes(tag)
                  ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addNew()}
          placeholder="New tag..."
          className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button onClick={addNew} disabled={!newTag.trim()} className="px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-40">
          Add
        </button>
      </div>
    </div>
  );
}

// --- Priority picker (inline row of buttons) ---

function PriorityPicker({
  task,
  onUpdate,
  onClose,
}: {
  task: BrainDumpTask;
  onUpdate: (taskId: string, updates: Partial<Pick<BrainDumpTask, 'priority'>>) => void;
  onClose: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div ref={popoverRef} className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-2 z-50 w-56">
      {PRIORITIES.map((p) => (
        <button
          key={p.key}
          onClick={() => { onUpdate(task.id, { priority: p.key }); onClose(); }}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
            task.priority === p.key ? `${p.bg} ${p.border} border` : 'hover:bg-gray-50'
          }`}
        >
          <span className={`w-2.5 h-2.5 rounded-full ${p.dot}`} />
          <span className={`text-sm font-medium ${p.color}`}>{p.label}</span>
          <span className="text-[10px] text-gray-400 ml-auto">{p.description}</span>
        </button>
      ))}
      {task.priority && (
        <button
          onClick={() => { onUpdate(task.id, { priority: undefined }); onClose(); }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs text-gray-400 hover:bg-gray-50 mt-1 border-t border-gray-100 pt-2"
        >
          Clear priority
        </button>
      )}
    </div>
  );
}

// --- Main component ---

interface BrainDumpFullPageProps {
  unscheduledTasks: BrainDumpTask[];
  schedulingTask: BrainDumpTask | null;
  extracting: boolean;
  onExtractTasks: (text: string) => Promise<BrainDumpTask[]>;
  onAddManualTask: (label: string) => void;
  onStartScheduling: (task: BrainDumpTask) => void;
  onCancelScheduling: () => void;
  onDeleteTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<Pick<BrainDumpTask, 'priority' | 'tags'>>) => void;
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
  onUpdateTask,
  onSwitchToCalendar,
}: BrainDumpFullPageProps) {
  const [dumpText, setDumpText] = useState('');
  const [quickTask, setQuickTask] = useState('');
  const [priorityPickerFor, setPriorityPickerFor] = useState<string | null>(null);
  const [tagPickerFor, setTagPickerFor] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState<EisenhowerPriority | 'all'>('all');
  const [filterTag, setFilterTag] = useState<string | null>(null);

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

  // Collect all tags used across tasks for the tag library
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const t of unscheduledTasks) {
      for (const tag of t.tags || []) set.add(tag);
    }
    return Array.from(set).sort();
  }, [unscheduledTasks]);

  // Filter + sort
  const filteredTasks = useMemo(() => {
    let tasks = unscheduledTasks;
    if (filterPriority !== 'all') {
      tasks = tasks.filter((t) => t.priority === filterPriority);
    }
    if (filterTag) {
      tasks = tasks.filter((t) => t.tags?.includes(filterTag));
    }
    // Sort: prioritized first (by Eisenhower order), then unprioritized, then by extractedAt
    return [...tasks].sort((a, b) => {
      const pa = a.priority ? PRIORITY_ORDER[a.priority] : 99;
      const pb = b.priority ? PRIORITY_ORDER[b.priority] : 99;
      if (pa !== pb) return pa - pb;
      return a.extractedAt.localeCompare(b.extractedAt);
    });
  }, [unscheduledTasks, filterPriority, filterTag]);

  // Count by priority for filter badges
  const priorityCounts = useMemo(() => {
    const counts: Record<string, number> = { 'do-first': 0, 'schedule': 0, 'delegate': 0, 'drop': 0, 'unset': 0 };
    for (const t of unscheduledTasks) {
      counts[t.priority || 'unset']++;
    }
    return counts;
  }, [unscheduledTasks]);

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

        {/* Task list with filters */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Unscheduled Tasks ({unscheduledTasks.length})
            </h3>
          </div>

          {/* Priority filter bar */}
          {unscheduledTasks.length > 0 && (
            <div className="space-y-2 mb-4">
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setFilterPriority('all')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                    filterPriority === 'all'
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All ({unscheduledTasks.length})
                </button>
                {PRIORITIES.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setFilterPriority(filterPriority === p.key ? 'all' : p.key)}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                      filterPriority === p.key
                        ? `${p.bg} ${p.color} ${p.border} border`
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
                    {p.shortLabel}
                    {priorityCounts[p.key] > 0 && (
                      <span className="text-[10px] opacity-70">({priorityCounts[p.key]})</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tag filter chips */}
              {allTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                      className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${
                        filterTag === tag
                          ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                          : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                  {filterTag && (
                    <button
                      onClick={() => setFilterTag(null)}
                      className="px-2 py-0.5 text-[11px] text-gray-400 hover:text-gray-600"
                    >
                      clear
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {unscheduledTasks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              No unscheduled tasks. Dump your thoughts above to get started.
            </p>
          ) : filteredTasks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              No tasks match this filter.
            </p>
          ) : (
            <div className="space-y-2">
              {filteredTasks.map((task) => {
                const pc = getPriorityConfig(task.priority);
                const taskTags = task.tags || [];
                return (
                  <div
                    key={task.id}
                    className={`group rounded-xl transition-all ${
                      schedulingTask?.id === task.id
                        ? 'bg-indigo-100 border-2 border-indigo-400'
                        : pc
                        ? `${pc.bg} border ${pc.border}`
                        : 'bg-gray-50 border border-gray-100 hover:bg-gray-100'
                    }`}
                  >
                    {/* Main row */}
                    <div className="flex items-center gap-2 px-4 py-3">
                      {/* Priority dot — tap to pick */}
                      <div className="relative">
                        <button
                          onClick={() => setPriorityPickerFor(priorityPickerFor === task.id ? null : task.id)}
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                            pc ? `${pc.dot} border-transparent` : 'border-gray-300 hover:border-gray-400'
                          }`}
                          title={pc ? `${pc.label}: ${pc.description}` : 'Set priority'}
                        >
                          {!pc && <span className="text-[8px] text-gray-400">?</span>}
                        </button>
                        {priorityPickerFor === task.id && (
                          <PriorityPicker
                            task={task}
                            onUpdate={onUpdateTask}
                            onClose={() => setPriorityPickerFor(null)}
                          />
                        )}
                      </div>

                      <span className="flex-1 text-sm text-gray-800">{task.label}</span>

                      {/* Tag button */}
                      <div className="relative">
                        <button
                          onClick={() => setTagPickerFor(tagPickerFor === task.id ? null : task.id)}
                          className="p-1 text-gray-300 hover:text-indigo-500 transition-colors"
                          title="Value tags"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                            <path d="M7 7h.01" />
                          </svg>
                        </button>
                        {tagPickerFor === task.id && (
                          <TagPicker
                            task={task}
                            allTags={allTags}
                            onUpdate={onUpdateTask}
                            onClose={() => setTagPickerFor(null)}
                          />
                        )}
                      </div>

                      {/* Schedule button */}
                      <button
                        onClick={() =>
                          schedulingTask?.id === task.id
                            ? onCancelScheduling()
                            : handleScheduleClick(task)
                        }
                        className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors shrink-0 ${
                          schedulingTask?.id === task.id
                            ? 'bg-gray-200 text-gray-700'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        }`}
                      >
                        {schedulingTask?.id === task.id ? 'Cancel' : 'Schedule'}
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => onDeleteTask(task.id)}
                        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                        </svg>
                      </button>
                    </div>

                    {/* Tag chips row (below task label) */}
                    {taskTags.length > 0 && (
                      <div className="flex flex-wrap gap-1 px-4 pb-2 -mt-1">
                        {taskTags.map((tag) => (
                          <span key={tag} className="px-1.5 py-0 text-[10px] rounded-full bg-white/70 border border-gray-200 text-gray-500">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
