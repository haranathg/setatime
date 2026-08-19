import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Project, ProjectKind, ProjectMilestone, ProjectStatus } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';
import { STAR_COLORS } from './useNorthStars';

// Soft cap on concurrently active projects. Not enforced — med school
// hands you more than this whether you like it or not — but the view
// says so when you cross it, because "I am over capacity" is a fact
// worth seeing rather than a feeling worth carrying.
export const SOFT_ACTIVE_PROJECT_CAP = 7;

// A project with no next action and no milestone within reach is
// stalled: nothing about it will happen on its own. This is the single
// most useful signal a projects list can produce, so it gets computed
// centrally rather than in each view.
export const STALLED_AFTER_DAYS = 10;

export const PROJECT_KIND_META: Record<ProjectKind, {
  label: string;
  glyph: string;
  blurb: string;
}> = {
  course:     { label: 'Course',     glyph: '📚', blurb: 'Fixed external calendar — the risk is falling behind' },
  exam:       { label: 'Board prep', glyph: '🎯', blurb: 'Always-on and never urgent — the risk is never starting' },
  research:   { label: 'Research',   glyph: '🔬', blurb: 'Long gaps between steps — the risk is stalling silently' },
  clinical:   { label: 'Clinical',   glyph: '🩺', blurb: 'Scattered obligations — the risk is double-booking' },
  compliance: { label: 'Compliance', glyph: '📋', blurb: 'Hard deadline, small effort — the risk is forgetting' },
  personal:   { label: 'Personal',   glyph: '🏠', blurb: 'Life outside school — the risk is it losing every tiebreak' },
};

export const PROJECT_KINDS = Object.keys(PROJECT_KIND_META) as ProjectKind[];

export interface NewProjectInput {
  name: string;
  kind: ProjectKind;
  outcome?: string;
  nextAction?: string;
  dueDate?: string;
  color?: string;      // defaults to the next unused palette color
  northStarIds?: string[];
}

// Local YYYY-MM-DD — same convention the rest of the app uses so date
// comparisons stay plain string compares.
export function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Whole days from today to a YYYY-MM-DD key. Negative = overdue.
// Parsed as local noon so DST shifts can't push a date across a day.
export function daysUntil(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return Number.POSITIVE_INFINITY;
  const target = new Date(y, m - 1, d, 12, 0, 0, 0);
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86_400_000);
}

export function formatDaysUntil(days: number): string {
  if (!Number.isFinite(days)) return '';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days}d`;
}

// The soonest not-yet-done milestone, plus the project's own due date,
// whichever lands first. This is what "when does this bite?" means.
export function nextDeadline(p: Project): { label: string; dateKey: string; days: number } | null {
  const candidates: { label: string; dateKey: string }[] = [];
  for (const m of p.milestones || []) {
    if (!m.done && m.dueDate) candidates.push({ label: m.label, dateKey: m.dueDate });
  }
  if (p.dueDate) candidates.push({ label: 'Due', dateKey: p.dueDate });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const first = candidates[0];
  return { ...first, days: daysUntil(first.dateKey) };
}

// Stalled = active, no next action written down, and no deadline close
// enough to carry it on its own.
export function isStalled(p: Project): boolean {
  if (p.status !== 'active') return false;
  if (p.nextAction && p.nextAction.trim()) return false;
  const dl = nextDeadline(p);
  if (dl && dl.days <= STALLED_AFTER_DAYS) return false;
  return true;
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setProjects(local.projects?.projects || []);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.projects?.projects) {
            // Union by id, cloud winning on conflict — same merge policy
            // the other slices use.
            const merged = new Map<string, Project>();
            for (const p of cloud.projects.projects) merged.set(p.id, p);
            for (const p of local.projects?.projects || []) {
              if (!merged.has(p.id)) merged.set(p.id, p);
            }
            setProjects(Array.from(merged.values()));
          }
        } catch {
          // sync errors handled elsewhere
        }
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const state = loadState();
    const updated = { ...state, projects: { projects } };
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
  }, [projects, loaded]);

  // Active first, then by urgency (soonest deadline), then by name.
  // Backburner and done sink below without disappearing.
  const sorted = useMemo(() => {
    const rank: Record<ProjectStatus, number> = { active: 0, backburner: 1, done: 2, archived: 3 };
    return [...projects].sort((a, b) => {
      const r = rank[a.status] - rank[b.status];
      if (r !== 0) return r;
      const da = nextDeadline(a);
      const db = nextDeadline(b);
      if (da && db) {
        if (da.days !== db.days) return da.days - db.days;
      } else if (da) return -1;
      else if (db) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [projects]);

  const active = useMemo(() => sorted.filter((p) => p.status === 'active'), [sorted]);
  const visible = useMemo(() => sorted.filter((p) => p.status !== 'archived'), [sorted]);

  // Projects worth a glance on Today: overdue or due within a week,
  // plus anything stalled. Capped by the caller.
  const needsAttention = useMemo(
    () =>
      active.filter((p) => {
        const dl = nextDeadline(p);
        return (dl && dl.days <= 7) || isStalled(p);
      }),
    [active]
  );

  const nextColor = useCallback((): string => {
    const used = new Set(projects.filter((p) => p.status !== 'archived').map((p) => p.color));
    const free = STAR_COLORS.find((c) => !used.has(c.id));
    // Once the palette is exhausted, cycle rather than pile everything
    // on one color.
    return free?.id ?? STAR_COLORS[projects.length % STAR_COLORS.length].id;
  }, [projects]);

  const addProject = useCallback((input: NewProjectInput): Project | null => {
    const name = input.name.trim();
    if (!name) return null;
    const now = new Date().toISOString();
    const project: Project = {
      id: uuidv4(),
      name,
      kind: input.kind,
      status: 'active',
      color: input.color ?? nextColor(),
      outcome: input.outcome?.trim() || undefined,
      nextAction: input.nextAction?.trim() || undefined,
      dueDate: input.dueDate || undefined,
      milestones: [],
      northStarIds: input.northStarIds?.length ? input.northStarIds : undefined,
      createdAt: now,
      updatedAt: now,
    };
    setProjects((prev) => [...prev, project]);
    return project;
  }, [nextColor]);

  const updateProject = useCallback((
    id: string,
    updates: Partial<Pick<Project, 'name' | 'kind' | 'color' | 'nextAction' | 'outcome' | 'dueDate' | 'northStarIds'>>,
  ) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const next: Project = { ...p, updatedAt: new Date().toISOString() };
        if ('name' in updates) next.name = updates.name?.trim() || p.name;
        if ('kind' in updates && updates.kind) next.kind = updates.kind;
        if ('color' in updates && updates.color) next.color = updates.color;
        if ('nextAction' in updates) next.nextAction = updates.nextAction?.trim() || undefined;
        if ('outcome' in updates) next.outcome = updates.outcome?.trim() || undefined;
        if ('dueDate' in updates) next.dueDate = updates.dueDate || undefined;
        if ('northStarIds' in updates) {
          next.northStarIds = updates.northStarIds?.length ? updates.northStarIds : undefined;
        }
        return next;
      })
    );
  }, []);

  const setStatus = useCallback((id: string, status: ProjectStatus) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              status,
              archivedAt: status === 'archived' ? new Date().toISOString() : undefined,
              updatedAt: new Date().toISOString(),
            }
          : p
      )
    );
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // ---- Milestones ----

  const addMilestone = useCallback((projectId: string, label: string, dueDate?: string) => {
    const clean = label.trim();
    if (!clean) return;
    const milestone: ProjectMilestone = {
      id: uuidv4(),
      label: clean,
      dueDate: dueDate || undefined,
    };
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? { ...p, milestones: [...(p.milestones || []), milestone], updatedAt: new Date().toISOString() }
          : p
      )
    );
  }, []);

  const toggleMilestone = useCallback((projectId: string, milestoneId: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          milestones: (p.milestones || []).map((m) =>
            m.id === milestoneId
              ? { ...m, done: !m.done, completedAt: m.done ? undefined : new Date().toISOString() }
              : m
          ),
          updatedAt: new Date().toISOString(),
        };
      })
    );
  }, []);

  const deleteMilestone = useCallback((projectId: string, milestoneId: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? {
              ...p,
              milestones: (p.milestones || []).filter((m) => m.id !== milestoneId),
              updatedAt: new Date().toISOString(),
            }
          : p
      )
    );
  }, []);

  // Bulk-create. Used by the med-school starter set so the user gets a
  // populated board instead of an empty state on day one.
  const addProjects = useCallback((inputs: NewProjectInput[]) => {
    const now = new Date().toISOString();
    setProjects((prev) => {
      const used = new Set(prev.filter((p) => p.status !== 'archived').map((p) => p.color));
      const created: Project[] = [];
      for (const input of inputs) {
        const name = input.name.trim();
        if (!name) continue;
        const color =
          input.color ??
          STAR_COLORS.find((c) => !used.has(c.id))?.id ??
          STAR_COLORS[(prev.length + created.length) % STAR_COLORS.length].id;
        used.add(color);
        created.push({
          id: uuidv4(),
          name,
          kind: input.kind,
          status: 'active',
          color,
          outcome: input.outcome?.trim() || undefined,
          nextAction: input.nextAction?.trim() || undefined,
          dueDate: input.dueDate || undefined,
          milestones: [],
          createdAt: now,
          updatedAt: now,
        });
      }
      return [...prev, ...created];
    });
  }, []);

  return {
    projects: sorted,
    active,
    visible,
    needsAttention,
    loaded,
    addProject,
    addProjects,
    updateProject,
    setStatus,
    deleteProject,
    addMilestone,
    toggleMilestone,
    deleteMilestone,
  };
}
