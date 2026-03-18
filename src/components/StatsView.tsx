import type { Stats } from '../hooks/useStats';

interface StatsViewProps {
  stats: Stats;
}

function StatCard({ label, value, subtitle }: { label: string; value: string | number; subtitle?: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}

export default function StatsView({ stats }: StatsViewProps) {
  const hoursPlanned = Math.floor(stats.totalTimePlanned / 60);
  const minsPlanned = stats.totalTimePlanned % 60;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Stats</h2>

      {stats.totalTasks === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">0</p>
          <p className="text-sm text-gray-500">No tasks yet. Start planning to see your stats!</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            label="Times Set"
            value={stats.totalTasks}
            subtitle="tasks planned"
          />
          <StatCard
            label="Current Streak"
            value={`${stats.currentStreak}d`}
            subtitle="consecutive days"
          />
          <StatCard
            label="Busiest Day"
            value={stats.busiestDay}
          />
          <StatCard
            label="Peak Hour"
            value={stats.mostProductiveHour}
            subtitle="most tasks scheduled"
          />
          <StatCard
            label="Steps Done"
            value={`${stats.completedSubTasks}/${stats.totalSubTasks}`}
            subtitle={`${stats.completionRate}% completion`}
          />
          <StatCard
            label="Time Planned"
            value={hoursPlanned > 0 ? `${hoursPlanned}h ${minsPlanned}m` : `${minsPlanned}m`}
            subtitle="total across all tasks"
          />
          <StatCard
            label="Longest Prep"
            value={`${stats.longestBlockMinutes}m`}
            subtitle="biggest task block"
          />
        </div>
      )}
    </div>
  );
}
