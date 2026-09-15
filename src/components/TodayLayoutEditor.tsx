import type { TodaySectionKey } from '../types';

// Reordering Today.
//
// Up/down arrows rather than drag-and-drop: this is used on a phone, often
// one-handed, and a long-press-drag on a scrolling page is the interaction
// most likely to fail exactly when someone is least patient. Pin-to-top gets
// its own button because with arrows alone it costs a tap per position.

const SECTION_META: Record<TodaySectionKey, { label: string; hint: string }> = {
  activate:    { label: 'Activate now',   hint: 'The strategy menu and your reminder line' },
  projectsDue: { label: 'Coming due',     hint: 'Projects due within a week, or stalled' },
  block:       { label: "Now / next block", hint: 'All-day banner and the block you are in' },
  plan:        { label: "Today's 1/3/5",  hint: 'The day plan and your handwritten photo' },
  weekBoard:   { label: 'This week',      hint: 'The week board' },
  northStars:  { label: 'North Stars',    hint: 'Your long-term anchors' },
  stateLog:    { label: 'Log a moment',   hint: 'Window of tolerance, and your resets' },
  basics:      { label: 'Daily basics',   hint: 'Hydration, meals, sleep and the rest' },
  predictions: { label: 'Lab reflections', hint: 'Predictions waiting to be closed out' },
  agedDump:    { label: 'Aging in Hold',  hint: 'Captured tasks going stale' },
  pins:        { label: "Don't forget",   hint: 'Friction-free todos' },
  upNext:      { label: 'Up next',        hint: 'Later blocks today' },
};

export default function TodayLayoutEditor({
  order,
  isTucked,
  onMove,
  onPinToTop,
  onToggleTucked,
  onReset,
  onClose,
}: {
  order: TodaySectionKey[];
  isTucked: (key: TodaySectionKey) => boolean;
  onMove: (key: TodaySectionKey, delta: -1 | 1) => void;
  onPinToTop: (key: TodaySectionKey) => void;
  onToggleTucked: (key: TodaySectionKey) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4">
      <div className="w-full sm:max-w-lg max-h-[85vh] flex flex-col bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl">
        <header className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Arrange Today
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
              Reorder, pin what you use most to the top, or tuck the rest behind
              “show more”.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[11px] uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 shrink-0"
          >
            Done
          </button>
        </header>

        <ul className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
          {order.map((key, i) => {
            const meta = SECTION_META[key];
            const tucked = isTucked(key);
            return (
              <li
                key={key}
                className={`rounded-xl border px-3 py-2 ${
                  tucked
                    ? 'bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-sm font-semibold truncate ${
                        tucked
                          ? 'text-gray-500 dark:text-gray-400'
                          : 'text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      {meta.label}
                      {/* "Top" rather than "Pinned": this marks the first
                          position, which is also what pinning produces — but
                          whatever sits here by default was never pinned. */}
                      {i === 0 && !tucked && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400">
                          Top
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                      {meta.hint}
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <IconBtn
                      label={`Move ${meta.label} up`}
                      disabled={i === 0}
                      onClick={() => onMove(key, -1)}
                    >
                      ↑
                    </IconBtn>
                    <IconBtn
                      label={`Move ${meta.label} down`}
                      disabled={i === order.length - 1}
                      onClick={() => onMove(key, 1)}
                    >
                      ↓
                    </IconBtn>
                    <IconBtn
                      label={`Pin ${meta.label} to the top`}
                      disabled={i === 0}
                      onClick={() => onPinToTop(key)}
                    >
                      📌
                    </IconBtn>
                    <button
                      onClick={() => onToggleTucked(key)}
                      aria-label={
                        tucked
                          ? `Show ${meta.label} on Today`
                          : `Tuck ${meta.label} behind show more`
                      }
                      title={tucked ? 'Behind “show more”' : 'Shown on Today'}
                      className={`ml-1 px-2 py-1 text-[10px] uppercase tracking-wider font-bold rounded-lg border transition-colors ${
                        tucked
                          ? 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                          : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {tucked ? 'Tucked' : 'Shown'}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <footer className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <button
            onClick={() => {
              if (confirm('Put Today back to the original order?')) onReset();
            }}
            className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500 hover:text-red-500"
          >
            ↺ Reset order
          </button>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            Syncs across your devices
          </span>
        </footer>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="w-7 h-7 flex items-center justify-center text-sm rounded-lg border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:border-indigo-400 dark:hover:border-indigo-600 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}
