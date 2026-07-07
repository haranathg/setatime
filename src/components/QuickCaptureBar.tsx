import { useState } from 'react';

// Persistent bottom compose bar. Two actions:
//
//   Log (primary, Enter) — casts the thought into the Inbox slice for
//   later triage. The default, lowest-friction action; the whole point
//   is a keystroke and the thought is captured.
//
//   ↗ Schedule (secondary) — opens the calendar modal with the input
//   text pre-filled as the task name. Useful when you already know
//   what you're doing; skips triage.
//
// Bottom-mounted so it lands under the thumb on iPhone (Fitt's law,
// one-handed use). safe-area-inset-bottom padding keeps it clear of
// the home indicator on notched devices.

export default function QuickCaptureBar({
  onLog,
  onSchedule,
}: {
  onLog: (text: string) => void;
  onSchedule: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [flash, setFlash] = useState<'log' | 'schedule' | null>(null);

  const doLog = () => {
    const t = text.trim();
    if (!t) return;
    onLog(t);
    setText('');
    setFlash('log');
    setTimeout(() => setFlash(null), 900);
  };

  const doSchedule = () => {
    const t = text.trim();
    if (!t) return;
    onSchedule(t);
    setText('');
    setFlash('schedule');
    setTimeout(() => setFlash(null), 900);
  };

  return (
    <div
      className="flex-shrink-0 px-3 pt-3"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
    >
      <div className="max-w-3xl mx-auto">
        <div
          className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl backdrop-blur-md ring-1 shadow-lg transition-colors ${
            flash === 'log'
              ? 'bg-emerald-50/95 ring-emerald-200'
              : flash === 'schedule'
              ? 'bg-sky-50/95 ring-sky-200'
              : 'bg-white/90 ring-black/5 focus-within:bg-white focus-within:ring-indigo-300'
          }`}
        >
          <span className="text-gray-400 text-sm">✎</span>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doLog()}
            placeholder="Cast a thought · Enter to log · ↗ to schedule"
            className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none placeholder:text-gray-400"
          />
          {flash === 'log' ? (
            <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700">
              Logged
            </span>
          ) : flash === 'schedule' ? (
            <span className="text-[10px] uppercase tracking-wider font-bold text-sky-700">
              → Calendar
            </span>
          ) : (
            <>
              <button
                onClick={doSchedule}
                disabled={!text.trim()}
                className="px-2 py-1 text-xs font-semibold text-sky-700 bg-white/70 hover:bg-sky-50 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors"
                title="Send to Calendar (opens the scheduling modal)"
              >
                ↗
              </button>
              <button
                onClick={doLog}
                disabled={!text.trim()}
                className="px-3 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:cursor-not-allowed rounded-lg transition-colors"
                title="Log to Inbox (Enter)"
              >
                Log
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
