import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { Thought, ThoughtStatus } from '../types';

interface InboxViewProps {
  thoughts: Thought[];
  onCapture: (text: string) => Thought | null;
  onTriage: (id: string, status: ThoughtStatus, futureSurfaceDate?: string) => void;
  onUpdate: (id: string, updates: Partial<Pick<Thought, 'text' | 'tags' | 'promotedToTaskId' | 'futureSurfaceDate'>>) => void;
  onDelete: (id: string) => void;
  onSendToDump: (label: string) => void;
}

type TabKey = 'triage' | 'now' | 'future' | 'discarded';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'must', 'can', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her',
  'it', 'its', 'they', 'them', 'their', 'this', 'that', 'these', 'those', 'to', 'of', 'in',
  'on', 'at', 'by', 'for', 'with', 'about', 'as', 'from', 'up', 'down', 'out', 'so', 'than',
  'too', 'very', 'just', 'not', 'no', 'yes', 'if', 'then', 'when', 'where', 'how', 'why', 'what',
  'who', 'which', 'all', 'any', 'some', 'one', 'like', 'get', 'got', 'go', 'going', 'gonna',
  'really', 'maybe', 'kind', 'into', 'because', 'also', 'more', 'much', 'still',
]);

const FUTURE_PRESETS: { label: string; days: number }[] = [
  { label: '1 week', days: 7 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
  { label: '6 months', days: 180 },
];

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysKey(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function InboxView({
  thoughts,
  onCapture,
  onTriage,
  onUpdate,
  onDelete,
  onSendToDump,
}: InboxViewProps) {
  const [tab, setTab] = useState<TabKey>('triage');
  const [draft, setDraft] = useState('');
  const [futurePickerFor, setFuturePickerFor] = useState<string | null>(null);
  const captureRef = useRef<HTMLTextAreaElement>(null);

  // Resurface logic: a 'future' thought whose surface date is <= today
  // shows up in the triage tab again, with a "resurfaced" badge.
  const today = todayKey();
  const isResurfaced = useCallback(
    (t: Thought) =>
      t.status === 'future' && !!t.futureSurfaceDate && t.futureSurfaceDate <= today,
    [today]
  );

  const buckets = useMemo(() => {
    const triage: Thought[] = [];
    const now: Thought[] = [];
    const future: Thought[] = [];
    const discarded: Thought[] = [];
    for (const t of thoughts) {
      if (t.status === 'inbox' || isResurfaced(t)) {
        triage.push(t);
      } else if (t.status === 'now') {
        now.push(t);
      } else if (t.status === 'future') {
        future.push(t);
      } else if (t.status === 'discarded') {
        discarded.push(t);
      }
    }
    // Inbox tab: oldest first so you process in order
    triage.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
    // Other tabs: most recently triaged first
    const byTriagedDesc = (a: Thought, b: Thought) =>
      (b.triagedAt || b.capturedAt).localeCompare(a.triagedAt || a.capturedAt);
    now.sort(byTriagedDesc);
    future.sort((a, b) => (a.futureSurfaceDate || '').localeCompare(b.futureSurfaceDate || ''));
    discarded.sort(byTriagedDesc);
    return { triage, now, future, discarded };
  }, [thoughts, isResurfaced]);

  const visibleList =
    tab === 'triage' ? buckets.triage :
    tab === 'now' ? buckets.now :
    tab === 'future' ? buckets.future :
    buckets.discarded;

  const handleCapture = () => {
    if (onCapture(draft)) setDraft('');
    captureRef.current?.focus();
  };

  // Keyboard shortcuts: n / f / d on the topmost triage thought.
  useEffect(() => {
    if (tab !== 'triage') return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const top = buckets.triage[0];
      if (!top) return;
      if (e.key === 'n') {
        e.preventDefault();
        onTriage(top.id, 'now');
      } else if (e.key === 'f') {
        e.preventDefault();
        setFuturePickerFor(top.id);
      } else if (e.key === 'd') {
        e.preventDefault();
        onTriage(top.id, 'discarded');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tab, buckets.triage, onTriage]);

  const handleFuturePick = (id: string, days: number | null, customDate?: string) => {
    let dateKey: string;
    if (customDate) dateKey = customDate;
    else if (days !== null) dateKey = addDaysKey(days);
    else dateKey = addDaysKey(30);
    onTriage(id, 'future', dateKey);
    setFuturePickerFor(null);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Inbox</h1>
          <p className="text-sm text-gray-500 mt-1">
            Capture a thought, then sort it into <span className="font-semibold text-gray-700">Now</span>, <span className="font-semibold text-gray-700">Future</span>, or <span className="font-semibold text-gray-700">Discard</span>. Keyboard: <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-gray-200 rounded">n</kbd> <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-gray-200 rounded">f</kbd> <kbd className="px-1.5 py-0.5 text-[10px] py-0.5 font-mono bg-gray-200 rounded">d</kbd>.
          </p>
        </div>

        {/* Capture */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-3">
          <textarea
            ref={captureRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleCapture();
              }
            }}
            placeholder="What's on your mind? Press Enter to capture, Shift+Enter for newline."
            rows={2}
            className="w-full px-3 py-2 text-base text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none"
            autoFocus
          />
          <div className="flex items-center justify-between mt-1 px-1">
            <p className="text-[11px] text-gray-400">{draft.length > 0 ? `${draft.trim().split(/\s+/).filter(Boolean).length} words` : 'Each Enter captures a new thought'}</p>
            <button
              onClick={handleCapture}
              disabled={!draft.trim()}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              Capture
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 text-sm">
          <TabButton active={tab === 'triage'} onClick={() => setTab('triage')} label="To Triage" count={buckets.triage.length} accent="indigo" />
          <TabButton active={tab === 'now'} onClick={() => setTab('now')} label="Now" count={buckets.now.length} accent="red" />
          <TabButton active={tab === 'future'} onClick={() => setTab('future')} label="Future" count={buckets.future.length} accent="blue" />
          <TabButton active={tab === 'discarded'} onClick={() => setTab('discarded')} label="Discarded" count={buckets.discarded.length} accent="gray" />
        </div>

        {/* List */}
        <div className="space-y-2">
          {visibleList.length === 0 ? (
            <EmptyState tab={tab} />
          ) : (
            visibleList.map((t) => (
              <ThoughtCard
                key={t.id}
                thought={t}
                tab={tab}
                resurfaced={isResurfaced(t)}
                isTopOfTriage={tab === 'triage' && buckets.triage[0]?.id === t.id}
                futurePickerOpen={futurePickerFor === t.id}
                onOpenFuturePicker={() => setFuturePickerFor(t.id)}
                onCloseFuturePicker={() => setFuturePickerFor(null)}
                onPickFuture={(days, customDate) => handleFuturePick(t.id, days, customDate)}
                onTriage={(s) => onTriage(t.id, s)}
                onSendToDump={() => {
                  onSendToDump(t.text);
                  onUpdate(t.id, { promotedToTaskId: 'sent' });
                }}
                onDelete={() => onDelete(t.id)}
              />
            ))
          )}
        </div>

        {/* Patterns panel */}
        {thoughts.length >= 3 && <PatternsPanel thoughts={thoughts} />}
      </div>
    </div>
  );
}

// ---------- Tab button ----------

function TabButton({
  active,
  onClick,
  label,
  count,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  accent: 'indigo' | 'red' | 'blue' | 'gray';
}) {
  const accentColor =
    accent === 'red' ? 'text-red-600' :
    accent === 'blue' ? 'text-blue-600' :
    accent === 'gray' ? 'text-gray-500' :
    'text-indigo-600';
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${
        active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      <span>{label}</span>
      {count > 0 && (
        <span className={`text-[10px] font-bold ${active ? accentColor : 'text-gray-400'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

// ---------- Thought card ----------

function ThoughtCard({
  thought,
  tab,
  resurfaced,
  isTopOfTriage,
  futurePickerOpen,
  onOpenFuturePicker,
  onCloseFuturePicker,
  onPickFuture,
  onTriage,
  onSendToDump,
  onDelete,
}: {
  thought: Thought;
  tab: TabKey;
  resurfaced: boolean;
  isTopOfTriage: boolean;
  futurePickerOpen: boolean;
  onOpenFuturePicker: () => void;
  onCloseFuturePicker: () => void;
  onPickFuture: (days: number | null, customDate?: string) => void;
  onTriage: (s: ThoughtStatus) => void;
  onSendToDump: () => void;
  onDelete: () => void;
}) {
  const [customDate, setCustomDate] = useState('');
  const sentToDump = !!thought.promotedToTaskId;

  return (
    <div
      className={`bg-white border rounded-xl shadow-sm transition-shadow ${
        isTopOfTriage ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-gray-200'
      }`}
    >
      <div className="p-3">
        {/* Meta line */}
        <div className="flex items-center gap-2 mb-1.5 text-[11px] text-gray-400">
          <span>{relativeTime(thought.capturedAt)}</span>
          {resurfaced && (
            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-semibold uppercase tracking-wide">
              Resurfaced
            </span>
          )}
          {tab === 'future' && thought.futureSurfaceDate && (
            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-semibold">
              Resurfaces {formatDate(thought.futureSurfaceDate)}
            </span>
          )}
          {sentToDump && (
            <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[10px] font-semibold">
              ✓ in Dump
            </span>
          )}
          {isTopOfTriage && (
            <span className="ml-auto text-[10px] text-indigo-500 font-mono">[n / f / d]</span>
          )}
        </div>

        {/* Body */}
        <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">{thought.text}</p>

        {/* Actions */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {tab === 'triage' && (
            <>
              <ActionButton color="red" onClick={() => onTriage('now')}>Now</ActionButton>
              <div className="relative">
                <ActionButton color="blue" onClick={() => (futurePickerOpen ? onCloseFuturePicker() : onOpenFuturePicker())}>
                  Future
                </ActionButton>
                {futurePickerOpen && (
                  <FuturePicker
                    customDate={customDate}
                    onCustomDateChange={setCustomDate}
                    onPick={onPickFuture}
                    onClose={onCloseFuturePicker}
                  />
                )}
              </div>
              <ActionButton color="gray" onClick={() => onTriage('discarded')}>Discard</ActionButton>
            </>
          )}
          {tab === 'now' && (
            <>
              {!sentToDump && (
                <button
                  onClick={onSendToDump}
                  className="px-2.5 py-1 text-[12px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors"
                >
                  → Add to Dump
                </button>
              )}
              <ActionButton color="blue" onClick={() => onTriage('future')}>Move to Future</ActionButton>
              <ActionButton color="gray" onClick={() => onTriage('discarded')}>Discard</ActionButton>
            </>
          )}
          {tab === 'future' && (
            <>
              <ActionButton color="red" onClick={() => onTriage('now')}>Move to Now</ActionButton>
              <ActionButton color="gray" onClick={() => onTriage('discarded')}>Discard</ActionButton>
            </>
          )}
          {tab === 'discarded' && (
            <ActionButton color="gray" onClick={() => onTriage('inbox')}>Restore</ActionButton>
          )}
          <button
            onClick={() => {
              if (confirm('Delete this thought permanently?')) onDelete();
            }}
            className="ml-auto text-[11px] text-gray-400 hover:text-red-600 transition-colors"
            title="Delete forever"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  color,
  onClick,
  children,
}: {
  color: 'red' | 'blue' | 'gray';
  onClick: () => void;
  children: React.ReactNode;
}) {
  const styles =
    color === 'red'
      ? 'text-red-700 bg-red-50 hover:bg-red-100 border-red-200'
      : color === 'blue'
      ? 'text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200'
      : 'text-gray-600 bg-gray-50 hover:bg-gray-100 border-gray-200';
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-[12px] font-semibold border rounded-md transition-colors ${styles}`}
    >
      {children}
    </button>
  );
}

// ---------- Future date picker popover ----------

function FuturePicker({
  customDate,
  onCustomDateChange,
  onPick,
  onClose,
}: {
  customDate: string;
  onCustomDateChange: (v: string) => void;
  onPick: (days: number | null, customDate?: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg p-2 z-20">
      <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold px-1 mb-1.5">Resurface in</p>
      <div className="grid grid-cols-2 gap-1 mb-2">
        {FUTURE_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => onPick(p.days)}
            className="px-2 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1 items-center">
        <input
          type="date"
          value={customDate}
          onChange={(e) => onCustomDateChange(e.target.value)}
          min={todayKey()}
          className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={() => customDate && onPick(null, customDate)}
          disabled={!customDate}
          className="px-2 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-md transition-colors"
        >
          Set
        </button>
      </div>
    </div>
  );
}

// ---------- Empty states ----------

function EmptyState({ tab }: { tab: TabKey }) {
  const messages: Record<TabKey, { title: string; body: string }> = {
    triage: { title: 'Inbox zero ✨', body: 'No thoughts to triage. Capture one above when something comes up.' },
    now: { title: 'No active thoughts', body: 'Triage a thought as Now to see it here.' },
    future: { title: 'Nothing parked for later', body: 'Future thoughts will resurface in your Inbox on the date you set.' },
    discarded: { title: 'Nothing discarded', body: 'Discarded thoughts stay here for pattern tracking — you can restore any of them.' },
  };
  const { title, body } = messages[tab];
  return (
    <div className="text-center py-10 px-4 border-2 border-dashed border-gray-200 rounded-xl bg-white">
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      <p className="text-xs text-gray-500 mt-1">{body}</p>
    </div>
  );
}

// ---------- Patterns panel ----------

function PatternsPanel({ thoughts }: { thoughts: Thought[] }) {
  const stats = useMemo(() => {
    const total = thoughts.length;
    const counts = { inbox: 0, now: 0, future: 0, discarded: 0 };
    for (const t of thoughts) counts[t.status]++;

    // Top words
    const freq: Record<string, number> = {};
    for (const t of thoughts) {
      const tokens = t.text.toLowerCase().match(/[a-z][a-z']{2,}/g) || [];
      for (const w of tokens) {
        if (STOP_WORDS.has(w)) continue;
        freq[w] = (freq[w] || 0) + 1;
      }
    }
    const topWords = Object.entries(freq)
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);

    // Captures per day, last 14 days
    const days: { key: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ key, count: 0 });
    }
    const dayMap = new Map(days.map((d) => [d.key, d]));
    for (const t of thoughts) {
      const k = t.capturedAt.slice(0, 10);
      const hit = dayMap.get(k);
      if (hit) hit.count++;
    }
    const maxDay = Math.max(1, ...days.map((d) => d.count));

    return { total, counts, topWords, days, maxDay };
  }, [thoughts]);

  const pct = (n: number) => (stats.total ? Math.round((n / stats.total) * 100) : 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
        Patterns
        <span className="text-[11px] font-normal text-gray-400">{stats.total} thoughts captured</span>
      </h2>

      {/* Status breakdown */}
      <div>
        <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-2">Triage breakdown</p>
        <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
          {stats.counts.inbox > 0 && <div className="bg-indigo-400" style={{ width: `${pct(stats.counts.inbox)}%` }} />}
          {stats.counts.now > 0 && <div className="bg-red-400" style={{ width: `${pct(stats.counts.now)}%` }} />}
          {stats.counts.future > 0 && <div className="bg-blue-400" style={{ width: `${pct(stats.counts.future)}%` }} />}
          {stats.counts.discarded > 0 && <div className="bg-gray-300" style={{ width: `${pct(stats.counts.discarded)}%` }} />}
        </div>
        <div className="grid grid-cols-4 gap-2 mt-2 text-[11px]">
          <Legend dot="bg-indigo-400" label="Inbox" n={stats.counts.inbox} pct={pct(stats.counts.inbox)} />
          <Legend dot="bg-red-400" label="Now" n={stats.counts.now} pct={pct(stats.counts.now)} />
          <Legend dot="bg-blue-400" label="Future" n={stats.counts.future} pct={pct(stats.counts.future)} />
          <Legend dot="bg-gray-300" label="Discarded" n={stats.counts.discarded} pct={pct(stats.counts.discarded)} />
        </div>
      </div>

      {/* Captures per day */}
      <div>
        <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-2">Last 14 days</p>
        <div className="flex items-end gap-0.5 h-12">
          {stats.days.map((d) => (
            <div
              key={d.key}
              title={`${d.key}: ${d.count}`}
              className="flex-1 bg-indigo-200 hover:bg-indigo-400 rounded-sm transition-colors"
              style={{ height: `${(d.count / stats.maxDay) * 100}%`, minHeight: d.count > 0 ? '4px' : '2px' }}
            />
          ))}
        </div>
      </div>

      {/* Top words */}
      {stats.topWords.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-2">Recurring words</p>
          <div className="flex flex-wrap gap-1.5">
            {stats.topWords.map(([word, n]) => (
              <span
                key={word}
                className="px-2 py-0.5 text-[11px] bg-gray-100 text-gray-700 rounded-full"
                style={{ fontSize: `${Math.min(14, 10 + n)}px` }}
              >
                {word} <span className="text-gray-400">·{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({ dot, label, n, pct }: { dot: string; label: string; n: number; pct: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      <span className="text-gray-600">{label}</span>
      <span className="text-gray-400 ml-auto">{n} · {pct}%</span>
    </div>
  );
}
