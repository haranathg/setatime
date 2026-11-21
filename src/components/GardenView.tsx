import { useMemo, useRef, useState, useEffect } from 'react';
import type { GardenEntry, GardenCategory, GardenLayout } from '../types';
import GardenTree, { type TreeBranchInput } from './GardenTree';
import GardenNudgeCard from './GardenNudgeCard';
import GardenArrangeSheet from './GardenArrangeSheet';
import GardenMovePicker from './GardenMovePicker';
import { branchNames, goalsIn, isBranchName } from '../utils/gardenLayout';
import { useBranchColors } from '../utils/gardenPalette';
import type { GardenNudge } from '../hooks/useGarden';
import { stageFor, nextStage } from '../utils/gardenGrowth';

interface GardenViewProps {
  entries: GardenEntry[];
  todaysEntries: GardenEntry[];
  yearCategoryCounts: Map<string, { total: number; subs: Map<string, number> }>;
  yearTotal: number;
  yearDayCounts: Map<string, number>;
  streak: number;
  loaded: boolean;
  onAdd: (text: string) => GardenEntry | null;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
  nudge: GardenNudge | null;
  nudgeLoading: boolean;
  nudgeWeekCount: number;
  onNudgeDone: () => void;
  onNudgeAnother: () => void;
  layout: GardenLayout;
  goalCounts: Map<string, number>;
  onSaveLayout: (layout: GardenLayout) => string | null;
  onRecategorize: (id: string, category: GardenCategory) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatRelDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.floor((startOfDay(today) - startOfDay(d)) / dayMs);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function GardenView({
  entries,
  todaysEntries,
  yearCategoryCounts,
  yearTotal,
  yearDayCounts,
  streak,
  loaded,
  onAdd,
  onRetry,
  onDelete,
  nudge,
  nudgeLoading,
  nudgeWeekCount,
  onNudgeDone,
  onNudgeAnother,
  layout,
  goalCounts,
  onSaveLayout,
  onRecategorize,
}: GardenViewProps) {
  const colorOf = useBranchColors();
  const [arranging, setArranging] = useState(false);
  const [moving, setMoving] = useState<GardenEntry | null>(null);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Selecting a branch on the tree filters history; selecting a sub-branch
  // narrows that filter to one leaf cluster. Selecting the same branch
  // again clears both. filterPrimary is the canonical domain name once a
  // branch is picked, or any string when filtering by a legacy value
  // (passed in from, say, a chip click — not currently exposed).
  const [filterPrimary, setFilterPrimary] = useState<string | null>(null);
  const [filterSub, setFilterSub] = useState<string | null>(null);

  const handleAdd = () => {
    const clean = text.trim();
    if (!clean) return;
    onAdd(clean);
    setText('');
    inputRef.current?.focus();
  };

  // History (non-today), newest first, optionally filtered by category.
  const todayKey = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }, []);

  const history = useMemo(() => {
    return entries
      .filter((e) => {
        const d = new Date(e.createdAt);
        const y = d.getFullYear();
        const m = (d.getMonth() + 1).toString().padStart(2, '0');
        const dd = d.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${dd}` !== todayKey;
      })
      .filter((e) => (filterPrimary ? e.category?.primary === filterPrimary : true))
      .filter((e) => (filterSub ? e.category?.sub === filterSub : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100);
  }, [entries, todayKey, filterPrimary, filterSub]);

  // Everything the tree and the list below it draw, in the user's branch
  // order with Other last. Branches with no logs still appear, so the gaps
  // are visible. Goal entries are counted on their goal rather than repeated
  // as free-form subs. Entries whose primary isn't a branch (legacy values
  // still being re-sorted) are left out until the migration in useGarden
  // files them.
  const treeBranches = useMemo<TreeBranchInput[]>(() => {
    return branchNames(layout).map((name) => {
      const bucket = yearCategoryCounts.get(name);
      const goals = goalsIn(layout, name).map((g) => ({ id: g.id, name: g.name, count: goalCounts.get(g.id) || 0 }));
      const goalNames = new Set(goals.map((g) => g.name));
      const subs = Array.from(bucket?.subs.entries() ?? [])
        .filter(([sub]) => !goalNames.has(sub))
        .map(([sub, count]) => ({ name: sub, count }))
        .sort((a, b) => b.count - a.count);
      return { name, colors: colorOf(name), total: bucket?.total ?? 0, subs, goals };
    });
  }, [layout, yearCategoryCounts, goalCounts, colorOf]);

  const maxDomainTotal = useMemo(() => Math.max(0, ...treeBranches.map((b) => b.total)), [treeBranches]);

  // Existing free-form subs per branch, offered as quick picks when moving.
  const subsByBranch = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const b of treeBranches) m.set(b.name, b.subs.map((s) => s.name));
    return m;
  }, [treeBranches]);

  const legacyPendingCount = useMemo(() => {
    let n = 0;
    for (const [primary, b] of yearCategoryCounts.entries()) {
      if (!isBranchName(layout, primary)) n += b.total;
    }
    return n;
  }, [yearCategoryCounts, layout]);

  if (!loaded) {
    return (
      <div className="flex-1 overflow-y-auto bg-gradient-to-b from-green-50 via-gray-50 to-gray-50 dark:from-green-950/20 dark:via-gray-950 dark:to-gray-950">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="text-sm text-gray-400 dark:text-gray-500">Loading your garden…</div>
        </div>
      </div>
    );
  }

  const currentYear = new Date().getFullYear();

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-b from-green-50 via-gray-50 to-gray-50 dark:from-green-950/20 dark:via-gray-950 dark:to-gray-950">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* Header — identity + streak + year total */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span>Garden</span>
              <span className="text-xs font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-950/60 px-2 py-0.5 rounded-full">
                Year of Health · {currentYear}
              </span>
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Log small positive actions. Watch the tree grow — one leaf per log, one branch per area of your life.
            </p>
          </div>
          <div className="flex items-center gap-3 text-right">
            <div>
              <div className="text-2xl font-bold tabular-nums text-green-700 dark:text-green-400">{streak}</div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">day streak</div>
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{yearTotal}</div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">this year</div>
            </div>
          </div>
        </div>

        {/* Compose — the "do a thing, log a thing" input */}
        <div className="bg-white dark:bg-gray-900 border border-green-200 dark:border-green-900/60 rounded-2xl shadow-sm p-4">
          <label className="text-xs font-semibold text-green-800 dark:text-green-300 uppercase tracking-wide">
            What did you just do that was positive?
          </label>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            rows={2}
            placeholder="Brushed teeth · 10-min walk · called mom · stretched before bed…"
            className="w-full mt-1.5 px-3 py-2 text-base bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px] text-gray-400 dark:text-gray-500">⌘/Ctrl+Enter to log · AI will categorize it</span>
            <button
              onClick={handleAdd}
              disabled={!text.trim()}
              className="px-4 py-1.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Log it
            </button>
          </div>
        </div>

        <GardenNudgeCard
          nudge={nudge}
          loading={nudgeLoading}
          weekCount={nudgeWeekCount}
          onDone={onNudgeDone}
          onAnother={onNudgeAnother}
        />

        {/* The tree: one branch per area of the user's life, with goals as
            pinned twigs and sub-branches that grow as sub-categories accumulate. */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              {filterPrimary
                ? filterSub
                  ? `${filterPrimary} · ${filterSub}`
                  : filterPrimary
                : 'Your garden'}
            </h2>
            <div className="flex items-center gap-3">
              {(filterPrimary || filterSub) && (
                <button
                  onClick={() => { setFilterPrimary(null); setFilterSub(null); }}
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  clear filter
                </button>
              )}
              <button
                onClick={() => setArranging(true)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Arrange
              </button>
            </div>
          </div>
          <GardenTree
            branches={treeBranches}
            selectedPrimary={filterPrimary}
            selectedSub={filterSub}
            onSelectPrimary={(d) => {
              setFilterPrimary(d);
              setFilterSub(null);
            }}
            onSelectSub={(d, s) => {
              setFilterPrimary(d);
              setFilterSub((cur) => (cur === s ? null : s));
            }}
          />
          {legacyPendingCount > 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 italic mt-1">
              {legacyPendingCount} earlier {legacyPendingCount === 1 ? 'entry is' : 'entries are'} being re-sorted into your branches — the tree will grow to include them in a moment.
            </p>
          )}
          {/* Per-domain sub-category breakdown — a readable companion
              to the visual tree. Zero-count domains render too so the
              imbalance signal is explicit in text as well. */}
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
            {treeBranches.map(({ name: domain, total, subs, goals, colors: color }) => {
              const isEmpty = total === 0;
              const isSel = filterPrimary === domain;
              const pct = maxDomainTotal > 0 ? (total / maxDomainTotal) * 100 : 0;
              return (
                <button
                  key={domain}
                  onClick={() => {
                    setFilterPrimary(isSel ? null : domain);
                    setFilterSub(null);
                  }}
                  className={`w-full text-left rounded-lg px-2 py-1 -mx-2 transition-colors ${
                    isSel ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: isEmpty ? undefined : color.bg }}
                    >
                      {isEmpty && <span className="block w-full h-full rounded-full border border-gray-300 dark:border-gray-600" />}
                    </span>
                    <span
                      className={`w-40 flex-shrink-0 font-semibold truncate ${
                        isEmpty ? 'text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-100'
                      }`}
                    >
                      {domain}
                    </span>
                    <span className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: color.bg }}
                      />
                    </span>
                    <span
                      className={`w-8 text-right tabular-nums font-semibold ${
                        isEmpty ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'
                      }`}
                    >
                      {total}
                    </span>
                  </div>
                  <div className="pl-[1.125rem] mt-0.5 flex items-baseline gap-3 text-[11px]">
                    <span className="flex-1 min-w-0 truncate text-gray-500 dark:text-gray-400">
                      {subs.length > 0
                        ? subs.map((s) => `${s.name} ${s.count}`).join(' · ')
                        : goals.length > 0
                          ? null
                          : <span className="italic text-gray-400 dark:text-gray-500">Nothing logged yet</span>}
                    </span>
                    <StageHint count={total} />
                  </div>
                  {goals.map((g) => (
                    <div
                      key={g.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFilterPrimary(domain);
                        setFilterSub((cur) => (cur === g.name && filterPrimary === domain ? null : g.name));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          setFilterPrimary(domain);
                          setFilterSub(g.name);
                        }
                      }}
                      className={`ml-[1.125rem] mt-1 flex items-baseline gap-2 text-[11px] rounded-md px-1.5 py-0.5 -mx-1.5 ${
                        filterSub === g.name && filterPrimary === domain
                          ? 'bg-white dark:bg-gray-900'
                          : 'hover:bg-white/70 dark:hover:bg-gray-900/60'
                      }`}
                    >
                      <span style={{ color: color.bg }} aria-hidden>★</span>
                      <span className="font-semibold text-gray-700 dark:text-gray-200 truncate">{g.name}</span>
                      <span className="tabular-nums text-gray-500 dark:text-gray-400">{g.count}</span>
                      <span className="flex-1" />
                      <StageHint count={g.count} />
                    </div>
                  ))}
                </button>
              );
            })}
          </div>
        </div>

        {/* Today's entries */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
            Today <span className="text-xs font-normal text-gray-400 dark:text-gray-500">· {todaysEntries.length}</span>
          </h2>
          {todaysEntries.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">
              Nothing logged yet. The first thing is the hardest.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {todaysEntries.map((e) => (
                <EntryRow key={e.id} entry={e} onRetry={onRetry} onDelete={onDelete} onMove={setMoving} />
              ))}
            </ul>
          )}
        </div>

        {/* Calendar heatmap */}
        {yearTotal > 0 && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              {currentYear} at a glance
            </h2>
            <YearHeatmap year={currentYear} dayCounts={yearDayCounts} />
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              {filterPrimary ? `History · ${filterPrimary}${filterSub ? ` · ${filterSub}` : ''}` : 'History'}
            </h2>
            <ul className="space-y-1.5">
              {history.map((e) => (
                <EntryRow key={e.id} entry={e} onRetry={onRetry} onDelete={onDelete} onMove={setMoving} showDay />
              ))}
            </ul>
          </div>
        )}
      </div>

      {arranging && (
        <GardenArrangeSheet
          layout={layout}
          entries={entries}
          onSave={onSaveLayout}
          onClose={() => setArranging(false)}
        />
      )}
      {moving && (
        <GardenMovePicker
          entry={moving}
          layout={layout}
          subsByBranch={subsByBranch}
          onPick={(category) => onRecategorize(moving.id, category)}
          onClose={() => setMoving(null)}
        />
      )}
    </div>
  );
}

// Current growth stage plus the distance to the next one, so every branch
// always shows a reachable target.
function StageHint({ count }: { count: number }) {
  const stage = stageFor(count);
  const next = nextStage(count);
  return (
    <span className="flex-shrink-0 whitespace-nowrap text-gray-500 dark:text-gray-400">
      {stage && <span className="text-gray-600 dark:text-gray-300">{stage.emoji} {stage.name}</span>}
      {stage && next && <span className="text-gray-300 dark:text-gray-600"> · </span>}
      {next && (
        <span>
          {next.at - count} to {next.emoji} {next.name}
        </span>
      )}
    </span>
  );
}

// ---------- Entry row ----------
function EntryRow({
  entry,
  onRetry,
  onDelete,
  onMove,
  showDay,
}: {
  entry: GardenEntry;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (entry: GardenEntry) => void;
  showDay?: boolean;
}) {
  const colorOf = useBranchColors();
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(id);
  }, [confirming]);

  const bg = entry.category?.primary ? colorOf(entry.category.primary).bg : null;
  return (
    <li className="flex items-start gap-2 group">
      <span className="text-[10px] font-mono tabular-nums text-gray-400 dark:text-gray-500 pt-1 w-20 flex-shrink-0">
        {showDay ? formatRelDay(entry.createdAt) : formatTime(entry.createdAt)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-800 dark:text-gray-100 leading-snug">{entry.text}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {entry.category ? (
            <button
              onClick={() => onMove(entry)}
              title="Wrong place? Tap to move it"
              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 dark:hover:ring-gray-600 dark:ring-offset-gray-900"
              style={{ backgroundColor: bg! }}
            >
              {entry.category.primary}
              {entry.category.sub && <span className="opacity-80">· {entry.category.goalId ? '★ ' : ''}{entry.category.sub}</span>}
            </button>
          ) : entry.categorizationFailed ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onRetry(entry.id)}
                className="text-[10px] font-medium text-amber-700 dark:text-amber-400 hover:underline"
                title={entry.categorizationError || 'AI call failed'}
              >
                ↻ retry categorize
              </button>
              {entry.categorizationError && (
                <span
                  className="text-[10px] text-amber-600 dark:text-amber-500 truncate max-w-xs"
                  title={entry.categorizationError}
                >
                  · {entry.categorizationError}
                </span>
              )}
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-400 dark:text-gray-500">
              <span className="inline-block w-1.5 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full animate-pulse" />
              categorizing…
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => {
          if (confirming) {
            onDelete(entry.id);
            setConfirming(false);
          } else {
            setConfirming(true);
          }
        }}
        className={`opacity-0 group-hover:opacity-100 text-[11px] px-1.5 py-0.5 rounded transition-opacity ${
          confirming
            ? 'opacity-100 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-semibold'
            : 'text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400'
        }`}
        title={confirming ? 'Tap again to confirm' : 'Delete'}
      >
        {confirming ? 'sure?' : '×'}
      </button>
    </li>
  );
}

// ---------- Year heatmap ----------
// GitHub-style: 53 columns of 7 cells (Sun..Sat), filled from Jan 1 to
// Dec 31 of the given year. Each cell shades by count.
function YearHeatmap({ year, dayCounts }: { year: number; dayCounts: Map<string, number> }) {
  // Compute grid: start from the Sunday on/before Jan 1.
  const jan1 = new Date(year, 0, 1);
  const start = new Date(year, 0, 1 - jan1.getDay());
  const dec31 = new Date(year, 11, 31);
  const totalDays = Math.ceil((dec31.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const weeks = Math.ceil(totalDays / 7);

  const CELL = 10;
  const GAP = 2;
  const WIDTH = weeks * (CELL + GAP);
  const HEIGHT = 7 * (CELL + GAP);

  const maxCount = Math.max(1, ...Array.from(dayCounts.values()));
  const shade = (n: number) => {
    if (n === 0) return 'rgba(148,163,184,0.15)'; // neutral slate for empty days
    const t = Math.min(1, n / maxCount);
    // Green ramp
    const alpha = 0.3 + 0.7 * t;
    return `rgba(22,163,74,${alpha})`;
  };

  const today = new Date();
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  const cells: { x: number; y: number; key: string; count: number; isFuture: boolean }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const day = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    if (day.getFullYear() !== year && day.getTime() < new Date(year, 0, 1).getTime()) continue;
    if (day.getFullYear() !== year && day.getTime() > dec31.getTime()) continue;
    const col = Math.floor(i / 7);
    const row = i % 7;
    const y = day.getFullYear();
    const m = (day.getMonth() + 1).toString().padStart(2, '0');
    const d = day.getDate().toString().padStart(2, '0');
    const key = `${y}-${m}-${d}`;
    const count = dayCounts.get(key) || 0;
    const isFuture = day.getTime() > todayMs;
    cells.push({ x: col * (CELL + GAP), y: row * (CELL + GAP), key, count, isFuture });
  }

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} className="block">
        {cells.map((c) => (
          <rect
            key={c.key}
            x={c.x}
            y={c.y}
            width={CELL}
            height={CELL}
            rx={2}
            ry={2}
            fill={c.isFuture ? 'rgba(148,163,184,0.08)' : shade(c.count)}
          >
            <title>{`${c.key}: ${c.count} ${c.count === 1 ? 'entry' : 'entries'}`}</title>
          </rect>
        ))}
      </svg>
    </div>
  );
}
