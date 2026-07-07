import { useCallback, useState } from 'react';
import Header from './components/Header';
import NowNextBar from './components/NowNextBar';
import WeeklyCalendar from './components/WeeklyCalendar';
import StatsView from './components/StatsView';
import BrainDumpSidebar from './components/BrainDumpSidebar';
import BrainDumpFullPage from './components/BrainDumpFullPage';
import ChartView from './components/ChartView';
import HabitsView from './components/HabitsView';
import BooksView from './components/BooksView';
import InboxView from './components/InboxView';
import NorthStarsView from './components/NorthStarsView';
import PredictionLabView from './components/PredictionLabView';
import TodayView from './components/TodayView';
import { useAppState } from './hooks/useAppState';
import { useBooks } from './hooks/useBooks';
import { useActivities } from './hooks/useActivities';
import { useBlockTemplates } from './hooks/useBlockTemplates';
import { useDashboard } from './hooks/useDashboard';
import { useBrainDump } from './hooks/useBrainDump';
import { useChartNotes } from './hooks/useChartNotes';
import { useHabits } from './hooks/useHabits';
import { useInbox } from './hooks/useInbox';
import { useNorthStars } from './hooks/useNorthStars';
import { usePins } from './hooks/usePins';
import { usePredictions } from './hooks/usePredictions';
import { useStateLog } from './hooks/useStateLog';
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
  const [activeView, setActiveView] = useState<'calendar' | 'habits' | 'books' | 'stats' | 'braindump' | 'chart' | 'inbox' | 'today' | 'predictions' | 'stars'>('today');
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
  activeView: 'calendar' | 'habits' | 'books' | 'stats' | 'braindump' | 'chart' | 'inbox' | 'today' | 'predictions' | 'stars';
  setActiveView: (v: 'calendar' | 'habits' | 'books' | 'stats' | 'braindump' | 'chart' | 'inbox' | 'today' | 'predictions' | 'stars') => void;
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
    toggleSubStep,
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
  const { templates: blockTemplates, saveTemplate: saveBlockTemplate, deleteTemplate: deleteBlockTemplate } = useBlockTemplates();
  const { notes: chartNotes, createNote: createChartNote, updateNote: updateChartNote, deleteNote: deleteChartNote, copyForwardFromLatest: copyForwardChartNote } = useChartNotes();
  const { log: activityLog, syncNote: syncNoteActivities, dropForNote: dropNoteActivities } = useActivities();
  const { pins, addPin, togglePin, editPin, removePin } = usePins();
  const {
    indicators: dashboardIndicators,
    views: dashboardViews,
    logIndicator,
    undoLastLog: undoLastIndicatorLog,
    toggleEnabled: toggleIndicatorEnabled,
    addCustomIndicator,
    removeIndicator,
    setCadence: setIndicatorCadence,
    setSchedule: setIndicatorSchedule,
    setPause: setIndicatorPause,
    skipOccurrence: skipSpiralOccurrence,
    toggleIndicatorStar,
    logs: indicatorLogs,
    materializeForDate: materializeSpiralsForDate,
  } = useDashboard();

  const {
    active: activeStars,
    stars: allStars,
    addStar,
    updateStar,
    archiveStar,
    unarchiveStar,
    deleteStar,
    addTarget: addStarTarget,
    updateTarget: updateStarTarget,
    setTargetStatus: setStarTargetStatus,
    deleteTarget: deleteStarTarget,
    setNextStep: setStarTargetNextStep,
  } = useNorthStars();
  const [focusStarId, setFocusStarId] = useState<string | null>(null);

  const {
    todaysEntries: stateLogTodaysEntries,
    recentReasons: stateLogRecentReasons,
    addEntry: addStateLogEntry,
    deleteEntry: deleteStateLogEntry,
  } = useStateLog();
  // "Schedule this" flow: any surface can prefill a calendar block and jump.
  const [calendarPrefill, setCalendarPrefill] = useState<{
    taskName?: string;
    time?: string;
    dateKey?: string;
  } | null>(null);
  const scheduleThis = useCallback((prefill: { taskName?: string; time?: string; dateKey?: string }) => {
    setCalendarPrefill(prefill);
    setActiveView('calendar');
  }, [setActiveView]);

  // A dump task counts as "aged" once it's been sitting for AGED_DAYS or more.
  // Surfaces on TodayView with schedule/drop shortcuts so long-lived intent
  // doesn't quietly rot in the dump.
  const AGED_DAYS = 5;
  const agedDumpTasks = unscheduledTasks.filter((t) => {
    const ageMs = Date.now() - new Date(t.extractedAt).getTime();
    return ageMs >= AGED_DAYS * 24 * 60 * 60 * 1000;
  });

  // Wrap getBlocksForDate so the calendar + Today see real blocks AND virtual
  // spiral blocks together. Virtual blocks carry `virtualSpiral` so consumers
  // can dispatch differently on tap.
  const getBlocksForDateWithSpirals = useCallback(
    (date: Date) => [...getBlocksForDate(date), ...materializeSpiralsForDate(date)],
    [getBlocksForDate, materializeSpiralsForDate]
  );
  const {
    entries: predictionEntries,
    stats: predictionStats,
    overdueReflections: overduePredictions,
    addEntry: addPrediction,
    recordReflection: recordPredictionReflection,
    deleteEntry: deletePrediction,
  } = usePredictions();
  // When TodayView surfaces an overdue reflection, set this to jump Lab
  // straight into the reflection wizard for that entry.
  const [reflectPredictionId, setReflectPredictionId] = useState<string | null>(null);
  const {
    habits,
    createHabit,
    updateHabit,
    recordVote,
    archiveHabit,
    unarchiveHabit,
    deleteHabit,
  } = useHabits();

  const {
    thoughts: inboxThoughts,
    captureThought,
    triageThought,
    updateThought: updateInboxThought,
    deleteThought: deleteInboxThought,
  } = useInbox();

  const {
    books,
    addBook,
    updateBook,
    updateProgress: updateBookProgress,
    markReading: markBookReading,
    markFinished: markBookFinished,
    deleteBook,
  } = useBooks();

  // Triage tab count: anything still in 'inbox', plus 'future' thoughts whose
  // resurface date has arrived. Drives the badge on the Inbox header tab.
  const todayKey = new Date().toISOString().slice(0, 10);
  const inboxTriageCount = inboxThoughts.filter(
    (t) => t.status === 'inbox' || (t.status === 'future' && !!t.futureSurfaceDate && t.futureSurfaceDate <= todayKey)
  ).length;

  const handleViewChange = (view: 'calendar' | 'habits' | 'books' | 'stats' | 'braindump' | 'chart' | 'inbox' | 'today' | 'predictions' | 'stars') => {
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
        onQuickCapture={(text) => captureThought(text)}
      />

      <NowNextBar blocks={blocks} onJumpToToday={() => setActiveView('today')} />

      {activeView === 'calendar' ? (
        <div className="flex-1 flex overflow-hidden">
          <div className={`flex-1 flex flex-col transition-all ${sidebarOpen ? 'sm:mr-80' : ''}`}>
            <WeeklyCalendar
              currentWeekStart={currentWeekStart}
              getBlocksForDate={getBlocksForDateWithSpirals}
              onSkipSpiralOccurrence={skipSpiralOccurrence}
              onOpenSpiralSettings={() => setActiveView('today')}
              initialPrefill={calendarPrefill}
              onConsumedInitialPrefill={() => setCalendarPrefill(null)}
              onNavigateWeek={navigateWeek}
              onGoToToday={goToToday}
              onAddBlock={addBlock}
              onUpdateBlock={updateBlock}
              onDeleteBlock={deleteBlock}
              onToggleSubTask={toggleSubTask}
              templates={blockTemplates}
              onSaveTemplate={saveBlockTemplate}
              onDeleteTemplate={deleteBlockTemplate}
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
          onCopyForward={copyForwardChartNote}
          onSendPlanTaskToDump={addManualTask}
          onScheduleThis={scheduleThis}
          activityLog={activityLog}
          onSyncNoteActivities={syncNoteActivities}
          onDropNoteActivities={dropNoteActivities}
        />
      ) : activeView === 'habits' ? (
        <HabitsView
          habits={habits}
          onCreate={createHabit}
          onUpdate={updateHabit}
          onRecordVote={recordVote}
          onArchive={archiveHabit}
          onUnarchive={unarchiveHabit}
          onDelete={deleteHabit}
        />
      ) : activeView === 'books' ? (
        <BooksView
          books={books}
          onAdd={addBook}
          onUpdate={updateBook}
          onUpdateProgress={updateBookProgress}
          onMarkReading={markBookReading}
          onMarkFinished={markBookFinished}
          onDelete={deleteBook}
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
      ) : activeView === 'today' ? (
        <TodayView
          todaysBlocks={getBlocksForDateWithSpirals(new Date())}
          onToggleSubTask={toggleSubTask}
          onToggleSubStep={toggleSubStep}
          onSwitchToCalendar={() => setActiveView('calendar')}
          pins={pins}
          onAddPin={addPin}
          onTogglePin={togglePin}
          onEditPin={editPin}
          onRemovePin={removePin}
          overduePredictions={overduePredictions}
          onReflectPrediction={(id) => {
            setReflectPredictionId(id);
            setActiveView('predictions');
          }}
          dashboardIndicators={dashboardIndicators}
          dashboardViews={dashboardViews}
          onLogIndicator={logIndicator}
          onUndoLastIndicatorLog={undoLastIndicatorLog}
          onToggleIndicatorEnabled={toggleIndicatorEnabled}
          onAddCustomIndicator={addCustomIndicator}
          onRemoveIndicator={removeIndicator}
          onPushIndicatorToDump={addManualTask}
          onSetCadence={setIndicatorCadence}
          onSetSchedule={setIndicatorSchedule}
          onSetPause={setIndicatorPause}
          northStars={activeStars}
          onOpenStar={(id) => {
            setFocusStarId(id);
            setActiveView('stars');
          }}
          onOpenAllStars={() => setActiveView('stars')}
          onToggleIndicatorStar={toggleIndicatorStar}
          stateLogTodaysEntries={stateLogTodaysEntries}
          stateLogRecentReasons={stateLogRecentReasons}
          onAddStateLogEntry={addStateLogEntry}
          onDeleteStateLogEntry={deleteStateLogEntry}
          agedDumpTasks={agedDumpTasks}
          onScheduleDumpTask={(task) => {
            // Route through scheduleThis with the task's label; user picks the
            // time. Remove the task from the dump on save (which happens inside
            // handleScheduleComplete via schedulingTask).
            startScheduling(task);
            scheduleThis({ taskName: task.label });
          }}
          onDropDumpTask={(id) => deleteTask(id)}
        />
      ) : activeView === 'predictions' ? (
        <PredictionLabView
          entries={predictionEntries}
          stats={predictionStats}
          overdueReflections={overduePredictions}
          initialReflectId={reflectPredictionId}
          onConsumedInitialReflectId={() => setReflectPredictionId(null)}
          onAddEntry={addPrediction}
          onRecordReflection={recordPredictionReflection}
          onDeleteEntry={deletePrediction}
          onScheduleThis={scheduleThis}
        />
      ) : activeView === 'stars' ? (
        <NorthStarsView
          stars={allStars}
          indicators={dashboardIndicators}
          logs={indicatorLogs}
          initialFocusId={focusStarId}
          onConsumedInitialFocusId={() => setFocusStarId(null)}
          onAddStar={addStar}
          onUpdateStar={updateStar}
          onArchiveStar={archiveStar}
          onUnarchiveStar={unarchiveStar}
          onDeleteStar={deleteStar}
          onToggleIndicatorStar={toggleIndicatorStar}
          onAddTarget={addStarTarget}
          onUpdateTarget={updateStarTarget}
          onSetTargetStatus={setStarTargetStatus}
          onDeleteTarget={deleteStarTarget}
          onSetNextStep={setStarTargetNextStep}
          onScheduleThis={scheduleThis}
          onSendToDump={addManualTask}
        />
      ) : (
        <StatsView stats={stats} />
      )}
    </div>
  );
}
