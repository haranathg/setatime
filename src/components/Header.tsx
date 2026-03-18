interface HeaderProps {
  activeView: 'calendar' | 'stats';
  onViewChange: (view: 'calendar' | 'stats') => void;
}

export default function Header({ activeView, onViewChange }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white sticky top-0 z-30">
      <h1 className="text-xl font-semibold tracking-tight text-gray-900">
        Set<span className="text-indigo-600">A</span>Time
      </h1>
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
    </header>
  );
}
