import { useState } from 'react';
import { getSecretKey, setSecretKey, clearSecretKey } from '../services/syncService';

export type ActiveView =
  | 'calendar'
  | 'habits'
  | 'books'
  | 'stats'
  | 'braindump'
  | 'chart'
  | 'inbox'
  | 'today'
  | 'predictions'
  | 'stars';

export type Hub = 'today' | 'log' | 'charts' | 'sail';

// Which hub does an existing view belong to? Drives the outer tab highlight
// and the sub-tab strip visibility.
export function hubForView(view: ActiveView): Hub {
  if (view === 'today') return 'today';
  if (view === 'inbox') return 'log';
  if (view === 'chart' || view === 'predictions' || view === 'stars' || view === 'books' || view === 'habits' || view === 'stats') {
    return 'charts';
  }
  return 'sail'; // calendar + braindump
}

// Tapping a hub goes to that hub's default view. Later versions could
// remember the last visited sub-view per hub; keeping it simple for v1.
export function defaultViewForHub(hub: Hub): ActiveView {
  if (hub === 'today') return 'today';
  if (hub === 'log') return 'inbox';
  if (hub === 'charts') return 'chart';
  return 'calendar';
}

interface HeaderProps {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  syncing?: boolean;
  syncError?: string | null;
  onRefreshFromCloud?: () => void;
  onExportICal?: () => void;
  unscheduledCount?: number;
  inboxTriageCount?: number;
  blockCount?: number;
  // Quick-capture bar: submits a captured thought into the Inbox slice.
  // Persistent at the top of every hub so capture is always one keystroke away.
  onQuickCapture?: (text: string) => void;
}

export default function Header({ activeView, onViewChange, syncing, syncError, onRefreshFromCloud, onExportICal, unscheduledCount = 0, inboxTriageCount = 0, blockCount = 0, onQuickCapture }: HeaderProps) {
  const [showSync, setShowSync] = useState(false);
  const [key, setKey] = useState(getSecretKey());
  const [saved, setSaved] = useState(false);
  const isConnected = !!getSecretKey();
  const [captureDraft, setCaptureDraft] = useState('');
  const [captureFlash, setCaptureFlash] = useState(false);

  const activeHub = hubForView(activeView);

  const submitCapture = () => {
    const text = captureDraft.trim();
    if (!text || !onQuickCapture) return;
    onQuickCapture(text);
    setCaptureDraft('');
    setCaptureFlash(true);
    setTimeout(() => setCaptureFlash(false), 900);
  };

  // Baked in at build time by the deploy workflow. Format: "<major>.<minor>.<build>"
  // where <major>.<minor> comes from package.json and <build> is the commit
  // count on main (auto-increments on every deploy). Falls back to "dev" for
  // local runs that don't set these.
  const appVersion = import.meta.env.VITE_APP_VERSION || 'dev';
  const buildSha = import.meta.env.VITE_BUILD_SHA || '';
  const buildTime = import.meta.env.VITE_BUILD_TIME || '';
  const versionTitle = buildTime
    ? `v${appVersion}${buildSha ? ` · ${buildSha}` : ''} · built ${buildTime}`
    : `Version ${appVersion}`;

  const handleSave = () => {
    if (key.trim().length < 4) return;
    setSecretKey(key.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onRefreshFromCloud?.();
  };

  const handleDisconnect = () => {
    clearSecretKey();
    setKey('');
    setSaved(false);
  };

  return (
    <header className="flex flex-col border-b border-gray-200 bg-white z-30">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">
            Set<span className="text-indigo-600">A</span>Time
          </h1>
          <span
            className="text-[10px] font-mono text-gray-400 select-all"
            title={versionTitle}
          >
            v{appVersion}
          </span>
        </div>

        {/* Sync button */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowSync(!showSync)}
            className={`p-2 rounded-lg transition-colors ${
              isConnected
                ? 'text-green-600 hover:bg-green-50'
                : 'text-gray-400 hover:bg-gray-100'
            }`}
            title={isConnected ? 'Sync connected' : 'Set up sync'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 1 0 10 10" />
              <path d="M12 2v10l4.5 4.5" />
              {isConnected && <circle cx="20" cy="4" r="3" fill="currentColor" stroke="none" />}
            </svg>
            {syncing && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-indigo-500 rounded-full animate-pulse" />
            )}
          </button>

          {showSync && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-50">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Cloud Sync</h3>
              <p className="text-xs text-gray-500 mb-3">
                Enter a secret key to sync your data across devices. Same key = same data.
              </p>
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Enter secret key (min 4 chars)"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-2"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={key.trim().length < 4}
                  className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saved ? 'Connected!' : 'Connect'}
                </button>
                {isConnected && (
                  <button
                    onClick={handleDisconnect}
                    className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Disconnect
                  </button>
                )}
              </div>
              {syncError && (
                <p className="text-xs text-red-500 mt-2">{syncError}</p>
              )}
              {isConnected && !syncError && (
                <p className="text-xs text-green-600 mt-2">Syncing automatically</p>
              )}

              {/* iCal export */}
              {blockCount > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => { onExportICal?.(); setShowSync(false); }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                      <line x1="16" x2="16" y1="2" y2="6" />
                      <line x1="8" x2="8" y1="2" y2="6" />
                      <line x1="3" x2="21" y1="10" y2="10" />
                    </svg>
                    Export to iCal ({blockCount} events)
                  </button>
                  <p className="text-[10px] text-gray-400 mt-1 text-center">
                    Downloads a .ics file — opens in Apple Calendar, Google Calendar, etc.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Universal quick-capture bar — Alfred-style always-on capture. Anything
          typed here lands in the Inbox slice for later triage. */}
      {onQuickCapture && (
        <div className="px-4 mb-2">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg transition-colors ${
              captureFlash
                ? 'bg-emerald-50 border-emerald-300'
                : 'bg-gray-50 border-gray-200 focus-within:border-indigo-400 focus-within:bg-white'
            }`}
          >
            <span className="text-gray-400 text-sm">✎</span>
            <input
              type="text"
              value={captureDraft}
              onChange={(e) => setCaptureDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitCapture()}
              placeholder="Cast a thought · Enter to log"
              className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none placeholder:text-gray-400"
            />
            {captureFlash ? (
              <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700">
                Logged
              </span>
            ) : (
              <button
                onClick={submitCapture}
                disabled={!captureDraft.trim()}
                className="text-[10px] uppercase tracking-wider font-semibold text-indigo-600 hover:text-indigo-700 disabled:text-gray-300"
              >
                Log
              </button>
            )}
          </div>
        </div>
      )}

      {/* Hub tab strip — Today · Log · Charts · Sail */}
      <nav className="flex gap-1 bg-gray-100 rounded-lg p-1 mx-4 mb-1.5">
        {(
          [
            { hub: 'today' as const, label: 'Today', title: 'Deck: what\'s happening right now' },
            { hub: 'log' as const, label: 'Log', title: 'Ship\'s log: capture thoughts and inbox triage' },
            { hub: 'charts' as const, label: 'Charts', title: 'Consult your charts: notes, predictions, stars, books, habits, stats' },
            { hub: 'sail' as const, label: 'Sail', title: 'Set course: calendar and hold' },
          ] as const
        ).map(({ hub, label, title }) => {
          const active = activeHub === hub;
          // Badges on hubs whose sub-views carry unread work.
          const showInboxBadge = hub === 'log' && inboxTriageCount > 0;
          const showHoldBadge = hub === 'sail' && unscheduledCount > 0;
          return (
            <button
              key={hub}
              onClick={() => onViewChange(defaultViewForHub(hub))}
              className={`relative flex-1 whitespace-nowrap px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                active
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title={title}
            >
              {label}
              {showInboxBadge && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 text-[10px] font-bold bg-amber-500 text-white rounded-full flex items-center justify-center tabular-nums">
                  {inboxTriageCount}
                </span>
              )}
              {showHoldBadge && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 text-[10px] font-bold bg-indigo-600 text-white rounded-full flex items-center justify-center tabular-nums">
                  {unscheduledCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Sub-tab pill selector — appears when the active hub has sub-views. */}
      {activeHub === 'charts' && (
        <nav className="flex gap-1 mx-4 mb-2 overflow-x-auto no-scrollbar">
          {(
            [
              { view: 'chart' as const, label: 'Notes', title: 'Chart notes: SOAP-style self check-ins' },
              { view: 'predictions' as const, label: 'Lab', title: 'Prediction Lab: test forecasts against reality' },
              { view: 'stars' as const, label: 'Stars', title: 'North Stars: 1–3 long-term anchors' },
              { view: 'books' as const, label: 'Books', title: 'Reading tracker' },
              { view: 'habits' as const, label: 'Habits', title: 'Behavioral-activation votes' },
              { view: 'stats' as const, label: 'Stats', title: 'Numbers over time' },
            ] as const
          ).map(({ view, label, title }) => {
            const active = activeView === view;
            return (
              <button
                key={view}
                onClick={() => onViewChange(view)}
                className={`flex-shrink-0 whitespace-nowrap px-2.5 py-1 text-[12px] font-medium rounded-full transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-500 hover:text-gray-800 border border-gray-200'
                }`}
                title={title}
              >
                {label}
              </button>
            );
          })}
        </nav>
      )}

      {activeHub === 'sail' && (
        <nav className="flex gap-1 mx-4 mb-2 overflow-x-auto no-scrollbar">
          {(
            [
              { view: 'calendar' as const, label: 'Calendar', title: 'Weekly calendar with blocks' },
              { view: 'braindump' as const, label: 'Hold', title: 'Cargo hold: tasks waiting to be scheduled' },
            ] as const
          ).map(({ view, label, title }) => {
            const active = activeView === view;
            // Hold pill carries the unscheduled count.
            const showBadge = view === 'braindump' && unscheduledCount > 0;
            return (
              <button
                key={view}
                onClick={() => onViewChange(view)}
                className={`relative flex-shrink-0 whitespace-nowrap px-2.5 py-1 text-[12px] font-medium rounded-full transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-500 hover:text-gray-800 border border-gray-200'
                }`}
                title={title}
              >
                {label}
                {showBadge && (
                  <span className={`ml-1 text-[10px] font-bold tabular-nums ${active ? 'text-white' : 'text-indigo-600'}`}>
                    {unscheduledCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      )}
    </header>
  );
}
