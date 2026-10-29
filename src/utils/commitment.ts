import type { TaskBlock, CommitmentOutcome } from '../types';

// Telling a decision from a hope.
//
// Every block on the grid currently looks the same whether you would bet
// money on it or you are kidding yourself. That is the gap this closes: a
// locked block is one you have decided on, and deciding means naming the
// alternative you are declining rather than leaving it quietly available.
//
// The reason to record what happened afterwards is that "can I trust
// myself?" is an empirical question. Introspection answers it badly; a
// count of kept-versus-missed answers it well.

/** Locking is only worth anything while it stays scarce. */
export const SUGGESTED_LOCKS = 3;

export function isLocked(block: TaskBlock): boolean {
  return !!block.commitment?.locked;
}

/** A locked block is only finished when it has been answered for. */
export function awaitingReview(block: TaskBlock, todayKey: string): boolean {
  return block.date < todayKey && !block.commitment?.outcome;
}

/**
 * Yesterday's blocks, still unanswered.
 *
 * Both locked and unlocked ones, because the whole point is the comparison:
 * a kept-rate for locked blocks means nothing without the rate for the ones
 * you only hoped for.
 */
export function pendingReview(blocks: TaskBlock[], todayKey: string): TaskBlock[] {
  const cutoff = shiftKey(todayKey, -14);
  return blocks
    .filter((b) => b.date >= cutoff && awaitingReview(b, todayKey))
    .sort((a, b) => (a.date === b.date ? a.mainTime.localeCompare(b.mainTime) : a.date.localeCompare(b.date)));
}

/** Blocks on a day that have not been decided on yet. */
export function lockCandidates(blocks: TaskBlock[], dateKey: string): TaskBlock[] {
  return blocks
    .filter((b) => b.date === dateKey && !isLocked(b))
    .sort((a, b) => a.mainTime.localeCompare(b.mainTime));
}

/**
 * Whether to ask for decisions about a day at all.
 *
 * Self-extinguishing on purpose. A prompt that appears every single day
 * regardless of what you did becomes furniture, and furniture gets looked
 * past. Once the day has its handful of decisions the question stops being
 * asked — which also enforces the scarcity that makes locking mean
 * anything.
 */
export function shouldPromptLocks(blocks: TaskBlock[], dateKey: string): boolean {
  const onDay = blocks.filter((b) => b.date === dateKey);
  if (onDay.length === 0) return false;
  const locked = onDay.filter(isLocked).length;
  if (locked >= SUGGESTED_LOCKS) return false;
  return onDay.length > locked;
}

export interface FollowThrough {
  locked: { kept: number; partly: number; missed: number; total: number; rate: number | null };
  penciled: { kept: number; partly: number; missed: number; total: number; rate: number | null };
  /** True once there is enough on both sides to mean anything. */
  comparable: boolean;
}

const EMPTY = { kept: 0, partly: 0, missed: 0, total: 0, rate: null as number | null };

/**
 * How often a decision actually held, against how often a hope did.
 *
 * `partly` counts as half rather than being dropped, because a sitting you
 * started and cut short is not the same as one you never opened, and
 * treating it as a clean miss would make the number useless for the thing
 * it exists to tell you.
 */
export function followThrough(blocks: TaskBlock[]): FollowThrough {
  const tally = (list: TaskBlock[]) => {
    const kept = list.filter((b) => b.commitment?.outcome === 'kept').length;
    const partly = list.filter((b) => b.commitment?.outcome === 'partly').length;
    const missed = list.filter((b) => b.commitment?.outcome === 'missed').length;
    const total = kept + partly + missed;
    return { kept, partly, missed, total, rate: total === 0 ? null : (kept + partly * 0.5) / total };
  };

  const reviewed = blocks.filter((b) => !!b.commitment?.outcome);
  const locked = reviewed.length ? tally(reviewed.filter(isLocked)) : { ...EMPTY };
  const penciled = reviewed.length ? tally(reviewed.filter((b) => !isLocked(b))) : { ...EMPTY };

  return { locked, penciled, comparable: locked.total >= 3 && penciled.total >= 3 };
}

/**
 * What the numbers mean, in a sentence, or nothing.
 *
 * Deliberately silent until there is something to say. A follow-through
 * rate computed from two blocks is noise, and dressing noise up as insight
 * is how a tool stops being believed.
 */
export function trustReading(ft: FollowThrough): string | null {
  if (!ft.comparable) return null;
  const l = Math.round((ft.locked.rate ?? 0) * 100);
  const p = Math.round((ft.penciled.rate ?? 0) * 100);
  const gap = l - p;
  if (gap >= 25) {
    return `Locked ${l}%, penciled ${p}%. Your "definitely" means something — when you lock it, it happens.`;
  }
  if (gap <= 5) {
    return `Locked ${l}%, penciled ${p}%. Locking is not yet changing the outcome — it may be worth locking fewer things, and meaning them.`;
  }
  return `Locked ${l}%, penciled ${p}%. A real difference, not yet a large one.`;
}

export function describeOutcome(outcome: CommitmentOutcome): string {
  if (outcome === 'kept') return 'Did it';
  if (outcome === 'partly') return 'Partly';
  return 'Did not';
}

/** Date-key arithmetic that stays on local days. */
export function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
