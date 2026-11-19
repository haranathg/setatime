import { useMemo, useRef, useState, useEffect } from 'react';
import type { GardenEntry } from '../types';

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
}

// Deterministic color pulled from a primary-category name. Earthy /
// botanical palette so the garden metaphor reads at a glance; stable
// across renders so "Health" is always the same green.
const BUBBLE_PALETTE = [
  { bg: '#16a34a', ring: '#15803d' }, // green — health / movement
  { bg: '#0ea5e9', ring: '#0369a1' }, // sky — mindfulness
  { bg: '#f59e0b', ring: '#b45309' }, // amber — gratitude
  { bg: '#8b5cf6', ring: '#6d28d9' }, // violet — creativity
  { bg: '#ec4899', ring: '#be185d' }, // pink — connection
  { bg: '#14b8a6', ring: '#0f766e' }, // teal — learning
  { bg: '#ef4444', ring: '#b91c1c' }, // red — hot items
  { bg: '#a3a3a3', ring: '#525252' }, // neutral — misc
];
function colorForCategory(name: string): { bg: string; ring: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return BUBBLE_PALETTE[hash % BUBBLE_PALETTE.length];
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
}: GardenViewProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [filterPrimary, setFilterPrimary] = useState<string | null>(null);

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
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100);
  }, [entries, todayKey, filterPrimary]);

  // Sorted categories: biggest first.
  const sortedCategories = useMemo(() => {
    return Array.from(yearCategoryCounts.entries())
      .map(([primary, b]) => ({ primary, total: b.total, subs: Array.from(b.subs.entries()).sort((a, b) => b[1] - a[1]) }))
      .sort((a, b) => b.total - a.total);
  }, [yearCategoryCounts]);

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
              Log small positive actions. Watch your categories grow.
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

        {/* Category bubbles — the "growing tree" metaphor */}
        {sortedCategories.length > 0 && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Your garden, by category</h2>
              {filterPrimary && (
                <button
                  onClick={() => setFilterPrimary(null)}
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  clear filter
                </button>
              )}
            </div>
            <CategoryBubbles
              categories={sortedCategories}
              onSelect={(p) => setFilterPrimary((cur) => (cur === p ? null : p))}
              selected={filterPrimary}
            />
            {/* Sub-category breakdowns under the bubbles */}
            <div className="mt-3 space-y-1.5">
              {sortedCategories.map((c) => {
                const color = colorForCategory(c.primary);
                return (
                  <div key={c.primary} className="flex items-baseline gap-2 text-xs">
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color.bg }}
                    />
                    <span className="font-semibold text-gray-700 dark:text-gray-200">{c.primary}</span>
                    <span className="tabular-nums text-gray-500 dark:text-gray-400">{c.total}</span>
                    {c.subs.length > 0 && (
                      <span className="text-gray-400 dark:text-gray-500 truncate">
                        · {c.subs.map(([s, n]) => `${s} ${n}`).join(' · ')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
                <EntryRow key={e.id} entry={e} onRetry={onRetry} onDelete={onDelete} />
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
              {filterPrimary ? `History · ${filterPrimary}` : 'History'}
            </h2>
            <ul className="space-y-1.5">
              {history.map((e) => (
                <EntryRow key={e.id} entry={e} onRetry={onRetry} onDelete={onDelete} showDay />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Entry row ----------
function EntryRow({
  entry,
  onRetry,
  onDelete,
  showDay,
}: {
  entry: GardenEntry;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
  showDay?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(id);
  }, [confirming]);

  const color = entry.category?.primary ? colorForCategory(entry.category.primary) : null;
  return (
    <li className="flex items-start gap-2 group">
      <span className="text-[10px] font-mono tabular-nums text-gray-400 dark:text-gray-500 pt-1 w-20 flex-shrink-0">
        {showDay ? formatRelDay(entry.createdAt) : formatTime(entry.createdAt)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-800 dark:text-gray-100 leading-snug">{entry.text}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {entry.category ? (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white"
              style={{ backgroundColor: color!.bg }}
            >
              {entry.category.primary}
              {entry.category.sub && <span className="opacity-80">· {entry.category.sub}</span>}
            </span>
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

// ---------- Category bubbles ----------
// Sunflower-ish packed bubble chart. Bubbles are sized by sqrt(count) so
// the big ones don't crowd everything out, and labels float in each
// bubble. A click filters the history list to that category.

function CategoryBubbles({
  categories,
  onSelect,
  selected,
}: {
  categories: { primary: string; total: number }[];
  onSelect: (primary: string) => void;
  selected: string | null;
}) {
  const WIDTH = 480;
  const HEIGHT = 200;
  // Scale by sqrt(count) because a bubble's visual weight is its area,
  // not its radius. Minimum radius so a one-entry category is still
  // tappable; cap on max so no single category eats the whole canvas.
  const maxCount = Math.max(1, ...categories.map((c) => c.total));
  const minR = 22;
  const maxR = 60;
  const scale = (n: number) => minR + (maxR - minR) * Math.sqrt(n / maxCount);

  // Simple deterministic placement: a spiral walk from center. Greedy —
  // each bubble is placed at the first lattice point where it doesn't
  // overlap. Good enough for ≤8 or so categories, which is realistic
  // for a year.
  const placed: { x: number; y: number; r: number; c: { primary: string; total: number } }[] = [];
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  for (const c of categories) {
    const r = scale(c.total);
    let placedThis = false;
    // Try center first for the first bubble.
    if (placed.length === 0) {
      placed.push({ x: cx, y: cy, r, c });
      placedThis = true;
    } else {
      // Spiral outwards.
      for (let step = 0; step < 400 && !placedThis; step++) {
        const angle = step * 0.5;
        const radius = 4 + step * 1.2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (x - r < 4 || x + r > WIDTH - 4 || y - r < 4 || y + r > HEIGHT - 4) continue;
        const clash = placed.some((p) => {
          const dx = p.x - x;
          const dy = p.y - y;
          return Math.sqrt(dx * dx + dy * dy) < p.r + r + 2;
        });
        if (!clash) {
          placed.push({ x, y, r, c });
          placedThis = true;
        }
      }
      // Fallback — push off-canvas rather than overlap (shouldn't trigger
      // for the realistic category counts this app sees).
      if (!placedThis) placed.push({ x: cx, y: cy, r, c });
    }
  }

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto">
      {placed.map(({ x, y, r, c }) => {
        const color = colorForCategory(c.primary);
        const isSelected = selected === c.primary;
        const fontSize = Math.max(10, Math.min(16, r / 3));
        return (
          <g
            key={c.primary}
            className="cursor-pointer transition-transform"
            style={{ transformOrigin: `${x}px ${y}px`, transform: isSelected ? 'scale(1.05)' : 'scale(1)' }}
            onClick={() => onSelect(c.primary)}
          >
            <circle
              cx={x}
              cy={y}
              r={r}
              fill={color.bg}
              fillOpacity={isSelected ? 1 : 0.85}
              stroke={color.ring}
              strokeWidth={isSelected ? 3 : 1.5}
            />
            <text
              x={x}
              y={y - 2}
              textAnchor="middle"
              fill="#fff"
              fontSize={fontSize}
              fontWeight="700"
              style={{ pointerEvents: 'none' }}
            >
              {c.primary}
            </text>
            <text
              x={x}
              y={y + fontSize - 1}
              textAnchor="middle"
              fill="#fff"
              fillOpacity={0.85}
              fontSize={fontSize * 0.85}
              fontWeight="500"
              style={{ pointerEvents: 'none' }}
            >
              {c.total}
            </text>
          </g>
        );
      })}
    </svg>
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
