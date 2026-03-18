import { useState } from 'react';
import Header from './components/Header';
import WeeklyCalendar from './components/WeeklyCalendar';
import StatsView from './components/StatsView';
import { useAppState } from './hooks/useAppState';
import { useStats } from './hooks/useStats';

export default function App() {
  const [activeView, setActiveView] = useState<'calendar' | 'stats'>('calendar');
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
  } = useAppState();

  const stats = useStats(blocks);

  return (
    <div className="h-screen flex flex-col bg-gray-50 font-sans">
      <Header activeView={activeView} onViewChange={setActiveView} />

      {activeView === 'calendar' ? (
        <WeeklyCalendar
          currentWeekStart={currentWeekStart}
          getBlocksForDate={getBlocksForDate}
          onNavigateWeek={navigateWeek}
          onGoToToday={goToToday}
          onAddBlock={addBlock}
          onUpdateBlock={updateBlock}
          onDeleteBlock={deleteBlock}
          onToggleSubTask={toggleSubTask}
        />
      ) : (
        <StatsView stats={stats} />
      )}
    </div>
  );
}
