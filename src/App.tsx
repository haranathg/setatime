import { useState } from 'react';
import Header from './components/Header';
import WeeklyCalendar from './components/WeeklyCalendar';
import StatsView from './components/StatsView';
import BrainDumpSidebar from './components/BrainDumpSidebar';
import BrainDumpFullPage from './components/BrainDumpFullPage';
import ChartView from './components/ChartView';
import InboxView from './components/InboxView';
import { useAppState } from './hooks/useAppState';
import { useBrainDump } from './hooks/useBrainDump';
import { useChartNotes } from './hooks/useChartNotes';
import { useInbox } from './hooks/useInbox';
import { useStats } from './hooks/useStats';
import { getSecretKey, setSecretKey } from './services/syncService';
import { downloadICS } from './utils/icalExport';

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
    <div className="h-full flex items-center justify-center bg-gray-50 font-sans px-4">
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
  const [activeView, setActiveView] = useState<'calendar' | 'stats' | 'braindump' | 'chart' | 'inbox'>('calendar');
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
  activeView: 'calendar' | 'stats' | 'braindump' | 'chart' | 'inbox';
  setActiveView: (v: 'calendar' | 'stats' | 'braindump' | 'chart' | 'inbox') => void;
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
    updateTask,
    deleteTask,
  } = useBrainDump();

  const stats = useStats(blocks);
  const { notes: chartNotes, createNote: createChartNote, updateNote: updateChartNote, deleteNote: deleteChartNote } = useChartNotes();
  const {
    thoughts: inboxThoughts,
    captureThought,
    triageThought,
    updateThought: updateInboxThought,
    deleteThought: deleteInboxThought,
  } = useInbox();

  // Triage tab count: anything still in 'inbox', plus 'future' thoughts whose
  // resurface date has arrived. Drives the badge on the Inbox header tab.
  const todayKey = new Date().toISOString().slice(0, 10);
  const inboxTriageCount = inboxThoughts.filter(
    (t) => t.status === 'inbox' || (t.status === 'future' && !!t.futureSurfaceDate && t.futureSurfaceDate <= todayKey)
  ).length;

  const handleViewChange = (view: 'calendar' | 'stats' | 'braindump' | 'chart' | 'inbox') => {
    setActiveView(view);
    if (view !== 'calendar' && schedulingTask) {
      cancelScheduling();
    }
  };

  const handleStartSchedulingFromFullPage = (task: typeof schedulingTask) => {
    if (task) {
      startScheduling(task);
      setActiveView('calendar');
      setSidebarOpen(false); // close sidebar so the calendar is tappable (on mobile the sidebar is full-screen)
    }
  };

  const handleScheduleComplete = () => {
    if (schedulingTask) {
      removeScheduledTask(schedulingTask.id);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 font-sans">
      <Header
        activeView={activeView}
        onViewChange={handleViewChange}
        syncing={syncing}
        syncError={syncError}
        onRefreshFromCloud={refreshFromCloud}
        onExportICal={() => downloadICS(blocks)}
        unscheduledCount={unscheduledTasks.length}
        inboxTriageCount={inboxTriageCount}
        blockCount={blocks.length}
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
          onUpdateTask={updateTask}
          onSwitchToCalendar={() => setActiveView('calendar')}
        />
      ) : activeView === 'chart' ? (
        <ChartView
          notes={chartNotes}
          onCreateNote={createChartNote}
          onUpdateNote={updateChartNote}
          onDeleteNote={deleteChartNote}
        />
      ) : activeView === 'inbox' ? (
        <InboxView
          thoughts={inboxThoughts}
          onCapture={captureThought}
          onTriage={triageThought}
          onUpdate={updateInboxThought}
          onDelete={deleteInboxThought}
          onSendToDump={addManualTask}
        />
      ) : (
        <StatsView stats={stats} />
      )}
    </div>
  );
}
