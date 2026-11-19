import { useRef, useState } from 'react';
import type { GardenEntry } from '../types';

interface GardenStripProps {
  todaysEntries: GardenEntry[];
  streak: number;
  yearTotal: number;
  topCategories: { primary: string; total: number }[]; // pre-sorted, cap handled by caller
  onAdd: (text: string) => void;
  onOpenGarden: () => void;
}

// Same palette as GardenView — shared visual language.
const BUBBLE_PALETTE = [
  { bg: '#16a34a' },
  { bg: '#0ea5e9' },
  { bg: '#f59e0b' },
  { bg: '#8b5cf6' },
  { bg: '#ec4899' },
  { bg: '#14b8a6' },
  { bg: '#ef4444' },
  { bg: '#a3a3a3' },
];
function colorForCategory(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return BUBBLE_PALETTE[hash % BUBBLE_PALETTE.length].bg;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function GardenStrip({
  todaysEntries,
  streak,
  yearTotal,
  topCategories,
  onAdd,
  onOpenGarden,
}: GardenStripProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    const clean = text.trim();
    if (!clean) return;
    onAdd(clean);
    setText('');
    inputRef.current?.focus();
  };

  // Show at most 3 most-recent entries inline; a "+N more" line
  // reveals that there's more underneath without the strip ballooning.
  const visible = todaysEntries.slice(0, 3);
  const hiddenCount = Math.max(0, todaysEntries.length - visible.length);

  return (
    <section className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/30 border border-green-200 dark:border-green-900/60 rounded-2xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base" aria-hidden>🌱</span>
          <h2 className="text-sm font-semibold text-green-900 dark:text-green-200">Garden</h2>
          <span className="text-[10px] font-medium uppercase tracking-wide text-green-700 dark:text-green-400">
            {streak} day{streak === 1 ? '' : 's'} · {yearTotal} this year
          </span>
        </div>
        <button
          onClick={onOpenGarden}
          className="text-[11px] font-semibold text-green-700 dark:text-green-400 hover:underline"
        >
          Open ›
        </button>
      </div>

      {/* Quick-add input. One line, Enter to log — "do it, log it, keep going" */}
      <div className="flex gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="What did you just do? (AI will categorize it)"
          className="flex-1 min-w-0 px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-green-200 dark:border-green-900/60 rounded-lg text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <button
          onClick={handleAdd}
          disabled={!text.trim()}
          className="px-3 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Log
        </button>
      </div>

      {/* Today's entries preview */}
      {visible.length > 0 && (
        <ul className="mt-3 space-y-1">
          {visible.map((e) => (
            <li key={e.id} className="flex items-start gap-2 text-xs">
              <span className="font-mono tabular-nums text-gray-400 dark:text-gray-500 w-14 flex-shrink-0 pt-0.5">
                {formatTime(e.createdAt)}
              </span>
              <span className="flex-1 min-w-0 text-gray-800 dark:text-gray-100 truncate">{e.text}</span>
              {e.category && (
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white flex-shrink-0"
                  style={{ backgroundColor: colorForCategory(e.category.primary) }}
                  title={e.category.sub ? `${e.category.primary} · ${e.category.sub}` : e.category.primary}
                >
                  {e.category.primary}
                </span>
              )}
              {!e.category && !e.categorizationFailed && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 animate-pulse">…</span>
              )}
              {e.categorizationFailed && (
                <span
                  className="text-[10px] text-amber-600 dark:text-amber-400 flex-shrink-0"
                  title={e.categorizationError || 'Categorize failed'}
                >!</span>
              )}
            </li>
          ))}
          {hiddenCount > 0 && (
            <li className="text-[11px] text-gray-500 dark:text-gray-400 pl-16">
              +{hiddenCount} more today
            </li>
          )}
        </ul>
      )}

      {/* Category bubble preview — mini row of the top growing areas */}
      {topCategories.length > 0 && (
        <div className="mt-3 pt-3 border-t border-green-100 dark:border-green-900/40">
          <div className="flex flex-wrap items-baseline gap-1.5">
            {topCategories.map((c) => (
              <span
                key={c.primary}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: colorForCategory(c.primary) }}
              >
                <span>{c.primary}</span>
                <span className="opacity-80 tabular-nums">{c.total}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
