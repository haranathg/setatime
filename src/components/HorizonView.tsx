import { useMemo, useState } from 'react';
import type { HorizonEra, HorizonState, StateFeeling } from '../types';
import { ERA_COLORS, colorFor, type NewEraInput } from '../hooks/useHorizon';

interface HorizonViewProps {
  state: HorizonState;
  onSetBirthDate: (date: string | undefined) => void;
  onSetLifespan: (years: number) => void;
  onAddEra: (input: NewEraInput) => HorizonEra;
  onUpdateEra: (id: string, patch: Partial<Omit<HorizonEra, 'id' | 'createdAt'>>) => void;
  onDeleteEra: (id: string) => void;
  // Contemplation prompt at the bottom routes into the State log so the
  // reflection loops back into action — same slice the "Log a moment" strip
  // on Today writes to.
  onLogContemplation: (feeling: StateFeeling, reasons: string[], note?: string) => void;
}

// Weeks in a year for the grid. Not calendar-accurate but visually iconic
// (52 columns × N years is the Tim Urban "Life in Weeks" convention). The
// small drift from 52.1775 real weeks/year doesn't matter for perspective.
const WEEKS_PER_YEAR = 52;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function parseYMD(ymd: string): Date {
  // Local-timezone parse. "YYYY-MM-DD" → Date at local midnight.
  return new Date(ymd + 'T00:00:00');
}

// Which week-index (0-based, counted from birth) contains a given date?
function weekIndex(date: Date, birth: Date): number {
  return Math.floor((date.getTime() - birth.getTime()) / MS_PER_WEEK);
}

export default function HorizonView({
  state,
  onSetBirthDate,
  onSetLifespan,
  onAddEra,
  onUpdateEra,
  onDeleteEra,
  onLogContemplation,
}: HorizonViewProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addingEra, setAddingEra] = useState(false);
  const [editingEraId, setEditingEraId] = useState<string | null>(null);

  const birth = state.birthDate ? parseYMD(state.birthDate) : null;
  const now = new Date();
  const totalWeeks = state.lifespanYears * WEEKS_PER_YEAR;
  const livedWeeks = birth ? Math.max(0, weekIndex(now, birth)) : 0;

  // Onboarding: no birth date yet.
  if (!birth) {
    return (
      <HorizonOnboarding
        onSetBirthDate={onSetBirthDate}
        lifespanYears={state.lifespanYears}
        onSetLifespan={onSetLifespan}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#fbfaf7]">
      <div className="max-w-4xl mx-auto px-5 py-6 space-y-5">
        <header className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">Horizon</h1>
            <p className="text-sm text-gray-500 mt-1 leading-snug">
              The whole arc, at a glance. Each dot is a week of your life. Every one of them is the
              only one you'll have.
            </p>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex-shrink-0 text-[10px] uppercase tracking-wider text-gray-400 hover:text-gray-700"
            title="Settings"
          >
            ⚙
          </button>
        </header>

        {/* KPIs */}
        <section className="grid grid-cols-3 gap-3">
          <KPICard label="Weeks lived" value={livedWeeks.toLocaleString()} />
          <KPICard label="Weeks remaining" value={Math.max(0, totalWeeks - livedWeeks).toLocaleString()} />
          <KPICard label="Current age" value={`${Math.floor(livedWeeks / WEEKS_PER_YEAR)}`} sub="years" />
        </section>

        {/* Life Weeks grid */}
        <LifeWeeksGrid
          birth={birth}
          lifespanYears={state.lifespanYears}
          eras={state.eras}
          now={now}
        />

        {/* Eras section */}
        <ErasSection
          eras={state.eras}
          onAdd={() => setAddingEra(true)}
          onEdit={(id) => setEditingEraId(id)}
          onDelete={onDeleteEra}
        />

        {/* Contemplation prompt — routes reflection back into action via the
            state log. The prompt language avoids urgency/anxiety framing. */}
        <ContemplationPrompt onLog={onLogContemplation} />

        {/* Add / edit era modal */}
        {(addingEra || editingEraId) && (
          <EraEditor
            existing={editingEraId ? state.eras.find((e) => e.id === editingEraId) ?? null : null}
            eras={state.eras}
            onCancel={() => {
              setAddingEra(false);
              setEditingEraId(null);
            }}
            onSubmit={(input) => {
              if (editingEraId) {
                onUpdateEra(editingEraId, input);
              } else {
                onAddEra(input);
              }
              setAddingEra(false);
              setEditingEraId(null);
            }}
          />
        )}

        {/* Settings modal */}
        {settingsOpen && (
          <SettingsModal
            birthDate={state.birthDate}
            lifespan={state.lifespanYears}
            onSetBirthDate={onSetBirthDate}
            onSetLifespan={onSetLifespan}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

// ---------- Onboarding (no birth date yet) ----------

function HorizonOnboarding({
  onSetBirthDate,
  lifespanYears,
  onSetLifespan,
}: {
  onSetBirthDate: (d: string | undefined) => void;
  lifespanYears: number;
  onSetLifespan: (n: number) => void;
}) {
  const [date, setDate] = useState('');
  const [span, setSpan] = useState(lifespanYears);
  return (
    <div className="flex-1 overflow-y-auto bg-[#fbfaf7]">
      <div className="max-w-lg mx-auto px-5 py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 mb-2">Horizon</h1>
        <p className="text-sm text-gray-600 leading-relaxed mb-6">
          Zoom out on the whole arc — not to feel small, but to get perspective on when things are.
          The grid you'll see maps each week of your life as a single dot. Eras (school, career
          phase, family life) give the arc structure.
        </p>
        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1 block">
              Your date of birth
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 text-base border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1 block">
              Assumed lifespan · {span} years
            </label>
            <input
              type="number"
              min={30}
              max={120}
              value={span}
              onChange={(e) => setSpan(Number(e.target.value) || 90)}
              className="w-full px-3 py-2 text-base border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
            />
            <p className="text-[10px] text-gray-400 mt-1.5 leading-snug">
              Pick a number that feels honest but generous. Not a countdown — a canvas. You can
              change it anytime.
            </p>
          </div>
          <button
            onClick={() => {
              if (!date) return;
              onSetLifespan(span);
              onSetBirthDate(date);
            }}
            disabled={!date}
            className="w-full px-4 py-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:cursor-not-allowed rounded-xl transition-colors"
          >
            See my horizon
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- KPI card ----------

function KPICard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900 leading-none font-mono">{value}</div>
      {sub && <div className="mt-1 text-[10px] text-gray-400">{sub}</div>}
    </div>
  );
}

// ---------- Life Weeks grid ----------

// Cell dimensions per the new calendar-style layout.
const CELL_PX = 8;                  // side of a single week cell
const CELL_GAP_PX = 1;              // gap between weeks within a month
const MONTH_GAP_PX = 4;             // gap between month groups
const CELLS_PER_MONTH = 4;          // ~4 weeks per month (approximation)
const MONTHS_PER_YEAR = 12;
const ROW_GAP_PX = 2;               // gap between year rows

const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

// Map (yearOffset, monthIdx, weekOfMonthIdx) → approximate real Date for
// era-membership + now-detection checks. Not calendar-accurate but stable.
function cellDate(birthYear: number, yearOffset: number, monthIdx: number, weekIdx: number): Date {
  return new Date(birthYear + yearOffset, monthIdx, weekIdx * 7 + 1);
}

function LifeWeeksGrid({
  birth,
  lifespanYears,
  eras,
  now,
}: {
  birth: Date;
  lifespanYears: number;
  eras: HorizonEra[];
  now: Date;
}) {
  const [hover, setHover] = useState<{ yr: number; mo: number; wk: number } | null>(null);
  const birthYear = birth.getFullYear();
  const birthMonth = birth.getMonth();
  const birthWeekOfMonth = Math.floor((birth.getDate() - 1) / 7);

  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();
  const nowWeekOfMonth = Math.floor((now.getDate() - 1) / 7);

  const eraRanges = useMemo(() => {
    return eras.map((e) => ({
      era: e,
      start: parseYMD(e.startDate),
      end: e.endDate ? parseYMD(e.endDate) : null,
    }));
  }, [eras]);

  // Determine era for a given real Date. When multiple overlap the latest-
  // starting one wins (matches the era-list sort semantics elsewhere).
  const eraForDate = (d: Date) => {
    let winner: (typeof eraRanges)[0] | null = null;
    for (const r of eraRanges) {
      if (d >= r.start) {
        const endBound = r.end ?? (r.era.isEstimated ? new Date(r.start.getFullYear() + 4, r.start.getMonth(), r.start.getDate()) : now);
        if (d <= endBound) {
          if (!winner || r.start > winner.start) winner = r;
        }
      }
    }
    return winner;
  };

  // Year row height so labels align perfectly with cell rows.
  const rowHeightPx = CELL_PX;

  const hoverInfo = (() => {
    if (!hover) return null;
    const d = cellDate(birthYear, hover.yr, hover.mo, hover.wk);
    const age = hover.yr - (d.getMonth() < birthMonth ? 1 : 0); // rough
    const span = eraForDate(d);
    const isFuture = d > now;
    const isPreBirth = d < birth;
    return { date: d, age, span, isFuture, isPreBirth };
  })();

  const rowYears = Array.from({ length: lifespanYears + 1 }, (_, i) => i);

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-semibold text-gray-800">Life calendar</h2>
        <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">
          {lifespanYears} years · month by month
        </span>
      </header>

      <div className="overflow-x-auto">
        {/* Month header row */}
        <div className="flex items-end gap-0 mb-1.5" style={{ paddingLeft: 44 }}>
          {MONTH_LABELS.map((m, i) => (
            <div
              key={i}
              className="text-[9px] font-mono text-gray-400 text-center"
              style={{
                width: CELLS_PER_MONTH * CELL_PX + (CELLS_PER_MONTH - 1) * CELL_GAP_PX,
                marginRight: i < MONTHS_PER_YEAR - 1 ? MONTH_GAP_PX : 0,
              }}
            >
              {m}
            </div>
          ))}
        </div>

        {/* Year rows */}
        <div className="flex flex-col" style={{ gap: `${ROW_GAP_PX}px` }}>
          {rowYears.map((yr) => {
            const actualYear = birthYear + yr;
            // Show a year label every 5 years, plus always birth year and current
            // year.
            const showLabel =
              yr === 0 ||
              actualYear === nowYear ||
              actualYear % 5 === 0;

            return (
              <div key={yr} className="flex items-center gap-2" style={{ height: rowHeightPx }}>
                <div
                  className="w-9 text-right text-[9px] font-mono text-gray-500 flex-shrink-0 leading-none"
                  style={{ lineHeight: `${rowHeightPx}px` }}
                >
                  {showLabel ? actualYear : ''}
                </div>
                <div className="flex items-center gap-0">
                  {MONTH_LABELS.map((_, monthIdx) => (
                    <div
                      key={monthIdx}
                      className="flex items-center"
                      style={{
                        gap: `${CELL_GAP_PX}px`,
                        marginRight: monthIdx < MONTHS_PER_YEAR - 1 ? MONTH_GAP_PX : 0,
                      }}
                    >
                      {Array.from({ length: CELLS_PER_MONTH }, (_, weekIdx) => {
                        const isPreBirth =
                          actualYear < birthYear ||
                          (actualYear === birthYear &&
                            (monthIdx < birthMonth ||
                              (monthIdx === birthMonth && weekIdx < birthWeekOfMonth)));
                        const isNow =
                          actualYear === nowYear &&
                          monthIdx === nowMonth &&
                          weekIdx === nowWeekOfMonth;
                        const d = cellDate(birthYear, yr, monthIdx, weekIdx);
                        const isFuture = d > now;
                        const span = isPreBirth ? null : eraForDate(d);

                        let style: React.CSSProperties = {
                          width: CELL_PX,
                          height: CELL_PX,
                        };
                        let className = 'rounded-[2px] transition-colors ';

                        if (isPreBirth) {
                          className += 'bg-transparent';
                        } else if (span) {
                          const c = colorFor(span.era.color);
                          if (isFuture && span.era.isEstimated) {
                            style.backgroundColor = c.hex + '55';
                          } else {
                            style.backgroundColor = c.hex;
                          }
                        } else if (isFuture) {
                          className += 'bg-gray-100';
                        } else {
                          className += 'bg-gray-300';
                        }

                        if (isNow) {
                          className += ' ring-2 ring-offset-1 ring-indigo-600';
                          style.zIndex = 10;
                          style.position = 'relative';
                        }

                        return (
                          <button
                            key={weekIdx}
                            onMouseEnter={() => setHover({ yr, mo: monthIdx, wk: weekIdx })}
                            onMouseLeave={() =>
                              setHover((h) =>
                                h && h.yr === yr && h.mo === monthIdx && h.wk === weekIdx ? null : h
                              )
                            }
                            className={className}
                            style={style}
                            aria-label={`Age ${yr}, ${MONTH_LABELS[monthIdx]}, week ${weekIdx + 1}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hover info */}
      {hoverInfo && (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-600 leading-tight">
          <span className="font-mono text-gray-800">
            {hoverInfo.date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}
            {!hoverInfo.isPreBirth && ` · age ${hoverInfo.age}`}
          </span>
          {hoverInfo.isPreBirth && (
            <span className="text-[10px] uppercase tracking-wider text-gray-400">Before birth</span>
          )}
          {hoverInfo.isFuture && !hoverInfo.isPreBirth && (
            <span className="text-[10px] uppercase tracking-wider text-gray-400">Future</span>
          )}
          {hoverInfo.span && (
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-full ${
                colorFor(hoverInfo.span.era.color).bg
              } ${colorFor(hoverInfo.span.era.color).text}`}
            >
              {hoverInfo.span.era.name}
              {hoverInfo.span.era.isEstimated && ' · est'}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

// ---------- Eras section ----------

function ErasSection({
  eras,
  onAdd,
  onEdit,
  onDelete,
}: {
  eras: HorizonEra[];
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const sorted = [...eras].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return (
    <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <header className="px-4 py-2 border-b border-gray-100 flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold text-gray-800">Eras</h2>
        <button
          onClick={onAdd}
          className="text-[11px] uppercase tracking-wider font-semibold text-indigo-600 hover:text-indigo-700"
        >
          + Add era
        </button>
      </header>
      {sorted.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-gray-500 leading-relaxed">
          Add named periods — School, Med school, Residency, Family life — to give the arc
          structure. Past eras color the grid; future estimated eras render lighter.
        </div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {sorted.map((e) => {
            const c = colorFor(e.color);
            const startYear = e.startDate.slice(0, 4);
            const endLabel = e.endDate
              ? e.endDate.slice(0, 4)
              : e.isEstimated
              ? 'est. onward'
              : 'ongoing';
            return (
              <li key={e.id} className="px-3 py-2 flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: c.hex }}
                />
                <button
                  onClick={() => onEdit(e.id)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="text-sm font-medium text-gray-900 truncate">{e.name}</div>
                  <div className="text-[10px] text-gray-500 font-mono">
                    {startYear} – {endLabel}
                    {e.isEstimated && ' · estimated'}
                  </div>
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete "${e.name}"?`)) onDelete(e.id);
                  }}
                  className="text-[14px] leading-none text-gray-300 hover:text-red-500 px-1.5"
                >
                  &times;
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------- Contemplation prompt ----------

function ContemplationPrompt({
  onLog,
}: {
  onLog: (feeling: StateFeeling, reasons: string[], note?: string) => void;
}) {
  const [text, setText] = useState('');
  const [flash, setFlash] = useState(false);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onLog('neutral', ['horizon'], trimmed);
    setText('');
    setFlash(true);
    setTimeout(() => setFlash(false), 1200);
  };

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-2">
        What does this perspective mean for today?
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder='One thought. Anything. e.g. "Call Mom." "Stop delaying the residency application." "Enjoy this specific Tuesday."'
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 leading-relaxed"
      />
      <div className="mt-2 flex items-center justify-between">
        <p className="text-[10px] text-gray-400 leading-snug">
          Saves to your state log with the tag <span className="font-mono">horizon</span>.
        </p>
        <button
          onClick={submit}
          disabled={!text.trim()}
          className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
            flash
              ? 'bg-emerald-500 text-white'
              : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-200 disabled:cursor-not-allowed'
          }`}
        >
          {flash ? 'Logged' : 'Log thought'}
        </button>
      </div>
    </section>
  );
}

// ---------- Era editor modal ----------

function EraEditor({
  existing,
  eras,
  onCancel,
  onSubmit,
}: {
  existing: HorizonEra | null;
  eras: HorizonEra[];
  onCancel: () => void;
  onSubmit: (input: NewEraInput) => void;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [color, setColor] = useState(
    existing?.color ??
      ERA_COLORS.find((c) => !new Set(eras.map((e) => e.color)).has(c.id))?.id ??
      ERA_COLORS[0].id
  );
  const [startDate, setStartDate] = useState(existing?.startDate ?? '');
  const [endMode, setEndMode] = useState<'has-end' | 'ongoing' | 'estimated'>(() => {
    if (!existing) return 'has-end';
    if (existing.endDate && !existing.isEstimated) return 'has-end';
    if (existing.endDate && existing.isEstimated) return 'estimated';
    return 'ongoing';
  });
  const [endDate, setEndDate] = useState(existing?.endDate ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || !startDate) return;
    const input: NewEraInput = {
      name: trimmed,
      color,
      startDate,
      description: description.trim() || undefined,
    };
    if (endMode === 'has-end') {
      input.endDate = endDate || undefined;
      input.isEstimated = false;
    } else if (endMode === 'estimated') {
      input.endDate = endDate || undefined;
      input.isEstimated = true;
    } else {
      input.endDate = undefined;
      input.isEstimated = false;
    }
    onSubmit(input);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        className="bg-white border border-gray-200 rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{existing ? 'Edit era' : 'New era'}</h3>
          <button onClick={onCancel} className="text-xl leading-none text-gray-400 hover:text-gray-700">
            &times;
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1 block">
              Name
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. "Med school"'
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1 block">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {ERA_COLORS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setColor(c.id)}
                  className={`w-7 h-7 rounded-full transition-all ${
                    color === c.id ? 'ring-4 ring-offset-2' : 'ring-1 ring-gray-200 hover:ring-gray-400'
                  }`}
                  style={{
                    backgroundColor: c.hex,
                    ...(color === c.id ? { boxShadow: `0 0 0 2px ${c.hex}` } : {}),
                  }}
                  title={c.label}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1 block">
                Start
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1 block">
                End
              </label>
              {endMode !== 'ongoing' && (
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              )}
              {endMode === 'ongoing' && (
                <div className="px-2 py-1.5 text-sm text-gray-500 italic border border-gray-100 rounded-lg bg-gray-50">
                  ongoing
                </div>
              )}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">
              End mode
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { value: 'has-end', label: 'Known end' },
                  { value: 'ongoing', label: 'Ongoing' },
                  { value: 'estimated', label: 'Estimated end' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setEndMode(opt.value)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                    endMode === opt.value
                      ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {endMode === 'estimated' && (
              <p className="text-[10px] text-gray-400 mt-1.5 leading-snug">
                Future-estimated eras render lighter on the grid so projected periods look
                distinct from known ones.
              </p>
            )}
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1 block">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Anything you want to remember about this era"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-800">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || !startDate}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:cursor-not-allowed rounded-xl transition-colors"
          >
            {existing ? 'Save' : 'Add era'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Settings modal ----------

function SettingsModal({
  birthDate,
  lifespan,
  onSetBirthDate,
  onSetLifespan,
  onClose,
}: {
  birthDate: string | undefined;
  lifespan: number;
  onSetBirthDate: (d: string | undefined) => void;
  onSetLifespan: (n: number) => void;
  onClose: () => void;
}) {
  const [dob, setDob] = useState(birthDate ?? '');
  const [span, setSpan] = useState(lifespan);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white border border-gray-200 rounded-2xl shadow-xl w-full max-w-sm max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Horizon settings</h3>
          <button onClick={onClose} className="text-xl leading-none text-gray-400 hover:text-gray-700">
            &times;
          </button>
        </header>
        <div className="px-4 py-4 space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1 block">
              Date of birth
            </label>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1 block">
              Assumed lifespan · {span} years
            </label>
            <input
              type="number"
              min={30}
              max={120}
              value={span}
              onChange={(e) => setSpan(Number(e.target.value) || 90)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <p className="text-[10px] text-gray-400 mt-1.5 leading-snug">
              A canvas number, not a countdown. Adjust if it feels wrong.
            </p>
          </div>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800">
            Cancel
          </button>
          <button
            onClick={() => {
              onSetLifespan(span);
              onSetBirthDate(dob || undefined);
              onClose();
            }}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
