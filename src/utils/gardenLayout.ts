import {
  DEFAULT_GARDEN_BRANCHES,
  GARDEN_OTHER,
  type GardenBranch,
  type GardenCategory,
  type GardenEntry,
  type GardenGoal,
  type GardenLayout,
} from '../types';
import { OTHER_COLORS, PALETTE, PALETTE_ORDER, type BranchColors } from './gardenColors';

export const MAX_BRANCHES = 9; // plus Other — more than ten crowds the label ring
export const MAX_GOALS_PER_BRANCH = 4;
export const MAX_NAME_LEN = 40;
export const MAX_CORRECTIONS = 25;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function defaultLayout(): GardenLayout {
  return {
    branches: DEFAULT_GARDEN_BRANCHES.map((name, i) => ({
      id: slug(name),
      name,
      color: PALETTE_ORDER[i],
    })),
    goals: [],
    corrections: [],
  };
}

/** Branch names in tree order, with Other last. */
export function branchNames(layout: GardenLayout): string[] {
  return [...layout.branches.map((b) => b.name), GARDEN_OTHER];
}

export function isBranchName(layout: GardenLayout, name: string): boolean {
  return name === GARDEN_OTHER || layout.branches.some((b) => b.name === name);
}

export function goalsIn(layout: GardenLayout, branchName: string): GardenGoal[] {
  const branch = layout.branches.find((b) => b.name === branchName);
  return branch ? layout.goals.filter((g) => g.branchId === branch.id) : [];
}

export function branchOfGoal(layout: GardenLayout, goal: GardenGoal): GardenBranch | undefined {
  return layout.branches.find((b) => b.id === goal.branchId);
}

export function paletteFor(layout: GardenLayout): Map<string, BranchColors> {
  const m = new Map<string, BranchColors>();
  for (const b of layout.branches) m.set(b.name, PALETTE[b.color] ?? OTHER_COLORS);
  m.set(GARDEN_OTHER, OTHER_COLORS);
  return m;
}

export function nextColor(layout: GardenLayout): string {
  const used = new Set(layout.branches.map((b) => b.color));
  return PALETTE_ORDER.find((c) => !used.has(c)) ?? PALETTE_ORDER[layout.branches.length % PALETTE_ORDER.length];
}

/** Split a branch name over at most two lines for the label ring. */
export function labelLines(name: string): string[] {
  if (name.length <= 13) return [name];
  const words = name.split(' ');
  let best: string[] = [name];
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = [a, b];
    }
  }
  return best;
}

/** Returns an error message for an invalid layout, or null if it's fine. */
export function validateLayout(layout: GardenLayout): string | null {
  const seen = new Set<string>([GARDEN_OTHER.toLowerCase()]);
  for (const b of layout.branches) {
    const n = b.name.trim();
    if (!n) return 'Every branch needs a name.';
    if (n.length > MAX_NAME_LEN) return `"${n.slice(0, 20)}…" is too long (max ${MAX_NAME_LEN} characters).`;
    if (seen.has(n.toLowerCase())) return `There are two branches called "${n}".`;
    seen.add(n.toLowerCase());
  }
  if (layout.branches.length > MAX_BRANCHES) return `At most ${MAX_BRANCHES} branches (plus Other).`;
  const goalNames = new Set<string>();
  for (const g of layout.goals) {
    const n = g.name.trim();
    if (!n) return 'Every goal needs a name.';
    if (n.length > MAX_NAME_LEN) return `"${n.slice(0, 20)}…" is too long (max ${MAX_NAME_LEN} characters).`;
    if (goalNames.has(n.toLowerCase())) return `There are two goals called "${n}".`;
    goalNames.add(n.toLowerCase());
    if (!layout.branches.some((b) => b.id === g.branchId)) return `Goal "${n}" isn't in a branch.`;
  }
  for (const b of layout.branches) {
    if (layout.goals.filter((g) => g.branchId === b.id).length > MAX_GOALS_PER_BRANCH) {
      return `At most ${MAX_GOALS_PER_BRANCH} goals per branch ("${b.name}" has more).`;
    }
  }
  return null;
}

export function normalizeLayout(layout: GardenLayout): GardenLayout {
  return {
    ...layout,
    branches: layout.branches.map((b) => ({ ...b, name: b.name.trim() })),
    goals: layout.goals.map((g) => ({
      ...g,
      name: g.name.trim(),
      description: g.description?.trim() || undefined,
    })),
  };
}

/**
 * Rewrite entries so they follow a layout edit. Entries store branch and goal
 * names, so a rename has to be carried into them; a removed branch's entries
 * move to Other, and a removed goal's entries keep its name as an ordinary
 * sub-category, so no log is ever lost.
 */
export function applyLayoutToEntries(prev: GardenLayout, next: GardenLayout, entries: GardenEntry[]): GardenEntry[] {
  const prevBranchById = new Map(prev.branches.map((b) => [b.id, b]));
  const nextBranchById = new Map(next.branches.map((b) => [b.id, b]));
  const prevBranchName = new Map(prev.branches.map((b) => [b.name, b.id]));
  const nextGoalById = new Map(next.goals.map((g) => [g.id, g]));

  return entries.map((e) => {
    if (!e.category) return e;
    let cat: GardenCategory = { ...e.category };

    if (cat.goalId) {
      const goal = nextGoalById.get(cat.goalId);
      if (goal) {
        const branch = nextBranchById.get(goal.branchId);
        cat = { primary: branch ? branch.name : GARDEN_OTHER, sub: goal.name, goalId: goal.id };
        return { ...e, category: cat };
      }
      // Goal deleted: keep its name as a plain sub-category.
      cat = { primary: cat.primary, ...(cat.sub ? { sub: cat.sub } : {}) };
    }

    const branchId = prevBranchName.get(cat.primary);
    if (branchId && prevBranchById.has(branchId)) {
      const renamed = nextBranchById.get(branchId);
      cat = { ...cat, primary: renamed ? renamed.name : GARDEN_OTHER };
    }
    return { ...e, category: cat };
  });
}

/** Counts for the confirmation shown before saving a layout that removes things. */
export function removalSummary(prev: GardenLayout, next: GardenLayout, entries: GardenEntry[]) {
  const keptBranches = new Set(next.branches.map((b) => b.id));
  const keptGoals = new Set(next.goals.map((g) => g.id));
  const removedBranches = prev.branches.filter((b) => !keptBranches.has(b.id));
  const removedGoals = prev.goals.filter((g) => !keptGoals.has(g.id));
  const removedNames = new Set(removedBranches.map((b) => b.name));
  const movedToOther = entries.filter((e) => e.category && removedNames.has(e.category.primary) && !(e.category.goalId && keptGoals.has(e.category.goalId))).length;
  return { removedBranches, removedGoals, movedToOther };
}

export function newBranch(layout: GardenLayout, name: string): GardenBranch {
  return { id: `b-${Date.now().toString(36)}`, name, color: nextColor(layout) };
}
