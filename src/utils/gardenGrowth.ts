import { GARDEN_DOMAINS, type GardenDomain, type GardenEntry } from '../types';

// Each branch passes through these stages as its year count grows. The
// thresholds are spaced so there is always a reachable next stage: the
// first leaf is one log away, sturdy a few more, and the later stages
// reward sustained attention to a domain.
export interface GrowthStage {
  at: number;
  name: string;
  emoji: string;
  phrase: string; // completes "<Domain> …" in the celebration toast
}

export const GROWTH_STAGES: GrowthStage[] = [
  { at: 1, name: 'Sprouted', emoji: '🌱', phrase: 'sprouted its first leaf' },
  { at: 5, name: 'Sturdy', emoji: '🌿', phrase: 'grew sturdy' },
  { at: 15, name: 'Blossoming', emoji: '🌸', phrase: 'is blossoming' },
  { at: 40, name: 'Fruiting', emoji: '🍎', phrase: 'bore fruit' },
];

export function stageFor(count: number): GrowthStage | null {
  let current: GrowthStage | null = null;
  for (const s of GROWTH_STAGES) if (count >= s.at) current = s;
  return current;
}

export function nextStage(count: number): GrowthStage | null {
  return GROWTH_STAGES.find((s) => count < s.at) ?? null;
}

/** The stage reached by going from `before` to `after`, if one was crossed. */
export function crossedStage(before: number, after: number): GrowthStage | null {
  let crossed: GrowthStage | null = null;
  for (const s of GROWTH_STAGES) if (before < s.at && after >= s.at) crossed = s;
  return crossed;
}

/** Year-to-date count for one domain — the same scope the tree draws. */
export function yearCountFor(entries: GardenEntry[], domain: string, year = new Date().getFullYear()): number {
  let n = 0;
  for (const e of entries) {
    if (e.category?.primary === domain && new Date(e.createdAt).getFullYear() === year) n++;
  }
  return n;
}

// "Other" is overflow, not a life domain, so it is never the thirsty branch.
export const NUDGE_DOMAINS = GARDEN_DOMAINS.filter((d) => d !== 'Other') as GardenDomain[];

/**
 * The domain that has had the least attention: fewest logs in the last
 * seven days, then fewest this year, then the tree's left-to-right order.
 */
export function thirstiestDomain(entries: GardenEntry[], now = Date.now()): { domain: GardenDomain; weekCount: number } {
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const year = new Date(now).getFullYear();
  const week = new Map<string, number>();
  const ytd = new Map<string, number>();
  for (const e of entries) {
    const p = e.category?.primary;
    if (!p) continue;
    const t = new Date(e.createdAt).getTime();
    if (t >= weekAgo) week.set(p, (week.get(p) || 0) + 1);
    if (new Date(t).getFullYear() === year) ytd.set(p, (ytd.get(p) || 0) + 1);
  }
  let best = NUDGE_DOMAINS[0];
  for (const d of NUDGE_DOMAINS) {
    const dw = week.get(d) || 0;
    const bw = week.get(best) || 0;
    if (dw < bw || (dw === bw && (ytd.get(d) || 0) < (ytd.get(best) || 0))) best = d;
  }
  return { domain: best, weekCount: week.get(best) || 0 };
}

/** Monday of the current local week, as YYYY-MM-DD. Nudges refresh weekly. */
export function weekKey(d = new Date()): string {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Used when the AI can't be reached, so the nudge still offers something
// concrete instead of an error.
export const FALLBACK_ACTIONS: Record<GardenDomain, { action: string; sub: string }[]> = {
  'Health': [
    { action: 'Drink a full glass of water', sub: 'Hydration' },
    { action: 'Stand up and stretch for two minutes', sub: 'Movement' },
  ],
  'Career Exploration': [
    { action: 'Skim one job posting in a field you are curious about', sub: 'Exploring Roles' },
    { action: 'Write down one skill you would like to build', sub: 'Skill Building' },
  ],
  'School': [
    { action: 'Do five flashcards right now', sub: 'Anki' },
    { action: 'Skim the outline of your next lecture', sub: 'Lectures' },
  ],
  'Relationships': [
    { action: 'Text someone you have not talked to this week', sub: 'Checking In' },
    { action: 'Send a thank-you message to someone who helped you', sub: 'Gratitude' },
  ],
  'Emotional Maturity': [
    { action: 'Name the feeling you are having right now, in one word', sub: 'Self-Awareness' },
    { action: 'Take three slow breaths before your next task', sub: 'Regulation' },
  ],
  'Environment & Lifestyle': [
    { action: 'Clear one surface near you', sub: 'Tidying' },
    { action: 'Open a window or step outside for two minutes', sub: 'Fresh Air' },
  ],
  'Purpose & Meaning': [
    { action: 'Write one sentence about why you chose your path', sub: 'Reflection' },
    { action: 'Note one thing today that felt meaningful', sub: 'Gratitude' },
  ],
  'Other': [
    { action: 'Do one small kind thing for yourself', sub: 'Self-Care' },
  ],
};
