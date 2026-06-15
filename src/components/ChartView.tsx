import { useState, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ChartNote, Problem, PlanTask } from '../types';

interface ChartViewProps {
  notes: ChartNote[];
  onCreateNote: (encounterType?: ChartNote['encounterType']) => ChartNote;
  onUpdateNote: (id: string, updates: Partial<Omit<ChartNote, 'id' | 'createdAt'>>) => void;
  onDeleteNote: (id: string) => void;
  onSendPlanTaskToDump: (label: string) => string;
}

const ENCOUNTER_LABELS: Record<ChartNote['encounterType'], string> = {
  daily: 'Daily Check-In',
  weekly: 'Weekly Review',
  other: 'Encounter',
};

function formatLongDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function previewText(s: string, max = 80): string {
  const trimmed = s.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1) + '…';
}

export default function ChartView({ notes, onCreateNote, onUpdateNote, onDeleteNote, onSendPlanTaskToDump }: ChartViewProps) {
  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [notes]
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Derive the effective selected note during render. If the user-chosen ID is
  // missing (e.g. note was just deleted) or unset, fall back to the most recent
  // encounter. Avoids an effect that would re-render twice on every mount.
  const selected = useMemo(() => {
    if (selectedId) {
      const hit = sortedNotes.find((n) => n.id === selectedId);
      if (hit) return hit;
    }
    return sortedNotes[0] ?? null;
  }, [sortedNotes, selectedId]);

  const handleNew = (type: ChartNote['encounterType']) => {
    const note = onCreateNote(type);
    setSelectedId(note.id);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    onDeleteNote(id);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#e8eef4] overflow-hidden">
      {/* Patient banner — Epic-style */}
      <PatientBanner noteCount={notes.length} />

      <div className="flex-1 flex overflow-hidden">
        {/* Encounter list sidebar */}
        <aside className="w-72 flex-shrink-0 bg-white border-r border-gray-300 flex flex-col">
          <div className="px-3 py-2 bg-[#1a4a73] text-white text-[11px] font-semibold uppercase tracking-wider flex items-center justify-between">
            <span>Chart Review · Encounters</span>
            <span className="text-[10px] font-normal text-gray-300">{notes.length}</span>
          </div>
          <div className="px-2 py-2 border-b border-gray-200 flex gap-1">
            <button
              onClick={() => handleNew('daily')}
              className="flex-1 px-2 py-1.5 text-[11px] font-semibold text-white bg-[#1a4a73] hover:bg-[#0f3557] rounded-sm transition-colors"
            >
              + Daily
            </button>
            <button
              onClick={() => handleNew('weekly')}
              className="flex-1 px-2 py-1.5 text-[11px] font-semibold text-[#1a4a73] bg-white border border-[#1a4a73] hover:bg-[#e8eef4] rounded-sm transition-colors"
            >
              + Weekly
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {sortedNotes.length === 0 ? (
              <div className="p-4 text-xs text-gray-500 text-center">
                No encounters on file. Click <span className="font-semibold">+ Daily</span> or <span className="font-semibold">+ Weekly</span> to start a new note.
              </div>
            ) : (
              <ul>
                {sortedNotes.map((n) => {
                  const isSelected = n.id === selected?.id;
                  const preview = previewText(n.subjective || n.assessment || n.plan || n.objective) || '(empty note)';
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => setSelectedId(n.id)}
                        className={`w-full text-left px-3 py-2 border-b border-gray-100 transition-colors ${
                          isSelected ? 'bg-[#fef9e7] border-l-4 border-l-[#d4a017]' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[11px] font-semibold text-gray-900 font-mono">
                            {formatLongDate(n.date)}
                          </span>
                          <span className="text-[9px] uppercase tracking-wider text-[#1a4a73] font-bold">
                            {n.encounterType === 'daily' ? 'D' : n.encounterType === 'weekly' ? 'W' : 'O'}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-500 mb-1">
                          {ENCOUNTER_LABELS[n.encounterType]} · {formatTime(n.createdAt)}
                        </div>
                        <div className="text-[11px] text-gray-700 line-clamp-2">{preview}</div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Main note workspace */}
        <main className="flex-1 overflow-y-auto bg-[#e8eef4]">
          {selected ? (
            <NoteEditor
              key={selected.id}
              note={selected}
              onUpdate={onUpdateNote}
              onDelete={() => handleDelete(selected.id)}
              onSendPlanTaskToDump={onSendPlanTaskToDump}
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md p-8 bg-white border border-gray-300 rounded-sm shadow-sm">
                <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-2">
                  No Encounter Selected
                </div>
                <h2 className="text-lg font-semibold text-gray-800 mb-2">Open a chart note</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Select an existing encounter from the sidebar, or start a new one to begin documenting.
                </p>
                <button
                  onClick={() => handleNew('daily')}
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#1a4a73] hover:bg-[#0f3557] rounded-sm transition-colors"
                >
                  + New Daily Check-In
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ---------- Patient banner ----------

function PatientBanner({ noteCount }: { noteCount: number }) {
  const today = new Date();
  return (
    <div className="bg-gradient-to-b from-[#1a4a73] to-[#0f3557] text-white border-b-2 border-[#d4a017]">
      <div className="px-4 py-2 flex items-stretch gap-6 text-[11px]">
        {/* Identity block */}
        <div className="flex items-center gap-3 pr-6 border-r border-white/20">
          <div className="w-12 h-12 rounded-full bg-white/10 border border-white/30 flex items-center justify-center text-lg font-bold">
            S
          </div>
          <div>
            <div className="text-base font-bold tracking-tight leading-tight">SELF, PATIENT</div>
            <div className="text-[10px] text-white/70 leading-tight font-mono">
              MRN: 00000001 · DOB: —— · Sex: —
            </div>
          </div>
        </div>

        {/* Demographic facts */}
        <BannerField label="Age" value="—" />
        <BannerField label="PCP" value="Self" />
        <BannerField label="Allergies" value="NKDA" warn />
        <BannerField label="Code Status" value="Full Code" />
        <BannerField label="Encounters" value={String(noteCount)} />

        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-wider text-white/60">Today</div>
            <div className="text-[11px] font-mono">
              {today.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
        </div>
      </div>

      {/* Tab strip */}
      <div className="px-4 flex gap-0 bg-[#0f3557] border-t border-white/10">
        {['Chart Review', 'SOAP Note', 'Problem List', 'Plan'].map((t, i) => (
          <div
            key={t}
            className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-r border-white/10 ${
              i === 1 ? 'bg-white text-[#1a4a73]' : 'text-white/70'
            }`}
          >
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

function BannerField({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex flex-col justify-center">
      <div className="text-[9px] uppercase tracking-wider text-white/60 leading-tight">{label}</div>
      <div className={`text-[12px] font-mono leading-tight ${warn ? 'text-[#ffd966]' : 'text-white'}`}>{value}</div>
    </div>
  );
}

// ---------- Note editor with SOAP sections ----------

function NoteEditor({
  note,
  onUpdate,
  onDelete,
  onSendPlanTaskToDump,
}: {
  note: ChartNote;
  onUpdate: (id: string, updates: Partial<Omit<ChartNote, 'id' | 'createdAt'>>) => void;
  onDelete: () => void;
  onSendPlanTaskToDump: (label: string) => string;
}) {
  return (
    <div className="max-w-4xl mx-auto p-4 space-y-3">
      {/* Note header */}
      <div className="bg-white border border-gray-300 rounded-sm shadow-sm">
        <div className="px-4 py-2 bg-[#1a4a73] text-white flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <span className="text-[11px] font-bold uppercase tracking-wider">Progress Note</span>
            <span className="text-[10px] text-white/70 font-mono">ID: {note.id.slice(0, 8).toUpperCase()}</span>
          </div>
          <button
            onClick={onDelete}
            className="text-[10px] uppercase tracking-wider font-semibold text-white/70 hover:text-white px-2 py-0.5 rounded-sm hover:bg-red-700/40 transition-colors"
            title="Delete note"
          >
            Delete
          </button>
        </div>
        <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
          <FieldRow label="Encounter Date">
            <input
              type="date"
              value={note.date}
              onChange={(e) => onUpdate(note.id, { date: e.target.value })}
              className="w-full px-2 py-1 text-[12px] border border-gray-300 rounded-sm font-mono focus:outline-none focus:ring-1 focus:ring-[#1a4a73] focus:border-[#1a4a73]"
            />
          </FieldRow>
          <FieldRow label="Encounter Type">
            <select
              value={note.encounterType}
              onChange={(e) => onUpdate(note.id, { encounterType: e.target.value as ChartNote['encounterType'] })}
              className="w-full px-2 py-1 text-[12px] border border-gray-300 rounded-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#1a4a73] focus:border-[#1a4a73]"
            >
              <option value="daily">Daily Check-In</option>
              <option value="weekly">Weekly Review</option>
              <option value="other">Other</option>
            </select>
          </FieldRow>
          <FieldRow label="Provider">
            <div className="px-2 py-1 text-[12px] text-gray-700 font-mono bg-gray-50 border border-gray-200 rounded-sm">SELF, MD-IN-TRAINING</div>
          </FieldRow>
          <FieldRow label="Status">
            <div className="px-2 py-1 text-[12px] text-green-700 font-semibold bg-green-50 border border-green-200 rounded-sm flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Auto-saved · {formatTime(note.updatedAt)}
            </div>
          </FieldRow>
        </div>
      </div>

      {/* Problem list — pinned context that drives both Assessment and Plan */}
      <ProblemsList note={note} onUpdate={onUpdate} />

      {/* SOAP sections */}
      <SoapSection
        letter="S"
        label="Subjective"
        hint="What you're feeling, thinking, or experiencing — in your own words. Mood, energy, sleep, stressors, what's on your mind."
        value={note.subjective}
        onChange={(v) => onUpdate(note.id, { subjective: v })}
        rows={6}
      />
      <SoapSection
        letter="O"
        label="Objective"
        hint="Observable facts. Hours slept, meals, exercise, screen time, what you actually did vs planned, measurable wins/misses."
        value={note.objective}
        onChange={(v) => onUpdate(note.id, { objective: v })}
        rows={6}
      />
      <SoapSection
        letter="A"
        label="Assessment"
        hint="Your read on the situation. What patterns are showing up? What's working? What's not? Differential — what else could be going on?"
        value={note.assessment}
        onChange={(v) => onUpdate(note.id, { assessment: v })}
        rows={6}
      />
      <PlanSection note={note} onUpdate={onUpdate} onSendToDump={onSendPlanTaskToDump} />

      {/* Signature block */}
      <div className="bg-white border border-gray-300 rounded-sm shadow-sm px-4 py-3 flex items-center justify-between text-[11px]">
        <div className="font-mono text-gray-700">
          <span className="text-gray-400 uppercase tracking-wider text-[9px] mr-2">Signed by</span>
          /s/ Self · {formatLongDate(note.date)}
        </div>
        <div className="text-gray-400 text-[10px] font-mono">
          Created {formatTime(note.createdAt)} · Modified {formatTime(note.updatedAt)}
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-gray-500 font-semibold mb-1">{label}</div>
      {children}
    </div>
  );
}

function SoapSection({
  letter,
  label,
  hint,
  value,
  onChange,
  rows,
}: {
  letter: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
}) {
  return (
    <section className="bg-white border border-gray-300 rounded-sm shadow-sm overflow-hidden">
      <header className="flex items-stretch border-b border-gray-300">
        <div className="w-10 flex-shrink-0 bg-[#1a4a73] text-white flex items-center justify-center text-lg font-bold font-mono">
          {letter}
        </div>
        <div className="flex-1 px-3 py-2 bg-gray-50">
          <div className="text-[12px] font-bold uppercase tracking-wider text-gray-800">{label}</div>
          <div className="text-[10px] text-gray-500 leading-tight mt-0.5">{hint}</div>
        </div>
      </header>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={`Enter ${label.toLowerCase()}…`}
        className="w-full px-3 py-2 text-[13px] font-mono leading-relaxed text-gray-900 resize-y focus:outline-none focus:bg-[#fffceb] placeholder:text-gray-300"
      />
    </section>
  );
}

// ---------- Problem list ----------

function ProblemsList({
  note,
  onUpdate,
}: {
  note: ChartNote;
  onUpdate: (id: string, updates: Partial<Omit<ChartNote, 'id' | 'createdAt'>>) => void;
}) {
  const problems = note.problems || [];

  const addProblem = () => {
    const next: Problem = {
      id: uuidv4(),
      label: '',
      createdAt: new Date().toISOString(),
    };
    onUpdate(note.id, { problems: [...problems, next] });
  };

  const updateProblem = (id: string, patch: Partial<Problem>) => {
    onUpdate(note.id, { problems: problems.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  };

  const removeProblem = (id: string) => {
    onUpdate(note.id, { problems: problems.filter((p) => p.id !== id) });
  };

  const openCount = problems.filter((p) => !p.resolved).length;

  return (
    <section className="bg-white border border-gray-300 rounded-sm shadow-sm overflow-hidden">
      <header className="flex items-stretch border-b border-gray-300">
        <div className="w-10 flex-shrink-0 bg-[#d4a017] text-white flex items-center justify-center text-lg font-bold font-mono">
          #
        </div>
        <div className="flex-1 px-3 py-2 bg-gray-50 flex items-center justify-between">
          <div>
            <div className="text-[12px] font-bold uppercase tracking-wider text-gray-800">Problem List</div>
            <div className="text-[10px] text-gray-500 leading-tight mt-0.5">
              Active issues you're working on. Shows up in Plan so you can write tasks against each.
            </div>
          </div>
          <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
            {openCount} open · {problems.length} total
          </span>
        </div>
      </header>
      <div className="divide-y divide-gray-100">
        {problems.length === 0 ? (
          <div className="px-3 py-3 text-[12px] text-gray-400 italic">
            No active problems. Click <span className="font-semibold not-italic">+ Problem</span> to add one.
          </div>
        ) : (
          problems.map((p) => (
            <div key={p.id} className="px-3 py-2 flex items-start gap-2">
              <input
                type="checkbox"
                checked={!!p.resolved}
                onChange={(e) => updateProblem(p.id, { resolved: e.target.checked })}
                className="mt-1.5 w-3.5 h-3.5 accent-[#1a4a73]"
                title={p.resolved ? 'Resolved — uncheck to reopen' : 'Mark resolved'}
              />
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={p.label}
                  onChange={(e) => updateProblem(p.id, { label: e.target.value })}
                  placeholder="Short label, e.g. Sleep debt"
                  className={`w-full px-2 py-1 text-[13px] font-mono border border-gray-200 rounded-sm focus:outline-none focus:ring-1 focus:ring-[#1a4a73] focus:border-[#1a4a73] ${
                    p.resolved ? 'line-through text-gray-400' : 'text-gray-900'
                  }`}
                />
                <input
                  type="text"
                  value={p.detail || ''}
                  onChange={(e) => updateProblem(p.id, { detail: e.target.value })}
                  placeholder="Optional detail or context…"
                  className="mt-1 w-full px-2 py-1 text-[11px] text-gray-600 border border-transparent rounded-sm focus:outline-none focus:border-gray-200 focus:bg-gray-50"
                />
              </div>
              <button
                onClick={() => removeProblem(p.id)}
                className="mt-1 text-[14px] leading-none text-gray-300 hover:text-red-500 px-1.5 py-1"
                title="Delete problem"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
      <div className="px-3 py-2 border-t border-gray-200 bg-gray-50">
        <button
          onClick={addProblem}
          className="text-[11px] font-semibold uppercase tracking-wider text-[#1a4a73] hover:text-[#0f3557] transition-colors"
        >
          + Problem
        </button>
      </div>
    </section>
  );
}

// ---------- Plan section: task list above the free-text plan ----------

function PlanSection({
  note,
  onUpdate,
  onSendToDump,
}: {
  note: ChartNote;
  onUpdate: (id: string, updates: Partial<Omit<ChartNote, 'id' | 'createdAt'>>) => void;
  onSendToDump: (label: string) => string;
}) {
  const tasks = note.planTasks || [];
  const problems = note.problems || [];
  const openProblems = problems.filter((p) => !p.resolved);

  const addTask = () => {
    const next: PlanTask = {
      id: uuidv4(),
      text: '',
      done: false,
      createdAt: new Date().toISOString(),
    };
    onUpdate(note.id, { planTasks: [...tasks, next] });
  };

  const updateTask = (id: string, patch: Partial<PlanTask>) => {
    onUpdate(note.id, { planTasks: tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  };

  const removeTask = (id: string) => {
    onUpdate(note.id, { planTasks: tasks.filter((t) => t.id !== id) });
  };

  const pushToDump = (id: string) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const label = t.text.trim();
    if (!label) return;
    const dumpId = onSendToDump(label);
    updateTask(id, { dumpTaskId: dumpId });
  };

  return (
    <section className="bg-white border border-gray-300 rounded-sm shadow-sm overflow-hidden">
      <header className="flex items-stretch border-b border-gray-300">
        <div className="w-10 flex-shrink-0 bg-[#1a4a73] text-white flex items-center justify-center text-lg font-bold font-mono">
          P
        </div>
        <div className="flex-1 px-3 py-2 bg-gray-50">
          <div className="text-[12px] font-bold uppercase tracking-wider text-gray-800">Plan</div>
          <div className="text-[10px] text-gray-500 leading-tight mt-0.5">
            Concrete next steps. Add tasks here and push them into the Dump to schedule later.
          </div>
        </div>
      </header>

      {/* Problem list mirror — passive, so you can see what you're planning against */}
      {openProblems.length > 0 && (
        <div className="px-3 py-2 bg-[#fef9e7] border-b border-[#f0e4b8] text-[11px] text-gray-700">
          <span className="text-[9px] uppercase tracking-wider text-[#1a4a73] font-bold mr-2">Planning against</span>
          {openProblems.map((p) => (
            <span
              key={p.id}
              className="inline-block mr-1.5 mb-0.5 px-1.5 py-0.5 bg-white border border-gray-300 rounded-sm font-mono"
            >
              {p.label || '(unnamed)'}
            </span>
          ))}
        </div>
      )}

      {/* Task list */}
      <div className="divide-y divide-gray-100">
        {tasks.length === 0 ? (
          <div className="px-3 py-3 text-[12px] text-gray-400 italic">
            No plan tasks yet. Click <span className="font-semibold not-italic">+ Task</span> to add one — you can push it to the Dump to schedule later.
          </div>
        ) : (
          tasks.map((t) => (
            <div key={t.id} className="px-3 py-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={t.done}
                onChange={(e) => updateTask(t.id, { done: e.target.checked })}
                className="w-3.5 h-3.5 accent-[#1a4a73]"
                title={t.done ? 'Done' : 'Mark done'}
              />
              <input
                type="text"
                value={t.text}
                onChange={(e) => updateTask(t.id, { text: e.target.value })}
                placeholder="What will you do?"
                className={`flex-1 min-w-0 px-2 py-1 text-[13px] font-mono border border-gray-200 rounded-sm focus:outline-none focus:ring-1 focus:ring-[#1a4a73] focus:border-[#1a4a73] ${
                  t.done ? 'line-through text-gray-400' : 'text-gray-900'
                }`}
              />
              {t.dumpTaskId ? (
                <span
                  className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-green-700 bg-green-50 border border-green-200 rounded-sm"
                  title="Already pushed to the Dump"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  In Dump
                </span>
              ) : (
                <button
                  onClick={() => pushToDump(t.id)}
                  disabled={!t.text.trim()}
                  className="flex-shrink-0 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#1a4a73] bg-white border border-[#1a4a73] hover:bg-[#e8eef4] disabled:opacity-30 disabled:cursor-not-allowed rounded-sm transition-colors"
                  title="Send this task to the Dump so you can schedule it"
                >
                  ↗ Send to Dump
                </button>
              )}
              <button
                onClick={() => removeTask(t.id)}
                className="flex-shrink-0 text-[14px] leading-none text-gray-300 hover:text-red-500 px-1.5 py-1"
                title="Delete task"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
      <div className="px-3 py-2 border-t border-gray-200 bg-gray-50">
        <button
          onClick={addTask}
          className="text-[11px] font-semibold uppercase tracking-wider text-[#1a4a73] hover:text-[#0f3557] transition-colors"
        >
          + Task
        </button>
      </div>

      {/* Free-text plan — narrative context */}
      <div className="border-t border-gray-300">
        <div className="px-3 py-1.5 bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 font-semibold border-b border-gray-200">
          Narrative · goals, experiments, things to monitor
        </div>
        <textarea
          value={note.plan}
          onChange={(e) => onUpdate(note.id, { plan: e.target.value })}
          rows={5}
          placeholder="Enter plan narrative…"
          className="w-full px-3 py-2 text-[13px] font-mono leading-relaxed text-gray-900 resize-y focus:outline-none focus:bg-[#fffceb] placeholder:text-gray-300"
        />
      </div>
    </section>
  );
}
