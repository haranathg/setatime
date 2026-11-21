import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { GardenEntry, GardenCategory, GardenLayout, GardenCorrection } from '../types';
import {
  crossedStage,
  yearCountFor,
  thirstiestDomain,
  weekKey,
  dayKey,
  fallbackActionsFor,
  type GrowthStage,
} from '../utils/gardenGrowth';
import {
  defaultLayout,
  isBranchName,
  goalsIn,
  branchOfGoal,
  paletteFor,
  validateLayout,
  normalizeLayout,
  applyLayoutToEntries,
  MAX_CORRECTIONS,
} from '../utils/gardenLayout';
import { getSecretKey, getAuthHashAsync, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

const AI_API_URL = import.meta.env.VITE_AI_API_URL || '/api/ai-breakdown';

// Aggregate of which sub-categories live under each branch so the AI can
// prefer an existing sub when one fits. Entries whose primary isn't a branch
// (legacy free-form values) are skipped; the migration below re-sorts them.
// Goal entries are skipped too — goals are sent to the AI separately.
type CategorySummary = { primary: string; subs: string[] };
function summarizeCategories(entries: GardenEntry[], layout: GardenLayout): CategorySummary[] {
  const map = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!e.category?.primary || e.category.goalId) continue;
    if (!isBranchName(layout, e.category.primary)) continue;
    const key = e.category.primary;
    if (!map.has(key)) map.set(key, new Set());
    if (e.category.sub) map.get(key)!.add(e.category.sub);
  }
  return Array.from(map.entries()).map(([primary, subs]) => ({
    primary,
    subs: Array.from(subs),
  }));
}

export function useGarden() {
  const [entries, setEntries] = useState<GardenEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref mirror so the async categorizer always sees the latest list when
  // computing existingCategories; avoids a race where multiple logs in
  // quick succession all send an empty category list.
  const entriesRef = useRef<GardenEntry[]>([]);
  useEffect(() => { entriesRef.current = entries; }, [entries]);

  // The user's branches and goals. Defaults until they first arrange.
  const [layout, setLayout] = useState<GardenLayout>(defaultLayout);
  const layoutRef = useRef<GardenLayout>(layout);
  useEffect(() => { layoutRef.current = layout; }, [layout]);
  // True once the cloud copy has been merged (or there is none). Anything
  // that judges entries against the layout waits for this, so a new device
  // doesn't mistake another device's custom branches for legacy data.
  const [cloudChecked, setCloudChecked] = useState(false);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setEntries(local.garden?.entries || []);
      if (local.garden?.layout) setLayout(local.garden.layout);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.garden?.entries) {
            const merged = new Map<string, GardenEntry>();
            for (const e of cloud.garden.entries) merged.set(e.id, e);
            for (const e of local.garden?.entries || []) {
              if (!merged.has(e.id)) merged.set(e.id, e);
            }
            setEntries(Array.from(merged.values()));
          }
          // Layout is one document, not a list to merge: cloud wins.
          if (cloud.garden?.layout) setLayout(cloud.garden.layout);
        } catch {
          // sync errors handled elsewhere
        }
      }
      setCloudChecked(true);
    };
    init();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const state = loadState();
    const updated = { ...state, garden: { entries, layout } };
    saveState(updated);

    const key = getSecretKey();
    if (key) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          await syncSave(key, updated);
        } catch {
          // handled elsewhere
        }
      }, 1500);
    }
  }, [entries, layout, loaded]);

  // The most recent growth stage a goal or branch reached, for the
  // celebration toast. Counted over the current year, the same scope the
  // tree draws. A goal crossing a stage is announced ahead of its branch.
  const [milestone, setMilestone] = useState<GardenMilestone | null>(null);
  const announceGrowth = useCallback((id: string, category: GardenCategory) => {
    const others = entriesRef.current.filter((e) => e.id !== id);
    const year = new Date().getFullYear();
    if (category.goalId) {
      const goal = layoutRef.current.goals.find((g) => g.id === category.goalId);
      const before = others.filter(
        (e) => e.category?.goalId === category.goalId && new Date(e.createdAt).getFullYear() === year,
      ).length;
      const stage = crossedStage(before, before + 1);
      if (goal && stage) {
        setMilestone({ name: goal.name, branch: category.primary, isGoal: true, stage, at: Date.now() });
        return;
      }
    }
    if (!isBranchName(layoutRef.current, category.primary)) return;
    const before = yearCountFor(others, category.primary);
    const stage = crossedStage(before, before + 1);
    if (stage) setMilestone({ name: category.primary, branch: category.primary, isGoal: false, stage, at: Date.now() });
  }, []);
  const dismissMilestone = useCallback(() => setMilestone(null), []);

  // Kick off AI categorization for an entry. On success, set the category;
  // on failure, mark the entry and capture the server's error message so
  // the UI can show it. Non-blocking.
  const categorize = useCallback(async (id: string, text: string, announce = true) => {
    try {
      const authHash = await getAuthHashAsync();
      const lay = layoutRef.current;
      const existingCategories = summarizeCategories(entriesRef.current, lay);
      const response = await fetch(AI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'categorize-action',
          text,
          existingCategories,
          branches: lay.branches.map((b) => b.name),
          goals: lay.goals.map((g) => ({
            id: g.id,
            name: g.name,
            description: g.description,
            branch: branchOfGoal(lay, g)?.name,
          })),
          examples: (lay.corrections || []).slice(-15).map((c) => ({
            text: c.text,
            primary: c.primary,
            sub: c.sub,
          })),
          authHash,
        }),
      });
      if (!response.ok) {
        const raw = await response.text().catch(() => '');
        let errMsg = raw;
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.error === 'string') errMsg = parsed.error;
        } catch {
          // non-JSON body; keep the raw text
        }
        throw new Error(`HTTP ${response.status}: ${(errMsg || 'AI call failed').slice(0, 400)}`);
      }
      const data = await response.json();
      if (!data.primary) throw new Error('No primary category returned');
      let category: GardenCategory = { primary: data.primary };
      if (data.sub) category.sub = data.sub;
      // Trust a goal id only if it's still in the layout, and file the entry
      // under the goal's own branch and name whatever the AI said.
      const goal = typeof data.goalId === 'string'
        ? layoutRef.current.goals.find((g) => g.id === data.goalId)
        : undefined;
      if (goal) {
        const branch = branchOfGoal(layoutRef.current, goal);
        if (branch) category = { primary: branch.name, sub: goal.name, goalId: goal.id };
      }
      if (announce) announceGrowth(id, category);
      setEntries((prev) => prev.map((e) => (
        e.id === id
          ? { ...e, category, categorizationFailed: false, categorizationError: undefined }
          : e
      )));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Categorization failed';
      setEntries((prev) => prev.map((e) => (
        e.id === id
          ? { ...e, categorizationFailed: true, categorizationError: message }
          : e
      )));
    }
  }, [announceGrowth]);

  // `preset` skips the AI call when the category is already known — the
  // thirsty-branch nudge logs straight onto its branch.
  const addEntry = useCallback((text: string, preset?: GardenCategory): GardenEntry | null => {
    const clean = text.trim();
    if (!clean) return null;
    const entry: GardenEntry = {
      id: uuidv4(),
      text: clean,
      createdAt: new Date().toISOString(),
      ...(preset ? { category: preset } : {}),
    };
    if (preset) announceGrowth(entry.id, preset);
    setEntries((prev) => [entry, ...prev]);
    // Kick off categorization in the background. Entry stays visible
    // as "pending" until the AI responds.
    if (!preset) void categorize(entry.id, clean);
    return entry;
  }, [categorize, announceGrowth]);

  const retryCategorize = useCallback((id: string) => {
    const entry = entriesRef.current.find((e) => e.id === id);
    if (!entry) return;
    // Mark as pending again
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, categorizationFailed: false, category: undefined } : e)));
    void categorize(id, entry.text);
  }, [categorize]);

  // One-shot legacy migration: pre-taxonomy entries have free-form
  // primaries like "Movement" or "Dental". Re-categorize them under the
  // fixed seven-domain taxonomy so they land on the tree. Runs once per
  // mount, serialized to avoid hammering the Lambda, and skips entries
  // whose last attempt failed (the retry button handles those) or whose
  // category is still being computed from the original log. Reads the
  // entries ref rather than depending on `entries` so a mid-migration
  // state update doesn't re-fire the effect and cancel its own loop.
  const migrationRan = useRef(false);
  useEffect(() => {
    if (!loaded || !cloudChecked || migrationRan.current) return;
    migrationRan.current = true;
    const legacy = entriesRef.current.filter(
      (e) =>
        e.category &&
        e.category.primary &&
        !isBranchName(layoutRef.current, e.category.primary) &&
        !e.categorizationFailed,
    );
    if (legacy.length === 0) return;
    (async () => {
      for (const e of legacy) {
        // Clear the old category first so the UI shows "categorizing…"
        // while the AI re-decides, then run categorize() fresh.
        setEntries((prev) =>
          prev.map((row) =>
            row.id === e.id
              ? { ...row, category: undefined, categorizationFailed: false, categorizationError: undefined }
              : row,
          ),
        );
        await categorize(e.id, e.text, false);
      }
    })();
  }, [loaded, cloudChecked, categorize]);

  const deleteEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // Set / change a category manually. Also allows clearing by passing
  // undefined — useful if the AI miscategorizes and the user wants to
  // let it redo.
  const setCategory = useCallback((id: string, category: GardenCategory | undefined) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, category, categorizationFailed: false } : e)));
  }, []);

  // The user moving an entry by hand. Besides updating the entry, this
  // records the correction so future AI calls see how this user sorts.
  const recategorizeEntry = useCallback((id: string, category: GardenCategory) => {
    const entry = entriesRef.current.find((e) => e.id === id);
    if (!entry) return;
    announceGrowth(id, category);
    setEntries((prev) => prev.map((e) => (
      e.id === id ? { ...e, category, categorizationFailed: false, categorizationError: undefined } : e
    )));
    const correction: GardenCorrection = {
      text: entry.text,
      primary: category.primary,
      ...(category.sub ? { sub: category.sub } : {}),
      ...(category.goalId ? { goalId: category.goalId } : {}),
      at: new Date().toISOString(),
    };
    setLayout((prev) => ({
      ...prev,
      corrections: [...(prev.corrections || []).filter((c) => c.text !== entry.text), correction].slice(-MAX_CORRECTIONS),
    }));
  }, [announceGrowth]);

  // Save an edited layout from the Arrange editor. Renames and removals are
  // carried into existing entries in the same step so nothing is orphaned.
  // Returns an error message if the layout is invalid, otherwise null.
  const saveLayout = useCallback((draft: GardenLayout): string | null => {
    const next = normalizeLayout(draft);
    const error = validateLayout(next);
    if (error) return error;
    const prev = layoutRef.current;
    setEntries((rows) => applyLayoutToEntries(prev, next, rows));
    setLayout({ ...next, corrections: prev.corrections });
    return null;
  }, []);

  const palette = useMemo(() => paletteFor(layout), [layout]);

  // Year-to-date count per goal, for the tree's goal branches and the list.
  const goalCounts = useMemo(() => {
    const year = new Date().getFullYear();
    const m = new Map<string, number>();
    for (const e of entries) {
      const gid = e.category?.goalId;
      if (gid && new Date(e.createdAt).getFullYear() === year) m.set(gid, (m.get(gid) || 0) + 1);
    }
    return m;
  }, [entries]);

  // ---------- Derived memos ----------

  // Today's entries (local day).
  const todaysEntries = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    return entries.filter((e) => {
      const ed = new Date(e.createdAt);
      return ed.getFullYear() === y && ed.getMonth() === m && ed.getDate() === d;
    });
  }, [entries]);

  // Category counts for the current year (what the user is building this
  // "year of"). Primary category → { total, subs: Map<sub, count> }.
  const yearCategoryCounts = useMemo(() => {
    const year = new Date().getFullYear();
    const counts = new Map<string, { total: number; subs: Map<string, number> }>();
    for (const e of entries) {
      if (new Date(e.createdAt).getFullYear() !== year) continue;
      if (!e.category?.primary) continue;
      if (!counts.has(e.category.primary)) {
        counts.set(e.category.primary, { total: 0, subs: new Map() });
      }
      const bucket = counts.get(e.category.primary)!;
      bucket.total++;
      if (e.category.sub) {
        bucket.subs.set(e.category.sub, (bucket.subs.get(e.category.sub) || 0) + 1);
      }
    }
    return counts;
  }, [entries]);

  const yearTotal = useMemo(() => {
    const year = new Date().getFullYear();
    return entries.filter((e) => new Date(e.createdAt).getFullYear() === year).length;
  }, [entries]);

  // Current streak: consecutive local days ending today with ≥1 entry.
  const streak = useMemo(() => {
    if (entries.length === 0) return 0;
    // Build a Set of YYYY-MM-DD strings
    const days = new Set<string>();
    for (const e of entries) {
      const d = new Date(e.createdAt);
      const y = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      const dd = d.getDate().toString().padStart(2, '0');
      days.add(`${y}-${m}-${dd}`);
    }
    const key = (d: Date) => {
      const y = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      const dd = d.getDate().toString().padStart(2, '0');
      return `${y}-${m}-${dd}`;
    };
    let count = 0;
    const cursor = new Date();
    // If today has no entry yet, the streak is yesterday's run (don't
    // penalize until the day ends).
    if (!days.has(key(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (days.has(key(cursor))) {
      count++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }, [entries]);

  // Per-day counts for the current year — for the calendar heatmap.
  // Returns a Map keyed by YYYY-MM-DD.
  const yearDayCounts = useMemo(() => {
    const year = new Date().getFullYear();
    const map = new Map<string, number>();
    for (const e of entries) {
      const d = new Date(e.createdAt);
      if (d.getFullYear() !== year) continue;
      const y = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      const dd = d.getDate().toString().padStart(2, '0');
      const key = `${y}-${m}-${dd}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [entries]);

  // ---------- Thirsty-branch nudge ----------
  //
  // Once a week (or when another domain becomes the least-tended one), ask
  // the AI for a two-minute action in the domain with the fewest recent logs.
  // Stored per device: it is a prompt, not data, so it doesn't need to sync.
  const thirsty = useMemo(
    () => thirstiestDomain(entries, layout.branches.map((b) => b.name)),
    [entries, layout.branches],
  );
  const [nudge, setNudge] = useState<GardenNudge | null>(readNudge);
  const [nudgeLoading, setNudgeLoading] = useState(false);
  const nudgeInflight = useRef(false);

  useEffect(() => {
    try {
      if (nudge) localStorage.setItem(NUDGE_STORAGE, JSON.stringify(nudge));
    } catch {
      // storage unavailable — the nudge just regenerates next visit
    }
  }, [nudge]);

  const fetchNudge = useCallback(async (domain: string, avoid: string[]) => {
    if (nudgeInflight.current) return;
    nudgeInflight.current = true;
    setNudgeLoading(true);
    const inDomain = entriesRef.current
      .filter((e) => e.category?.primary === domain)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const subs = Array.from(new Set(inDomain.map((e) => e.category?.sub).filter((s): s is string => !!s)));
    const recent = inDomain.slice(0, 8).map((e) => e.text);
    const goals = goalsIn(layoutRef.current, domain);
    let next: Pick<GardenNudge, 'action' | 'sub' | 'source' | 'goalId'>;
    try {
      const authHash = await getAuthHashAsync();
      const response = await fetch(AI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'suggest-micro-action',
          domain,
          subs,
          recent,
          avoid,
          goals: goals.map((g) => ({ id: g.id, name: g.name, description: g.description })),
          authHash,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (typeof data.action !== 'string' || !data.action) throw new Error('No action returned');
      const goal = goals.find((g) => g.id === data.goalId);
      next = {
        action: data.action,
        sub: goal ? goal.name : typeof data.sub === 'string' ? data.sub : undefined,
        ...(goal ? { goalId: goal.id } : {}),
        source: 'ai',
      };
    } catch {
      const options = fallbackActionsFor(domain);
      const pick = options.find((o) => !avoid.includes(o.action)) ?? options[0];
      next = { ...pick, source: 'fallback' };
    }
    setNudge({ domain, week: weekKey(), history: [...avoid, next.action].slice(-6), ...next });
    nudgeInflight.current = false;
    setNudgeLoading(false);
  }, []);

  const thirstyDomain = thirsty?.domain ?? null;
  useEffect(() => {
    if (!loaded || !cloudChecked || !thirstyDomain) return;
    const wk = weekKey();
    const doneToday = nudge?.doneDay === dayKey();
    const gone = nudge ? !isBranchName(layout, nudge.domain) : false;
    const stale = !nudge || gone || nudge.week !== wk || (nudge.domain !== thirstyDomain && !doneToday);
    if (!stale) return;
    // Let the legacy migration settle before deciding which branch is
    // thirstiest, so a load doesn't trigger two AI calls.
    const t = setTimeout(() => {
      const sameThread = nudge && nudge.week === wk && nudge.domain === thirstyDomain;
      void fetchNudge(thirstyDomain, sameThread ? nudge.history : []);
    }, 1500);
    return () => clearTimeout(t);
  }, [loaded, cloudChecked, thirstyDomain, nudge, layout, fetchNudge]);

  const refreshNudge = useCallback(() => {
    if (!thirstyDomain) return;
    const sameThread = nudge && nudge.domain === thirstyDomain;
    void fetchNudge(thirstyDomain, sameThread ? nudge.history : []);
  }, [nudge, thirstyDomain, fetchNudge]);

  const completeNudge = useCallback(() => {
    if (!nudge) return;
    const goal = nudge.goalId ? layoutRef.current.goals.find((g) => g.id === nudge.goalId) : undefined;
    const branch = goal ? branchOfGoal(layoutRef.current, goal) : undefined;
    addEntry(
      nudge.action,
      goal && branch
        ? { primary: branch.name, sub: goal.name, goalId: goal.id }
        : { primary: nudge.domain, ...(nudge.sub ? { sub: nudge.sub } : {}) },
    );
    setNudge({ ...nudge, doneDay: dayKey() });
  }, [nudge, addEntry]);

  return {
    entries,
    todaysEntries,
    yearCategoryCounts,
    yearTotal,
    yearDayCounts,
    streak,
    loaded,
    addEntry,
    retryCategorize,
    setCategory,
    recategorizeEntry,
    deleteEntry,
    layout,
    saveLayout,
    palette,
    goalCounts,
    milestone,
    dismissMilestone,
    nudge: nudge && nudge.week === weekKey() && isBranchName(layout, nudge.domain) ? nudge : null,
    nudgeLoading,
    nudgeWeekCount: thirsty?.weekCount ?? 0,
    refreshNudge,
    completeNudge,
  };
}

export interface GardenMilestone {
  name: string;            // the goal's or branch's name
  branch: string;          // branch name, for color
  isGoal: boolean;
  stage: GrowthStage;
  at: number;
}

export interface GardenNudge {
  domain: string;          // branch name
  week: string;            // weekKey() the suggestion was made for
  action: string;
  sub?: string;
  goalId?: string;         // set when the suggestion advances one of the branch's goals
  source: 'ai' | 'fallback';
  history: string[];       // this week's suggestions, so "another idea" doesn't repeat
  doneDay?: string;        // dayKey() when the user tapped "Did it"
}

const NUDGE_STORAGE = 'setatime.garden.nudge';

function readNudge(): GardenNudge | null {
  try {
    const raw = localStorage.getItem(NUDGE_STORAGE);
    if (!raw) return null;
    const n = JSON.parse(raw);
    return n && typeof n.action === 'string' && typeof n.domain === 'string' ? (n as GardenNudge) : null;
  } catch {
    return null;
  }
}
