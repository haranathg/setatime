// Reordering a list the user owns — Today's sections, or the Activate now
// strategy menu.
//
// Up/down arrows rather than drag-and-drop: this is used on a phone, often
// one-handed, and a long-press-drag on a scrolling page is the interaction
// most likely to fail exactly when someone is least patient. Pin-to-top gets
// its own button because with arrows alone it costs a tap per position.
//
// Generic over the key type so both lists get the same affordances and the
// same muscle memory. The caller supplies the labels and the copy; everything
// about how reordering behaves lives here, once.

export interface LayoutItemMeta {
  label: string;
  hint: string;
}

export default function LayoutEditor<K extends string>({
  title,
  intro,
  tuckedNoun,
  resetPrompt,
  resetLabel,
  order,
  meta,
  isTucked,
  onMove,
  onPinToTop,
  onToggleTucked,
  onReset,
  onClose,
}: {
  title: string;
  intro: string;
  /** What the tucked state is called in this list's own words. */
  tuckedNoun: { tucked: string; shown: string };
  resetPrompt: string;
  resetLabel: string;
  order: K[];
  meta: Record<K, LayoutItemMeta>;
  isTucked: (key: K) => boolean;
  onMove: (key: K, delta: -1 | 1) => void;
  onPinToTop: (key: K) => void;
  onToggleTucked: (key: K) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4">
      <div className="w-full sm:max-w-lg max-h-[85vh] flex flex-col bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl">
        <header className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
              {intro}
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
            const item = meta[key];
            const tucked = isTucked(key);
            return (
              <li
                key={key}
                data-layout-row={key}
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
                      {item.label}
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
                      {item.hint}
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <IconBtn
                      label={`Move ${item.label} up`}
                      disabled={i === 0}
                      onClick={() => onMove(key, -1)}
                    >
                      ↑
                    </IconBtn>
                    <IconBtn
                      label={`Move ${item.label} down`}
                      disabled={i === order.length - 1}
                      onClick={() => onMove(key, 1)}
                    >
                      ↓
                    </IconBtn>
                    <IconBtn
                      label={`Pin ${item.label} to the top`}
                      disabled={i === 0}
                      onClick={() => onPinToTop(key)}
                    >
                      📌
                    </IconBtn>
                    <button
                      onClick={() => onToggleTucked(key)}
                      aria-label={
                        tucked
                          ? `Show ${item.label}`
                          : `Tuck ${item.label} out of the way`
                      }
                      title={tucked ? tuckedNoun.tucked : tuckedNoun.shown}
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
              if (confirm(resetPrompt)) onReset();
            }}
            className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500 hover:text-red-500"
          >
            ↺ {resetLabel}
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
