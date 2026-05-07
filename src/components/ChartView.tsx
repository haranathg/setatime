import { useState, useMemo } from 'react';
import type { ChartNote } from '../types';

interface ChartViewProps {
  notes: ChartNote[];
  onCreateNote: (encounterType?: ChartNote['encounterType']) => ChartNote;
  onUpdateNote: (id: string, updates: Partial<Omit<ChartNote, 'id' | 'createdAt'>>) => void;
  onDeleteNote: (id: string) => void;
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

export default function ChartView({ notes, onCreateNote, onUpdateNote, onDeleteNote }: ChartViewProps) {
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
            <NoteEditor key={selected.id} note={selected} onUpdate={onUpdateNote} onDelete={() => handleDelete(selected.id)} />
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
}: {
  note: ChartNote;
  onUpdate: (id: string, updates: Partial<Omit<ChartNote, 'id' | 'createdAt'>>) => void;
  onDelete: () => void;
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
      <SoapSection
        letter="P"
        label="Plan"
        hint="Concrete next steps. What will you do before the next check-in? Goals, experiments, things to monitor or follow up on."
        value={note.plan}
        onChange={(v) => onUpdate(note.id, { plan: v })}
        rows={6}
      />

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
