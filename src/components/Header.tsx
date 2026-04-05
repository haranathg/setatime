import { useState } from 'react';
import { getSecretKey, setSecretKey, clearSecretKey } from '../services/syncService';

interface HeaderProps {
  activeView: 'calendar' | 'stats' | 'braindump';
  onViewChange: (view: 'calendar' | 'stats' | 'braindump') => void;
  syncing?: boolean;
  syncError?: string | null;
  onRefreshFromCloud?: () => void;
  unscheduledCount?: number;
}

export default function Header({ activeView, onViewChange, syncing, syncError, onRefreshFromCloud, unscheduledCount = 0 }: HeaderProps) {
  const [showSync, setShowSync] = useState(false);
  const [key, setKey] = useState(getSecretKey());
  const [saved, setSaved] = useState(false);
  const isConnected = !!getSecretKey();

  // Baked in at build time by the deploy workflow. Falls back to "dev" for
  // local `npm run dev` / `npm run build` runs that don't set these.
  const appVersion = import.meta.env.VITE_APP_VERSION || 'dev';
  const buildTime = import.meta.env.VITE_BUILD_TIME || '';
  const versionTitle = buildTime ? `Built ${buildTime} (${appVersion})` : `Version ${appVersion}`;

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
    <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white sticky top-0 z-30">
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

      <div className="flex items-center gap-2">
        <nav className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => onViewChange('calendar')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeView === 'calendar'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Calendar
          </button>
          <button
            onClick={() => onViewChange('braindump')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors relative ${
              activeView === 'braindump'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Dump
            {unscheduledCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 text-[10px] font-bold bg-indigo-600 text-white rounded-full flex items-center justify-center">
                {unscheduledCount > 9 ? '9+' : unscheduledCount}
              </span>
            )}
          </button>
          <button
            onClick={() => onViewChange('stats')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeView === 'stats'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Stats
          </button>
        </nav>

        {/* Sync button */}
        <div className="relative">
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
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
