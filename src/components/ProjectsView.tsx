import { useMemo, useState } from 'react';
import type {
  BrainDumpTask,
  DailyPlanSize,
  DailyPlanTask,
  NorthStar,
  Project,
  ProjectKind,
  ProjectStatus,
  WeekBoardItem,
} from '../types';
import { colorFor } from '../hooks/useNorthStars';
import {
  PROJECT_KINDS,
  PROJECT_KIND_META,
  SOFT_ACTIVE_PROJECT_CAP,
  formatDaysUntil,
  isStalled,
  nextDeadline,
} from '../hooks/useProjects';
import type { NewProjectInput } from '../hooks/useProjects';

interface ProjectsViewProps {
  projects: Project[];
  northStars: NorthStar[];
  // Linked work, for the per-project rollup counts
  dumpTasks: BrainDumpTask[];
  planTasks: DailyPlanTask[];
  weekBoardItems: WeekBoardItem[];
  onAddProject: (input: NewProjectInput) => Project | null;
  onAddProjects: (inputs: NewProjectInput[]) => void;
  onUpdateProject: (
    id: string,
    updates: Partial<Pick<Project, 'name' | 'kind' | 'color' | 'nextAction' | 'outcome' | 'dueDate' | 'northStarIds'>>,
  ) => void;
  onSetStatus: (id: string, status: ProjectStatus) => void;
  onDeleteProject: (id: string) => void;
  onAddMilestone: (projectId: string, label: string, dueDate?: string) => void;
  onToggleMilestone: (projectId: string, milestoneId: string) => void;
  onDeleteMilestone: (projectId: string, milestoneId: string) => void;
  // Cross-surface actions on a project's next action
  onSendToHold: (label: string, projectId?: string) => void;
  onScheduleThis: (prefill: { taskName?: string }) => void;
  onAddToPlan: (size: DailyPlanSize, label: string, projectId?: string) => DailyPlanTask | null;
  onAddToWeek: (label: string, projectId?: string) => void;
}

// The starter set. Seeded from the buckets the user named rather than a
// generic template, so day one looks like their actual year. Every one
// is editable and deletable — this is scaffolding, not a prescription.
const STARTER_PROJECTS: NewProjectInput[] = [
  {
    name: 'Current course block',
    kind: 'course',
    outcome: 'Pass the block exam without cramming the last 72 hours',
    nextAction: 'Put every lecture + exam date from the syllabus into Milestones',
  },
  {
    name: 'Step 1',
    kind: 'exam',
    outcome: 'Walk in having done the reps, not having read about doing the reps',
    nextAction: 'Do 10 questions today — the number is small on purpose',
  },
  {
    name: 'Research project',
    kind: 'research',
    outcome: 'A submitted abstract or paper with my name on it',
    nextAction: 'Email the PI to lock a standing check-in',
  },
  {
    name: 'Clinical / orgs / volunteering',
    kind: 'clinical',
    outcome: 'Show up reliably to the few I actually said yes to',
    nextAction: 'List every commitment I have already agreed to',
  },
  {
    name: 'Compliance modules',
    kind: 'compliance',
    outcome: 'Nothing expires, nothing blocks me from the wards',
    nextAction: 'Find the deadline for each module and add it as a Milestone',
  },
];

export default function ProjectsView({
  projects,
  northStars,
  dumpTasks,
  planTasks,
  weekBoardItems,
  onAddProject,
  onAddProjects,
  onUpdateProject,
  onSetStatus,
  onDeleteProject,
  onAddMilestone,
  onToggleMilestone,
  onDeleteMilestone,
  onSendToHold,
  onScheduleThis,
  onAddToPlan,
  onAddToWeek,
}: ProjectsViewProps) {
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showPlaybook, setShowPlaybook] = useState(false);

  const visible = useMemo(
    () => projects.filter((p) => (showArchived ? true : p.status !== 'archived')),
    [projects, showArchived]
  );
  const activeCount = projects.filter((p) => p.status === 'active').length;
  const stalledCount = projects.filter((p) => isStalled(p)).length;

  // Open work per project, rolled up across the three task pools. The
  // point isn't precision — it's answering "is anything actually moving
  // on this?" at a glance.
  const openCounts = useMemo(() => {
    const map = new Map<string, number>();
    const bump = (id?: string) => {
      if (!id) return;
      map.set(id, (map.get(id) || 0) + 1);
    };
    for (const t of dumpTasks) if (t.triage !== 'someday') bump(t.projectId);
    for (const t of planTasks) if (!t.completedAt) bump(t.projectId);
    for (const i of weekBoardItems) bump(i.projectId);
    return map;
  }, [dumpTasks, planTasks, weekBoardItems]);

  const isEmpty = projects.length === 0;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        <header className="flex items-baseline justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">Projects</h2>
            <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">
              Anything that takes more than one action and more than one day.
            </p>
          </div>
          {!isEmpty && (
            <span className="flex-shrink-0 text-right text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 tabular-nums whitespace-nowrap">
              {activeCount} active
              {stalledCount > 0 && (
                <span className="text-amber-600 dark:text-amber-400"> · {stalledCount} stalled</span>
              )}
            </span>
          )}
        </header>

        {activeCount > SOFT_ACTIVE_PROJECT_CAP && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30 px-3 py-2">
            <p className="text-[12px] text-amber-900 dark:text-amber-200">
              <strong>{activeCount} active projects.</strong> That is more than anyone runs well at once.
              Nothing here stops you — but moving one or two to <em>Backburner</em> is a decision you
              get to make on purpose instead of by neglect.
            </p>
          </div>
        )}

        {/* The playbook — the answer to "I have no idea how to use this
            for med school." Collapsed by default once projects exist,
            open by default when the board is empty. */}
        <PlaybookCard
          open={isEmpty || showPlaybook}
          onToggle={() => setShowPlaybook((v) => !v)}
          collapsible={!isEmpty}
        />

        {isEmpty ? (
          <section className="bg-white dark:bg-gray-900 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl px-4 py-6 text-center space-y-3">
            <p className="text-base font-semibold text-gray-700 dark:text-gray-300">No projects yet</p>
            <p className="text-[13px] text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Start with the five shapes of med-school work. Every one is editable — rename them to
              your actual course, your actual PI, your actual modules.
            </p>
            <button
              onClick={() => onAddProjects(STARTER_PROJECTS)}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
            >
              Add the 5 starter projects
            </button>
            <div>
              <button
                onClick={() => setCreating(true)}
                className="text-[12px] font-semibold text-gray-500 dark:text-gray-400 hover:text-indigo-700 dark:hover:text-indigo-300"
              >
                or start one from scratch
              </button>
            </div>
          </section>
        ) : null}

        {creating ? (
          <ProjectForm
            northStars={northStars}
            onCancel={() => setCreating(false)}
            onSubmit={(input) => {
              const created = onAddProject(input);
              if (created) setCreating(false);
            }}
          />
        ) : (
          !isEmpty && (
            <button
              onClick={() => setCreating(true)}
              className="w-full py-2 text-[12px] font-semibold text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl hover:border-indigo-400 dark:hover:border-indigo-600 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
            >
              + new project
            </button>
          )
        )}

        <div className="space-y-3">
          {visible.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              northStars={northStars}
              openCount={openCounts.get(p.id) || 0}
              onUpdate={onUpdateProject}
              onSetStatus={onSetStatus}
              onDelete={onDeleteProject}
              onAddMilestone={onAddMilestone}
              onToggleMilestone={onToggleMilestone}
              onDeleteMilestone={onDeleteMilestone}
              onSendToHold={onSendToHold}
              onScheduleThis={onScheduleThis}
              onAddToPlan={onAddToPlan}
              onAddToWeek={onAddToWeek}
            />
          ))}
        </div>

        {projects.some((p) => p.status === 'archived') && (
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="w-full text-[11px] font-semibold text-gray-500 dark:text-gray-400 hover:text-indigo-700 dark:hover:text-indigo-300 py-1.5 border-t border-dashed border-gray-200 dark:border-gray-800"
          >
            {showArchived ? '− hide archived' : '▶ show archived'}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Playbook ----------
//
// Answers the actual question behind "I have no idea how to use the
// app": which surface do I touch, and when. Written as a rhythm rather
// than a feature tour, because the app already has plenty of features —
// what was missing was the order to use them in.

function PlaybookCard({
  open,
  onToggle,
  collapsible,
}: {
  open: boolean;
  onToggle: () => void;
  collapsible: boolean;
}) {
  return (
    <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
      <button
        onClick={collapsible ? onToggle : undefined}
        className={`w-full px-4 py-2.5 flex items-center justify-between border-b border-gray-100 dark:border-gray-800 ${
          collapsible ? 'hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors' : 'cursor-default'
        }`}
      >
        <h3 className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">
          How to run med school in here
        </h3>
        {collapsible && (
          <span className="text-[11px] text-gray-400 dark:text-gray-500">{open ? '−' : '▶'}</span>
        )}
      </button>

      {open && (
        <div className="px-4 py-3 space-y-3 text-[12px] text-gray-600 dark:text-gray-400">
          <p>
            You already have every piece. What was missing was a container — so here it is.
            <strong className="text-gray-800 dark:text-gray-200"> Projects hold the outcomes; everything
            else stays exactly as it was.</strong>
          </p>

          <Rhythm
            when="Once a term · 20 minutes"
            what="Set up the board"
            how="One project per real thing: each course block, Step 1, the research project, each org you actually said yes to, and one for compliance modules. Put every date you do not control — exam dates, module deadlines, IRB — in as a Milestone. This is the only part that takes real time, and you only do it once."
          />
          <Rhythm
            when="Sunday · 10 minutes"
            what="Fill the week board"
            how="Open Today → Week board. Walk this list top to bottom and ask each project 'what moves this next week?' Tag what you add with its project. Anything you cannot honestly fit, drop — the drop counter is there to make that a win instead of a failure."
          />
          <Rhythm
            when="Every morning · 2 minutes"
            what="Pull 1 / 3 / 5"
            how="Promote from the week board into today's plan. Rule of thumb that keeps med school survivable: the Big slot goes to the nearest deadline, one Medium goes to the project that would otherwise stall, and Smalls are where compliance modules go to die quietly."
          />
          <Rhythm
            when="In the moment"
            what="Capture without deciding"
            how="The bar at the bottom of every screen logs to Hold. Do not sort it there — sort it Sunday. Hold is the pressure valve; the board is the plan."
          />
          <Rhythm
            when="When you cannot start"
            what="Underway"
            how="Sail → Underway. Two minutes counts. A project with a next action written down is one you can start without deciding anything first — that is the whole reason the Next action field exists."
          />

          <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
            <p className="text-[11px] text-gray-500 dark:text-gray-500">
              <strong className="text-gray-700 dark:text-gray-300">The one rule:</strong> every active
              project has a next action or a deadline within reach. If it has neither, this view marks
              it <span className="text-amber-600 dark:text-amber-400 font-semibold">stalled</span> —
              which is not a scolding, it is the list telling you it needs a decision: give it a next
              step, or move it to Backburner and stop paying rent on it.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function Rhythm({ when, what, how }: { when: string; what: string; how: string }) {
  return (
    <div className="flex gap-3">
      <div className="w-24 flex-shrink-0">
        <div className="text-[10px] uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400 leading-tight">
          {when}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-gray-800 dark:text-gray-200">{what}</div>
        <p className="text-[11.5px] leading-relaxed mt-0.5">{how}</p>
      </div>
    </div>
  );
}

// ---------- Project card ----------

const STATUS_META: Record<ProjectStatus, { label: string; tone: string }> = {
  active:     { label: 'Active',     tone: 'text-emerald-700 dark:text-emerald-300' },
  backburner: { label: 'Backburner', tone: 'text-gray-500 dark:text-gray-400' },
  done:       { label: 'Done',       tone: 'text-indigo-600 dark:text-indigo-400' },
  archived:   { label: 'Archived',   tone: 'text-gray-400 dark:text-gray-600' },
};

function ProjectCard({
  project,
  northStars,
  openCount,
  onUpdate,
  onSetStatus,
  onDelete,
  onAddMilestone,
  onToggleMilestone,
  onDeleteMilestone,
  onSendToHold,
  onScheduleThis,
  onAddToPlan,
  onAddToWeek,
}: {
  project: Project;
  northStars: NorthStar[];
  openCount: number;
  onUpdate: ProjectsViewProps['onUpdateProject'];
  onSetStatus: ProjectsViewProps['onSetStatus'];
  onDelete: ProjectsViewProps['onDeleteProject'];
  onAddMilestone: ProjectsViewProps['onAddMilestone'];
  onToggleMilestone: ProjectsViewProps['onToggleMilestone'];
  onDeleteMilestone: ProjectsViewProps['onDeleteMilestone'];
  onSendToHold: ProjectsViewProps['onSendToHold'];
  onScheduleThis: ProjectsViewProps['onScheduleThis'];
  onAddToPlan: ProjectsViewProps['onAddToPlan'];
  onAddToWeek: ProjectsViewProps['onAddToWeek'];
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nextDraft, setNextDraft] = useState(project.nextAction || '');
  const [editingNext, setEditingNext] = useState(false);

  const c = colorFor(project.color);
  const kind = PROJECT_KIND_META[project.kind];
  const dl = nextDeadline(project);
  const stalled = isStalled(project);
  const dimmed = project.status === 'archived' || project.status === 'done';

  const saveNext = () => {
    onUpdate(project.id, { nextAction: nextDraft });
    setEditingNext(false);
  };

  if (editing) {
    return (
      <ProjectForm
        northStars={northStars}
        initial={project}
        onCancel={() => setEditing(false)}
        onSubmit={(input) => {
          onUpdate(project.id, {
            name: input.name,
            kind: input.kind,
            outcome: input.outcome,
            dueDate: input.dueDate,
            color: input.color,
            northStarIds: input.northStarIds,
          });
          setEditing(false);
        }}
        onDelete={() => {
          onDelete(project.id);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <section
      className={`bg-white dark:bg-gray-900 border rounded-2xl overflow-hidden transition-opacity ${
        dimmed ? 'opacity-60' : ''
      } ${stalled ? 'border-amber-300 dark:border-amber-800' : 'border-gray-200 dark:border-gray-800'}`}
      style={!stalled && !dimmed ? { borderLeft: `3px solid ${c.hex}` } : undefined}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-start gap-2">
          <span className="text-[15px] leading-none mt-0.5" aria-hidden="true">{kind.glyph}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100 truncate">
                {project.name}
              </h3>
              <span className={`text-[10px] uppercase tracking-wider font-bold ${STATUS_META[project.status].tone}`}>
                {STATUS_META[project.status].label}
              </span>
            </div>
            {project.outcome && (
              <p className="text-[11.5px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                {project.outcome}
              </p>
            )}
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 px-1"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '−' : '▾'}
          </button>
        </div>

        {/* Signal row — deadline, open work, stalled flag */}
        <div className="flex items-center gap-2 flex-wrap mt-1.5 ml-6">
          {dl && (
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                dl.days < 0
                  ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                  : dl.days <= 3
                    ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
              title={`${dl.label} · ${dl.dateKey}`}
            >
              {dl.label} {formatDaysUntil(dl.days)}
            </span>
          )}
          {openCount > 0 && (
            <span className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">
              {openCount} open {openCount === 1 ? 'task' : 'tasks'}
            </span>
          )}
          {stalled && (
            <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
              ⚠ stalled — needs a next step or the backburner
            </span>
          )}
        </div>

        {/* Next action — the load-bearing field */}
        <div className="mt-2 ml-6">
          {editingNext ? (
            <div className="flex gap-1.5">
              <input
                autoFocus
                type="text"
                value={nextDraft}
                onChange={(e) => setNextDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); saveNext(); }
                  else if (e.key === 'Escape') { e.preventDefault(); setNextDraft(project.nextAction || ''); setEditingNext(false); }
                }}
                placeholder="The next physical move — small enough to start today"
                className="flex-1 min-w-0 px-2 py-1 text-[12px] border border-gray-200 dark:border-gray-800 rounded-md bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <button
                onClick={saveNext}
                className="px-2 py-0.5 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md"
              >
                Save
              </button>
            </div>
          ) : project.nextAction ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setEditingNext(true)}
                className="text-left text-[12.5px] text-gray-800 dark:text-gray-200 hover:text-indigo-700 dark:hover:text-indigo-300 flex-1 min-w-0"
                title="Edit next action"
              >
                <span className="text-gray-400 dark:text-gray-500 mr-1">→</span>
                {project.nextAction}
              </button>
              <div className="flex items-center gap-1 flex-shrink-0">
                <MiniAction
                  label="Today"
                  title="Add to today's plan as a Medium"
                  onClick={() => onAddToPlan('medium', project.nextAction!, project.id)}
                />
                <MiniAction
                  label="Week"
                  title="Add to the week board"
                  onClick={() => onAddToWeek(project.nextAction!, project.id)}
                />
                <MiniAction
                  label="Hold"
                  title="Send to Hold"
                  onClick={() => onSendToHold(project.nextAction!, project.id)}
                />
                <MiniAction
                  label="↗"
                  title="Schedule on the calendar"
                  onClick={() => onScheduleThis({ taskName: project.nextAction! })}
                />
              </div>
            </div>
          ) : (
            <button
              onClick={() => setEditingNext(true)}
              className="text-[11.5px] font-semibold text-amber-700 dark:text-amber-400 hover:underline"
            >
              + set the next action
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-gray-800 space-y-3">
          <MilestoneList
            project={project}
            onAdd={onAddMilestone}
            onToggle={onToggleMilestone}
            onDelete={onDeleteMilestone}
          />

          {/* North Star links, when any exist */}
          {northStars.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1">
                Serves
              </div>
              <div className="flex flex-wrap gap-1">
                {northStars.map((s) => {
                  const on = (project.northStarIds || []).includes(s.id);
                  const sc = colorFor(s.color);
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        const cur = project.northStarIds || [];
                        onUpdate(project.id, {
                          northStarIds: on ? cur.filter((i) => i !== s.id) : [...cur, s.id],
                        });
                      }}
                      className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                        on ? 'font-semibold' : 'text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                      }`}
                      style={on ? { borderColor: sc.hex, color: sc.hex } : undefined}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Status + edit */}
          <div className="flex items-center gap-1 flex-wrap pt-1">
            {(['active', 'backburner', 'done', 'archived'] as ProjectStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => onSetStatus(project.id, s)}
                className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border transition-colors ${
                  project.status === s
                    ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 border-transparent'
                    : 'text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400'
                }`}
              >
                {STATUS_META[s].label}
              </button>
            ))}
            <button
              onClick={() => setEditing(true)}
              className="ml-auto px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 hover:text-indigo-700 dark:hover:text-indigo-300"
            >
              Edit
            </button>
          </div>

          <p className="text-[10.5px] text-gray-400 dark:text-gray-500 italic">{kind.blurb}</p>
        </div>
      )}
    </section>
  );
}

function MiniAction({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="px-1.5 py-0.5 text-[10px] font-semibold rounded border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-indigo-400 dark:hover:border-indigo-600 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
    >
      {label}
    </button>
  );
}

// ---------- Milestones ----------

function MilestoneList({
  project,
  onAdd,
  onToggle,
  onDelete,
}: {
  project: Project;
  onAdd: (projectId: string, label: string, dueDate?: string) => void;
  onToggle: (projectId: string, milestoneId: string) => void;
  onDelete: (projectId: string, milestoneId: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [due, setDue] = useState('');

  const milestones = useMemo(() => {
    return [...(project.milestones || [])].sort((a, b) => {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
    });
  }, [project.milestones]);

  const commit = () => {
    if (!label.trim()) return;
    onAdd(project.id, label.trim(), due || undefined);
    setLabel('');
    setDue('');
    setAdding(false);
  };

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1">
        Milestones — dates you don't control
      </div>
      {milestones.length === 0 && !adding && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1">
          Nothing dated yet. Exam dates, module deadlines, submission cutoffs go here.
        </p>
      )}
      <ul className="space-y-0.5">
        {milestones.map((m) => {
          const days = m.dueDate ? formatDaysUntil(
            Math.round(
              (new Date(
                Number(m.dueDate.slice(0, 4)),
                Number(m.dueDate.slice(5, 7)) - 1,
                Number(m.dueDate.slice(8, 10)),
                12
              ).getTime() -
                new Date(new Date().setHours(12, 0, 0, 0)).getTime()) /
                86_400_000
            )
          ) : '';
          return (
            <li key={m.id} className="group flex items-center gap-2 text-[12px]">
              <button
                onClick={() => onToggle(project.id, m.id)}
                className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  m.done
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'border-gray-300 dark:border-gray-600 hover:border-emerald-500'
                }`}
                aria-label={m.done ? 'Mark not done' : 'Mark done'}
              >
                {m.done && <span className="text-[8px] leading-none">✓</span>}
              </button>
              <span className={`flex-1 min-w-0 truncate ${m.done ? 'line-through text-gray-400 dark:text-gray-600' : 'text-gray-800 dark:text-gray-200'}`}>
                {m.label}
              </span>
              {m.dueDate && !m.done && (
                <span className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums flex-shrink-0">
                  {days}
                </span>
              )}
              <button
                onClick={() => onDelete(project.id, m.id)}
                className="opacity-0 group-hover:opacity-100 text-[11px] text-gray-400 hover:text-rose-600 transition-opacity flex-shrink-0"
                aria-label="Delete milestone"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div className="flex gap-1.5 mt-1.5">
          <input
            autoFocus
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              else if (e.key === 'Escape') { e.preventDefault(); setAdding(false); }
            }}
            placeholder="Block 2 exam"
            className="flex-1 min-w-0 px-2 py-1 text-[12px] border border-gray-200 dark:border-gray-800 rounded-md bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="px-1.5 py-1 text-[11px] border border-gray-200 dark:border-gray-800 rounded-md bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            onClick={commit}
            disabled={!label.trim()}
            className="px-2 py-0.5 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-40"
          >
            Add
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400 hover:text-indigo-700 dark:hover:text-indigo-300"
        >
          + milestone
        </button>
      )}
    </div>
  );
}

// ---------- Create / edit form ----------

function ProjectForm({
  northStars,
  initial,
  onCancel,
  onSubmit,
  onDelete,
}: {
  northStars: NorthStar[];
  initial?: Project;
  onCancel: () => void;
  onSubmit: (input: NewProjectInput) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [kind, setKind] = useState<ProjectKind>(initial?.kind || 'course');
  const [outcome, setOutcome] = useState(initial?.outcome || '');
  const [nextAction, setNextAction] = useState(initial?.nextAction || '');
  const [dueDate, setDueDate] = useState(initial?.dueDate || '');
  const [starIds, setStarIds] = useState<string[]>(initial?.northStarIds || []);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const commit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      kind,
      outcome: outcome.trim() || undefined,
      nextAction: nextAction.trim() || undefined,
      dueDate: dueDate || undefined,
      color: initial?.color,
      northStarIds: starIds,
    });
  };

  return (
    <section className="bg-white dark:bg-gray-900 border border-indigo-200 dark:border-indigo-900 rounded-2xl p-3 space-y-2.5">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
        placeholder="Project name — e.g. Cardio-Renal block"
        className="w-full px-2.5 py-1.5 text-[14px] font-semibold border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />

      <div>
        <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1">
          Kind
        </div>
        <div className="flex flex-wrap gap-1">
          {PROJECT_KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`px-2 py-0.5 text-[11px] font-semibold rounded-full border transition-colors ${
                kind === k
                  ? 'bg-indigo-600 text-white border-transparent'
                  : 'text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-indigo-400'
              }`}
              title={PROJECT_KIND_META[k].blurb}
            >
              {PROJECT_KIND_META[k].glyph} {PROJECT_KIND_META[k].label}
            </button>
          ))}
        </div>
        <p className="text-[10.5px] text-gray-400 dark:text-gray-500 italic mt-1">
          {PROJECT_KIND_META[kind].blurb}
        </p>
      </div>

      <input
        type="text"
        value={outcome}
        onChange={(e) => setOutcome(e.target.value)}
        placeholder="What does done look like? (optional)"
        className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />

      {!initial && (
        <input
          type="text"
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          placeholder="Next action — the smallest move you could make today"
          className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      )}

      <div className="flex items-center gap-2">
        <label className="text-[11px] text-gray-500 dark:text-gray-400">Overall deadline</label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="px-2 py-1 text-[11px] border border-gray-200 dark:border-gray-800 rounded-md bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        {dueDate && (
          <button
            onClick={() => setDueDate('')}
            className="text-[11px] text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            clear
          </button>
        )}
      </div>

      {northStars.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1">
            Serves which North Star?
          </div>
          <div className="flex flex-wrap gap-1">
            {northStars.map((s) => {
              const on = starIds.includes(s.id);
              const sc = colorFor(s.color);
              return (
                <button
                  key={s.id}
                  onClick={() => setStarIds((prev) => (on ? prev.filter((i) => i !== s.id) : [...prev, s.id]))}
                  className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                    on ? 'font-semibold' : 'text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                  }`}
                  style={on ? { borderColor: sc.hex, color: sc.hex } : undefined}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={commit}
          disabled={!name.trim()}
          className="px-3 py-1.5 text-[12px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-40"
        >
          {initial ? 'Save' : 'Create project'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-[12px] font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
        >
          Cancel
        </button>
        {onDelete && (
          <button
            onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
            className="ml-auto px-2 py-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
          >
            {confirmDelete ? 'Really delete?' : 'Delete'}
          </button>
        )}
      </div>
    </section>
  );
}
