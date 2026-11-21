import { useEffect } from 'react';
import type { GrowthStage } from '../utils/gardenGrowth';
import { DOMAIN_COLORS } from '../utils/gardenColors';
import type { GardenDomain } from '../types';

interface Props {
  milestone: { domain: string; stage: GrowthStage; at: number } | null;
  onDismiss: () => void;
  onOpen: () => void;
}

// Celebrates a branch reaching a new growth stage. Lives at the app level
// because most logs come from the bottom capture bar on whatever page is
// open, not from the Garden itself.
export default function GardenMilestoneToast({ milestone, onDismiss, onOpen }: Props) {
  useEffect(() => {
    if (!milestone) return;
    const t = setTimeout(onDismiss, 6000);
    return () => clearTimeout(t);
  }, [milestone, onDismiss]);

  if (!milestone) return null;
  const color = DOMAIN_COLORS[milestone.domain as GardenDomain]?.bg ?? '#16a34a';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-white dark:bg-gray-900 px-4 py-3 shadow-xl ring-1 ring-black/5 dark:ring-white/10 animate-[garden-pop_300ms_ease-out]"
      >
        <span className="text-2xl" aria-hidden>{milestone.stage.emoji}</span>
        <div className="text-sm">
          <div className="font-semibold text-gray-900 dark:text-gray-100">
            <span style={{ color }}>{milestone.domain}</span> {milestone.stage.phrase}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">New growth stage: {milestone.stage.name}</div>
        </div>
        <button
          onClick={() => { onOpen(); onDismiss(); }}
          className="ml-1 text-xs font-semibold text-green-700 dark:text-green-400 hover:underline"
        >
          See tree
        </button>
        <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  );
}
