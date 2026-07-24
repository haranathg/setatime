import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { CompassEntry, CompassItem, ControlCategory } from '../types';

// Compass — Circle of Control worksheet.
//
// Goal: reduce anxiety by making the invisible visible. Take what's
// swirling in your head, list each piece, sort each into Control /
// Influence / Concern, then either act, plan, or explicitly set it
// down. The sort itself is calibrating; you don't have to "solve"
// anything for the exercise to help.
//
// "Getting help" is surfaced as a first-class Control action — many
// people forget asking IS in their control, and that omission keeps
// them stuck.
//
// Nautical fit: Compass = what direction you can actually steer.
// Grounding is body regulation; Compass is mind regulation.

type Phase = 'home' | 'sort' | 'act' | 'done';

const CATEGORY_META: Record<ControlCategory, {
  label: string;
  short: string;
  tone: string;      // bg for header
  ring: string;      // active ring
  chip: string;      // chip button classes when active
  hint: string;      // tone-setting subline
}> = {
  control: {
    label: 'In your control',
    short: 'Control',
    tone: 'bg-indigo-50 border-indigo-200',
    ring: 'ring-indigo-500',
    chip: 'bg-indigo-600 text-white border-indigo-600',
    hint: 'Your actions, effort, response, whether you ask for help.',
  },
  influence: {
    label: 'You can influence',
    short: 'Influence',
    tone: 'bg-sky-50 border-sky-200',
    ring: 'ring-sky-500',
    chip: 'bg-sky-600 text-white border-sky-600',
    hint: 'You can shape it, but not decide it. Others involved.',
  },
  concern: {
    label: 'Only concern',
    short: 'Concern',
    tone: 'bg-slate-100 border-slate-200',
    ring: 'ring-slate-500',
    chip: 'bg-slate-700 text-white border-slate-700',
    hint: "Care about it, can't change it. Energy here is rumination.",
  },
};

interface CompassViewProps {
  entries: CompassEntry[];
  weekCount: number;
  onSaveEntry: (items: CompassItem[]) => CompassEntry;
  onSendToHold: (label: string) => void;
}

export default function CompassView({
  entries,
  weekCount,
  onSaveEntry,
  onSendToHold,
}: CompassViewProps) {
  const [phase, setPhase] = useState<Phase>('home');
  const [items, setItems] = useState<CompassItem[]>([]);
  const [draft, setDraft] = useState('');
  const [sendControlToHold, setSendControlToHold] = useState(true);

  const reset = () => {
    setPhase('home');
    setItems([]);
    setDraft('');
    setSendControlToHold(true);
  };

  const addItem = () => {
    const t = draft.trim();
    if (!t) return;
    setItems((prev) => [...prev, { id: uuidv4(), text: t }]);
    setDraft('');
  };

  const setCategory = (id: string, cat: ControlCategory) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, category: cat } : i)));
  };

  const setNextStep = (id: string, next: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, nextStep: next } : i)));
  };

  const toggleReleased = (id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, released: !i.released } : i)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const allSorted = items.length > 0 && items.every((i) => i.category);

  const finish = () => {
    onSaveEntry(items);
    if (sendControlToHold) {
      for (const it of items) {
        if (it.category !== 'control') continue;
        const label = it.nextStep?.trim()
          ? `${it.text} — ${it.nextStep.trim()}`
          : it.text;
        onSendToHold(label);
      }
    }
    setPhase('done');
  };

  if (phase === 'home') {
    return (
      <HomePhase
        entries={entries}
        weekCount={weekCount}
        onStart={() => setPhase('sort')}
      />
    );
  }
  if (phase === 'sort') {
    return (
      <SortPhase
        items={items}
        draft={draft}
        onDraftChange={setDraft}
        onAdd={addItem}
        onSetCategory={setCategory}
        onRemove={removeItem}
        onBack={reset}
        onNext={() => setPhase('act')}
        nextEnabled={allSorted}
      />
    );
  }
  if (phase === 'act') {
    return (
      <ActPhase
        items={items}
        onSetNextStep={setNextStep}
        onToggleReleased={toggleReleased}
        sendControlToHold={sendControlToHold}
        onToggleSendToHold={() => setSendControlToHold((v) => !v)}
        onBack={() => setPhase('sort')}
        onFinish={finish}
      />
    );
  }
  // done
  return <DonePhase items={items} onAgain={() => { reset(); setPhase('sort'); }} onHome={reset} />;
}

// ---------- Home ----------

function HomePhase({
  entries,
  weekCount,
  onStart,
}: {
  entries: CompassEntry[];
  weekCount: number;
  onStart: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        <header className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">Compass</h2>
          <p className="text-xs text-gray-500 mt-1">
            Sort what's on your mind. Steer where you can; set down what you can't.
          </p>
        </header>

        <CircleOfControlDiagram compact />

        <button
          onClick={onStart}
          className="w-full py-5 rounded-3xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md active:scale-[0.99] transition-transform"
        >
          <div className="text-2xl font-bold tracking-tight">Start</div>
          <div className="text-[13px] font-medium text-indigo-100 mt-1">
            2 – 5 min · get it out of your head
          </div>
        </button>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white border border-gray-200 rounded-2xl px-3 py-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-gray-500">This week</div>
            <div className="text-3xl font-bold text-gray-900 tabular-nums">{weekCount}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {weekCount === 1 ? 'sort' : 'sorts'}
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl px-3 py-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-gray-500">All-time</div>
            <div className="text-3xl font-bold text-gray-900 tabular-nums">{entries.length}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {entries.length === 1 ? 'entry' : 'entries'}
            </div>
          </div>
        </div>

        {entries.length > 0 && (
          <RecentEntriesList entries={entries.slice(0, 5)} />
        )}
      </div>
    </div>
  );
}

function RecentEntriesList({ entries }: { entries: CompassEntry[] }) {
  return (
    <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <header className="px-4 py-2 border-b border-gray-100 text-[10px] uppercase tracking-wider font-bold text-gray-500">
        Recent
      </header>
      <ul>
        {entries.map((e) => {
          const control  = e.items.filter((i) => i.category === 'control').length;
          const influence = e.items.filter((i) => i.category === 'influence').length;
          const concern  = e.items.filter((i) => i.category === 'concern').length;
          const when = new Date(e.createdAt).toLocaleDateString([], {
            month: 'short', day: 'numeric',
          });
          return (
            <li key={e.id} className="px-4 py-2 border-b border-gray-100 last:border-0">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-[13px] text-gray-800 truncate">
                  {e.items[0]?.text || '(empty)'} {e.items.length > 1 ? `+${e.items.length - 1}` : ''}
                </span>
                <span className="text-[11px] text-gray-400 tabular-nums">{when}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[10px]">
                {control > 0 && <span className="text-indigo-700">● {control} control</span>}
                {influence > 0 && <span className="text-sky-700">● {influence} influence</span>}
                {concern > 0 && <span className="text-slate-500">● {concern} concern</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------- The diagram ----------
//
// Three concentric circles labeled Concern (outer) / Influence (middle) /
// Control (inner). Decorative reference during Sort so the metaphor
// stays legible.

function CircleOfControlDiagram({ compact = false }: { compact?: boolean }) {
  const size = compact ? 'w-40 h-40' : 'w-52 h-52';
  return (
    <div className={`${size} mx-auto`}>
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {/* Concern — outer */}
        <circle cx="50" cy="50" r="46" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="0.5" />
        {/* Influence — middle */}
        <circle cx="50" cy="50" r="32" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth="0.5" />
        {/* Control — inner */}
        <circle cx="50" cy="50" r="16" fill="#e0e7ff" stroke="#818cf8" strokeWidth="0.5" />
        {/* Labels */}
        <text x="50" y="10" textAnchor="middle" fontSize="4" fill="#475569" fontWeight="600">Concern</text>
        <text x="50" y="26" textAnchor="middle" fontSize="4" fill="#0369a1" fontWeight="600">Influence</text>
        <text x="50" y="52" textAnchor="middle" fontSize="4.5" fill="#3730a3" fontWeight="700">Control</text>
      </svg>
    </div>
  );
}

// ---------- Sort ----------

function SortPhase({
  items,
  draft,
  onDraftChange,
  onAdd,
  onSetCategory,
  onRemove,
  onBack,
  onNext,
  nextEnabled,
}: {
  items: CompassItem[];
  draft: string;
  onDraftChange: (s: string) => void;
  onAdd: () => void;
  onSetCategory: (id: string, cat: ControlCategory) => void;
  onRemove: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
  nextEnabled: boolean;
}) {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-6 space-y-4 pb-24">
        <header className="text-center">
          <button
            onClick={onBack}
            className="text-[11px] text-gray-500 hover:text-gray-800 mb-1"
          >
            ← Back
          </button>
          <h2 className="text-lg font-semibold text-gray-900">What's on your mind?</h2>
          <p className="text-xs text-gray-500 mt-1">
            List each piece. Sort each into Control · Influence · Concern.
          </p>
        </header>

        <CircleOfControlDiagram compact />

        {/* Add-item input */}
        <div className="flex gap-2">
          <input
            autoFocus
            type="text"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim()) {
                e.preventDefault();
                onAdd();
              }
            }}
            placeholder='e.g. "deadline Friday", "friend upset with me"'
            className="flex-1 min-w-0 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          />
          <button
            onClick={onAdd}
            disabled={!draft.trim()}
            className="px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>

        {items.length === 0 && (
          <div className="text-center text-[12px] text-gray-500 border-2 border-dashed border-gray-200 rounded-2xl bg-white py-6 px-4">
            Add whatever's tugging at your attention. One thing per line — you
            don't have to be complete or exact.
          </div>
        )}

        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="bg-white border border-gray-200 rounded-2xl p-3 space-y-2">
              <div className="flex items-start gap-2">
                <span className="flex-1 text-sm text-gray-800 pt-0.5">{it.text}</span>
                <button
                  onClick={() => onRemove(it.id)}
                  className="text-gray-300 hover:text-red-500 text-lg leading-none"
                  title="Remove"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['control', 'influence', 'concern'] as const).map((cat) => {
                  const m = CATEGORY_META[cat];
                  const active = it.category === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => onSetCategory(it.id, cat)}
                      className={`px-2 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors ${
                        active
                          ? m.chip
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {m.short}
                    </button>
                  );
                })}
              </div>
              {it.category && (
                <div className="text-[10px] text-gray-500 italic pl-0.5">
                  {CATEGORY_META[it.category].hint}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Sticky Next bar */}
      <div className="sticky bottom-0 bg-gray-50/95 backdrop-blur border-t border-gray-200 px-4 py-3">
        <div className="max-w-md mx-auto">
          <button
            onClick={onNext}
            disabled={!nextEnabled}
            className="w-full py-3 rounded-2xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {items.length === 0
              ? 'Add at least one item'
              : nextEnabled
              ? 'Next — decide what to do'
              : 'Sort every item to continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Act ----------

function ActPhase({
  items,
  onSetNextStep,
  onToggleReleased,
  sendControlToHold,
  onToggleSendToHold,
  onBack,
  onFinish,
}: {
  items: CompassItem[];
  onSetNextStep: (id: string, next: string) => void;
  onToggleReleased: (id: string) => void;
  sendControlToHold: boolean;
  onToggleSendToHold: () => void;
  onBack: () => void;
  onFinish: () => void;
}) {
  const controlItems   = useMemo(() => items.filter((i) => i.category === 'control'),   [items]);
  const influenceItems = useMemo(() => items.filter((i) => i.category === 'influence'), [items]);
  const concernItems   = useMemo(() => items.filter((i) => i.category === 'concern'),   [items]);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-6 space-y-5 pb-24">
        <header className="text-center">
          <button
            onClick={onBack}
            className="text-[11px] text-gray-500 hover:text-gray-800 mb-1"
          >
            ← Back
          </button>
          <h2 className="text-lg font-semibold text-gray-900">Decide what to do</h2>
          <p className="text-xs text-gray-500 mt-1">
            One concrete next step for the actionable pieces. Set down the rest.
          </p>
        </header>

        {/* Control */}
        {controlItems.length > 0 && (
          <section className={`rounded-2xl border p-4 space-y-3 ${CATEGORY_META.control.tone}`}>
            <div>
              <div className="text-[11px] uppercase tracking-wider font-bold text-indigo-900">
                In your control
              </div>
              <div className="text-[11px] text-indigo-800 mt-1 leading-relaxed">
                <strong>"Ask for help" is in your control.</strong> Getting help counts as action —
                reaching out to a friend, a coworker, or a professional is often the
                highest-leverage next step. Don't leave it off the list.
              </div>
            </div>
            <ul className="space-y-2">
              {controlItems.map((it) => (
                <li key={it.id} className="bg-white/80 rounded-xl p-3 space-y-2 border border-indigo-100">
                  <div className="text-sm font-semibold text-gray-900">{it.text}</div>
                  <input
                    type="text"
                    value={it.nextStep || ''}
                    onChange={(e) => onSetNextStep(it.id, e.target.value)}
                    placeholder="One concrete next step (or 'ask X for help')"
                    className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                  />
                </li>
              ))}
            </ul>

            <label className="flex items-center gap-2 text-[12px] text-indigo-900 pt-1">
              <input
                type="checkbox"
                checked={sendControlToHold}
                onChange={onToggleSendToHold}
                className="w-4 h-4 accent-indigo-600"
              />
              <span>Also send these to Hold as tasks when I finish</span>
            </label>
          </section>
        )}

        {/* Influence */}
        {influenceItems.length > 0 && (
          <section className={`rounded-2xl border p-4 space-y-3 ${CATEGORY_META.influence.tone}`}>
            <div>
              <div className="text-[11px] uppercase tracking-wider font-bold text-sky-900">
                You can influence
              </div>
              <div className="text-[11px] text-sky-800 mt-1">
                Not yours to decide, but you can shape how it goes.
              </div>
            </div>
            <ul className="space-y-2">
              {influenceItems.map((it) => (
                <li key={it.id} className="bg-white/80 rounded-xl p-3 space-y-2 border border-sky-100">
                  <div className="text-sm font-semibold text-gray-900">{it.text}</div>
                  <input
                    type="text"
                    value={it.nextStep || ''}
                    onChange={(e) => onSetNextStep(it.id, e.target.value)}
                    placeholder="One thing you can do to shape this"
                    className="w-full px-3 py-2 text-sm border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Concern */}
        {concernItems.length > 0 && (
          <section className={`rounded-2xl border p-4 space-y-3 ${CATEGORY_META.concern.tone}`}>
            <div>
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-700">
                Only concern — set it down
              </div>
              <div className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                You care about this. That's OK. Notice it, name it, and set it
                down for now. Energy spent here is rumination — you can pick it
                up again later if it changes.
              </div>
            </div>
            <ul className="space-y-2">
              {concernItems.map((it) => (
                <li key={it.id} className="bg-white/80 rounded-xl p-3 flex items-center gap-2 border border-slate-200">
                  <span className={`flex-1 text-sm ${it.released ? 'text-slate-400 line-through' : 'text-gray-900'}`}>
                    {it.text}
                  </span>
                  <button
                    onClick={() => onToggleReleased(it.id)}
                    className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors ${
                      it.released
                        ? 'bg-slate-200 text-slate-600 border-slate-300'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {it.released ? 'Set down ✓' : 'Set down'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="sticky bottom-0 bg-gray-50/95 backdrop-blur border-t border-gray-200 px-4 py-3">
        <div className="max-w-md mx-auto">
          <button
            onClick={onFinish}
            className="w-full py-3 rounded-2xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
          >
            Finish — save this Compass
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Done ----------

function DonePhase({
  items,
  onAgain,
  onHome,
}: {
  items: CompassItem[];
  onAgain: () => void;
  onHome: () => void;
}) {
  const control   = items.filter((i) => i.category === 'control').length;
  const influence = items.filter((i) => i.category === 'influence').length;
  const concern   = items.filter((i) => i.category === 'concern').length;
  const released  = items.filter((i) => i.released).length;
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-8 space-y-5 text-center">
        <div className="inline-block px-4 py-1.5 rounded-full text-sm font-semibold border bg-indigo-50 text-indigo-800 border-indigo-200">
          Saved
        </div>
        <h2 className="text-lg font-semibold text-gray-900">
          {items.length === 1
            ? "That's one thing out of your head."
            : `That's ${items.length} things out of your head.`}
        </h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          {control > 0 && <>{control} you can act on. </>}
          {influence > 0 && <>{influence} you can shape. </>}
          {concern > 0 && (
            <>
              {concern} to notice and set down
              {released > 0 && concern > 0 && <> ({released} already released)</>}
              .
            </>
          )}
        </p>

        <CircleOfControlDiagram />

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onAgain}
            className="py-3 rounded-2xl text-sm font-semibold text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50"
          >
            Sort more
          </button>
          <button
            onClick={onHome}
            className="py-3 rounded-2xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
