import { useState } from 'react';
import type { GardenCategory, GardenEntry, GardenLayout } from '../types';
import { GARDEN_OTHER } from '../types';
import { branchNames, goalsIn } from '../utils/gardenLayout';
import { useBranchColors } from '../utils/gardenPalette';

interface Props {
  entry: GardenEntry;
  layout: GardenLayout;
  subsByBranch: Map<string, string[]>; // existing free-form subs per branch, for quick picks
  onPick: (category: GardenCategory) => void;
  onClose: () => void;
}

// Moves one entry by hand. The choice is also remembered as an example for
// the AI, so correcting "cooked dinner" onto "Learn to cook" once teaches it
// where similar entries belong.
export default function GardenMovePicker({ entry, layout, subsByBranch, onPick, onClose }: Props) {
  const colorOf = useBranchColors();
  const [branch, setBranch] = useState<string>(entry.category?.primary && branchNames(layout).includes(entry.category.primary)
    ? entry.category.primary
    : layout.branches[0]?.name ?? GARDEN_OTHER);
  const [newSub, setNewSub] = useState('');

  const goals = goalsIn(layout, branch);
  const goalNames = new Set(goals.map((g) => g.name));
  const subs = (subsByBranch.get(branch) || []).filter((s) => !goalNames.has(s));
  const current = entry.category;

  const pick = (category: GardenCategory) => {
    onPick(category);
    onClose();
  };

  const chip = (active: boolean) =>
    `px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
      active
        ? 'text-white border-transparent'
        : 'text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Move entry"
        className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Move entry</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 italic">"{entry.text}"</p>

        <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Branch</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {branchNames(layout).map((name) => {
            const active = name === branch;
            return (
              <button
                key={name}
                onClick={() => setBranch(name)}
                className={chip(active)}
                style={active ? { backgroundColor: colorOf(name).bg } : undefined}
              >
                {name}
              </button>
            );
          })}
        </div>

        {goals.length > 0 && (
          <>
            <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Goals in {branch}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {goals.map((g) => {
                const active = current?.goalId === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => pick({ primary: branch, sub: g.name, goalId: g.id })}
                    className={chip(active)}
                    style={active ? { backgroundColor: colorOf(branch).bg } : undefined}
                  >
                    ★ {g.name}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Sub-category</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {subs.map((s) => {
            const active = !current?.goalId && current?.primary === branch && current?.sub === s;
            return (
              <button
                key={s}
                onClick={() => pick({ primary: branch, sub: s })}
                className={chip(active)}
                style={active ? { backgroundColor: colorOf(branch).bg } : undefined}
              >
                {s}
              </button>
            );
          })}
          {subs.length === 0 && <span className="text-xs text-gray-400 dark:text-gray-500 italic">None yet in {branch}.</span>}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const s = newSub.trim();
            if (s) pick({ primary: branch, sub: s.slice(0, 40) });
          }}
        >
          <input
            value={newSub}
            onChange={(e) => setNewSub(e.target.value)}
            maxLength={40}
            placeholder={`New sub-category in ${branch}`}
            className="flex-1 min-w-0 px-2.5 py-1.5 text-sm bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            type="submit"
            disabled={!newSub.trim()}
            className="px-3 py-1.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-40"
          >
            Move
          </button>
        </form>

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
