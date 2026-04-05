import { useState } from 'react';
import Header from './components/Header';
import WeeklyCalendar from './components/WeeklyCalendar';
import StatsView from './components/StatsView';
import BrainDumpSidebar from './components/BrainDumpSidebar';
import BrainDumpFullPage from './components/BrainDumpFullPage';
import { useAppState } from './hooks/useAppState';
import { useBrainDump } from './hooks/useBrainDump';
import { useStats } from './hooks/useStats';
import { getSecretKey, setSecretKey } from './services/syncService';

function LoginGate({ onUnlock }: { onUnlock: () => void }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (key.trim().length < 4) {
      setError('Key must be at least 4 characters');
      return;
    }
    setSecretKey(key.trim());
    onUnlock();
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50 font-sans px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 text-center mb-1">
          Set<span className="text-indigo-600">A</span>Time
        </h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          Enter your secret key to continue
        </p>
        <input
          type="password"
          value={key}
          onChange={(e) => { setKey(e.target.value); setError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="Secret key"
          className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
          autoFocus
        />
        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={key.trim().length < 4}
          className="w-full px-4 py-3 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Unlock
        </button>
        <p className="text-[11px] text-gray-400 text-center mt-3">
          This key syncs your data and authorizes AI features
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(() => !!getSecretKey());
  const [activeView, setActiveView] = useState<'calendar' | 'stats' | 'braindump'>('calendar');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Show login gate if no secret key
  if (!authed) {
    return <LoginGate onUnlock={() => setAuthed(true)} />;
  }

  return <AppMain activeView={activeView} setActiveView={setActiveView} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />;
}

function AppMain({
  activeView,
  setActiveView,
  sidebarOpen,
  setSidebarOpen,
}: {
  activeView: 'calendar' | 'stats' | 'braindump';
  setActiveView: (v: 'calendar' | 'stats' | 'braindump') => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
}) {
  const {
    blocks,
    currentWeekStart,
    addBlock,
    updateBlock,
    deleteBlock,
    toggleSubTask,
    navigateWeek,
    goToToday,
    getBlocksForDate,
    syncing,
    syncError,
    refreshFromCloud,
  } = useAppState();

  const {
    unscheduledTasks,
    schedulingTask,
    extracting,
    extractTasks,
    addManualTask,
    removeScheduledTask,
    startScheduling,
    cancelScheduling,
    deleteTask,
  } = useBrainDump();

  const stats = useStats(blocks);

  const handleViewChange = (view: 'calendar' | 'stats' | 'braindump') => {
    setActiveView(view);
    if (view !== 'calendar' && schedulingTask) {
      cancelScheduling();
    }
  };

  const handleStartSchedulingFromFullPage = (task: typeof schedulingTask) => {
    if (task) {
      startScheduling(task);
      setActiveView('calendar');
      setSidebarOpen(true);
    }
  };

  const handleScheduleComplete = () => {
    if (schedulingTask) {
      removeScheduledTask(schedulingTask.id);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 font-sans">
      <Header
        activeView={activeView}
        onViewChange={handleViewChange}
        syncing={syncing}
        syncError={syncError}
        onRefreshFromCloud={refreshFromCloud}
        unscheduledCount={unscheduledTasks.length}
      />

      {activeView === 'calendar' ? (
        <div className="flex-1 flex overflow-hidden">
          <div className={`flex-1 flex flex-col transition-all ${sidebarOpen ? 'sm:mr-80' : ''}`}>
            <WeeklyCalendar
              currentWeekStart={currentWeekStart}
              getBlocksForDate={getBlocksForDate}
              onNavigateWeek={navigateWeek}
              onGoToToday={goToToday}
              onAddBlock={addBlock}
              onUpdateBlock={updateBlock}
              onDeleteBlock={deleteBlock}
              onToggleSubTask={toggleSubTask}
              schedulingTask={schedulingTask}
              onScheduleComplete={handleScheduleComplete}
            />
          </div>
          <BrainDumpSidebar
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen(!sidebarOpen)}
            unscheduledTasks={unscheduledTasks}
            schedulingTask={schedulingTask}
            extracting={extracting}
            onExtractTasks={extractTasks}
            onAddManualTask={addManualTask}
            onStartScheduling={startScheduling}
            onCancelScheduling={cancelScheduling}
            onDeleteTask={deleteTask}
          />
        </div>
      ) : activeView === 'braindump' ? (
        <BrainDumpFullPage
          unscheduledTasks={unscheduledTasks}
          schedulingTask={schedulingTask}
          extracting={extracting}
          onExtractTasks={extractTasks}
          onAddManualTask={addManualTask}
          onStartScheduling={handleStartSchedulingFromFullPage}
          onCancelScheduling={cancelScheduling}
          onDeleteTask={deleteTask}
          onSwitchToCalendar={() => {
            setActiveView('calendar');
            setSidebarOpen(true);
          }}
        />
      ) : (
        <StatsView stats={stats} />
      )}
    </div>
  );
}
