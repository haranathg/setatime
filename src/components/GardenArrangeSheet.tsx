import { useState } from 'react';
import type { GardenEntry, GardenLayout } from '../types';
import { GARDEN_OTHER } from '../types';
import { PALETTE, OTHER_COLORS } from '../utils/gardenColors';
import {
  MAX_BRANCHES,
  MAX_GOALS_PER_BRANCH,
  MAX_NAME_LEN,
  newBranch,
  removalSummary,
  validateLayout,
  normalizeLayout,
} from '../utils/gardenLayout';

interface Props {
  layout: GardenLayout;
  entries: GardenEntry[];
  onSave: (layout: GardenLayout) => string | null;
  onClose: () => void;
}

// Where the user shapes their own tree: which branches exist and in what
// order, and the goals they're growing inside each one. Edits happen on a
// draft and apply on Save, so renaming or removing something is one step
// that carries every existing entry along with it.
export default function GardenArrangeSheet({ layout, entries, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<GardenLayout>(() => structuredClone(layout));
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const update = (fn: (d: GardenLayout) => GardenLayout) => {
    setDraft((d) => fn(structuredClone(d)));
    setError(null);
    setConfirming(false);
  };

  const moveBranch = (i: number, delta: -1 | 1) =>
    update((d) => {
      const j = i + delta;
      if (j < 0 || j >= d.branches.length) return d;
      [d.branches[i], d.branches[j]] = [d.branches[j], d.branches[i]];
      return d;
    });

  const addBranch = () =>
    update((d) => {
      d.branches.push(newBranch(d, ''));
      return d;
    });

  const addGoal = (branchId: string) =>
    update((d) => {
      d.goals.push({ id: `g-${Date.now().toString(36)}`, name: '', branchId, createdAt: new Date().toISOString() });
      return d;
    });

  const summary = removalSummary(layout, normalizeLayout(draft), entries);
  const removesSomething = summary.removedBranches.length > 0 || summary.removedGoals.length > 0;

  const save = () => {
    const problem = validateLayout(normalizeLayout(draft));
    if (problem) {
      setError(problem);
      return;
    }
    if (removesSomething && !confirming) {
      setConfirming(true);
      return;
    }
    const result = onSave(draft);
    if (result) setError(result);
    else onClose();
  };

  const input =
    'min-w-0 px-2 py-1 text-sm bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500';
  const iconBtn =
    'w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Arrange your tree"
        className="w-full sm:max-w-xl max-h-[92vh] flex flex-col bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Arrange your tree</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Branches are the big areas of your life. Goals live inside a branch, and anything you log that
            moves a goal forward grows that goal's twig first.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {draft.branches.map((b, i) => {
            const goals = draft.goals.filter((g) => g.branchId === b.id);
            const colors = PALETTE[b.color] ?? OTHER_COLORS;
            return (
              <div key={b.id} className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: colors.bg }} />
                  <input
                    value={b.name}
                    maxLength={MAX_NAME_LEN}
                    placeholder="Branch name"
                    aria-label="Branch name"
                    onChange={(e) => update((d) => { d.branches[i].name = e.target.value; return d; })}
                    className={`${input} flex-1 font-semibold`}
                  />
                  <button className={iconBtn} onClick={() => moveBranch(i, -1)} disabled={i === 0} aria-label={`Move ${b.name} left`}>↑</button>
                  <button className={iconBtn} onClick={() => moveBranch(i, 1)} disabled={i === draft.branches.length - 1} aria-label={`Move ${b.name} right`}>↓</button>
                  <button
                    className={`${iconBtn} hover:!text-red-600`}
                    onClick={() => update((d) => {
                      d.branches.splice(i, 1);
                      d.goals = d.goals.filter((g) => g.branchId !== b.id);
                      return d;
                    })}
                    aria-label={`Remove ${b.name}`}
                  >
                    ×
                  </button>
                </div>

                <div className="mt-2 ml-5 space-y-2">
                  {goals.map((g) => {
                    const gi = draft.goals.findIndex((x) => x.id === g.id);
                    return (
                      <div key={g.id} className="flex flex-col gap-1 rounded-lg bg-gray-50 dark:bg-gray-800/60 p-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm" style={{ color: colors.bg }} aria-hidden>★</span>
                          <input
                            value={g.name}
                            maxLength={MAX_NAME_LEN}
                            placeholder="Goal, e.g. Learn to cook"
                            aria-label="Goal name"
                            onChange={(e) => update((d) => { d.goals[gi].name = e.target.value; return d; })}
                            className={`${input} flex-1`}
                          />
                          <select
                            value={g.branchId}
                            aria-label="Goal's branch"
                            onChange={(e) => update((d) => {
                              if (d.goals.filter((x) => x.branchId === e.target.value).length >= MAX_GOALS_PER_BRANCH) return d;
                              d.goals[gi].branchId = e.target.value;
                              return d;
                            })}
                            className={`${input} w-28 sm:w-36 text-xs`}
                          >
                            {draft.branches.map((ob) => (
                              <option key={ob.id} value={ob.id}>{ob.name || 'Unnamed'}</option>
                            ))}
                          </select>
                          <button
                            className={`${iconBtn} hover:!text-red-600`}
                            onClick={() => update((d) => { d.goals.splice(gi, 1); return d; })}
                            aria-label={`Remove goal ${g.name}`}
                          >
                            ×
                          </button>
                        </div>
                        <input
                          value={g.description ?? ''}
                          maxLength={160}
                          placeholder="Optional: what counts? e.g. cooking any meal for myself"
                          aria-label="What counts toward this goal"
                          onChange={(e) => update((d) => { d.goals[gi].description = e.target.value; return d; })}
                          className={`${input} ml-5 text-xs`}
                        />
                      </div>
                    );
                  })}
                  <button
                    onClick={() => addGoal(b.id)}
                    disabled={goals.length >= MAX_GOALS_PER_BRANCH}
                    className="text-xs font-semibold text-green-700 dark:text-green-400 hover:underline disabled:text-gray-400 disabled:no-underline"
                  >
                    {goals.length >= MAX_GOALS_PER_BRANCH ? `${MAX_GOALS_PER_BRANCH} goals max` : '+ Add goal'}
                  </button>
                </div>
              </div>
            );
          })}

          <button
            onClick={addBranch}
            disabled={draft.branches.length >= MAX_BRANCHES}
            className="w-full py-2 text-sm font-semibold rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
          >
            {draft.branches.length >= MAX_BRANCHES ? `${MAX_BRANCHES} branches max` : '+ Add branch'}
          </button>

          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/60 text-xs text-gray-500 dark:text-gray-400">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: OTHER_COLORS.bg }} />
            <span><span className="font-semibold text-gray-700 dark:text-gray-200">{GARDEN_OTHER}</span> catches anything that doesn't fit. It's always the last branch.</span>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800">
          {error && <p className="text-xs text-red-600 dark:text-red-400 mb-2">{error}</p>}
          {confirming && !error && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
              {summary.removedBranches.length > 0 && (
                <>Removing {summary.removedBranches.map((b) => `"${b.name}"`).join(', ')} moves {summary.movedToOther} {summary.movedToOther === 1 ? 'entry' : 'entries'} to Other. </>
              )}
              {summary.removedGoals.length > 0 && (
                <>Removed goals keep their entries, as ordinary sub-categories. </>
              )}
              Tap Save again to confirm.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
              Cancel
            </button>
            <button onClick={save} className="px-4 py-1.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg">
              {confirming ? 'Save anyway' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
