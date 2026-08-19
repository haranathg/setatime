import { useEffect, useRef, useState } from 'react';
import type { Project } from '../types';
import { colorFor } from '../hooks/useNorthStars';
import { PROJECT_KIND_META } from '../hooks/useProjects';

// The one visual atom that ties the whole layer together: wherever a
// task lives, the same small colored chip says which project it serves.
// Deliberately tiny — a task row should read as the task first and the
// project second.

export function ProjectDot({ project, className = '' }: { project: Project; className?: string }) {
  const c = colorFor(project.color);
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${className}`}
      style={{ backgroundColor: c.hex }}
      aria-hidden="true"
    />
  );
}

export function ProjectChip({
  project,
  onClick,
  title,
}: {
  project: Project;
  onClick?: () => void;
  title?: string;
}) {
  const c = colorFor(project.color);
  const body = (
    <>
      <ProjectDot project={project} />
      <span className="truncate">{project.name}</span>
    </>
  );
  const cls =
    'inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full border max-w-[8rem]';
  if (!onClick) {
    return (
      <span
        className={cls}
        style={{ borderColor: `${c.hex}55`, color: c.hex }}
        title={title ?? project.name}
      >
        {body}
      </span>
    );
  }
  return (
    <button
      onClick={onClick}
      className={`${cls} hover:brightness-90 transition`}
      style={{ borderColor: `${c.hex}55`, color: c.hex }}
      title={title ?? `Project: ${project.name}`}
    >
      {body}
    </button>
  );
}

// A compact "which project?" popover. Renders as a chip when assigned
// and a faint "+ project" affordance when not, so unassigned rows stay
// visually quiet — most tasks won't have a project and that's fine.
//
// `variant` controls how much horizontal room it asks for. Dense rows
// (the week board, which already carries a day select, three promote
// buttons, and a drop button) use 'dot': the color alone identifies the
// project, and the name is one tap away in the menu. A named chip there
// squeezes the task label down to nothing on a phone.
export function ProjectPicker({
  projects,
  value,
  onChange,
  compact = true,
  variant = 'chip',
}: {
  projects: Project[];
  value?: string;
  onChange: (projectId: string | undefined) => void;
  compact?: boolean;
  variant?: 'chip' | 'dot';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = projects.find((p) => p.id === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Nothing to pick from yet — don't advertise an empty menu.
  if (projects.length === 0) return null;

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      {selected ? (
        variant === 'dot' ? (
          <button
            onClick={() => setOpen((v) => !v)}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title={`Project: ${selected.name} — tap to change`}
            aria-label={`Project: ${selected.name}`}
          >
            <ProjectDot project={selected} />
          </button>
        ) : (
          <ProjectChip project={selected} onClick={() => setOpen((v) => !v)} title="Change project" />
        )
      ) : variant === 'dot' ? (
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-5 h-5 flex items-center justify-center rounded text-gray-300 dark:text-gray-600 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="Assign to a project"
          aria-label="Assign to a project"
        >
          <span className="w-2 h-2 rounded-full border border-dashed border-current" />
        </button>
      ) : (
        <button
          onClick={() => setOpen((v) => !v)}
          className={`text-[10px] rounded-full border border-dashed border-gray-300 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-400 dark:hover:border-indigo-600 transition-colors ${
            compact ? 'px-1.5 py-0.5' : 'px-2 py-1'
          }`}
          title="Assign to a project"
          aria-label="Assign to a project"
        >
          + project
        </button>
      )}

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-40 min-w-[11rem] max-h-64 overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg py-1"
          role="menu"
        >
          {projects.map((p) => {
            const c = colorFor(p.color);
            const isSel = p.id === value;
            return (
              <button
                key={p.id}
                onClick={() => {
                  onChange(p.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-[12px] transition-colors ${
                  isSel
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 font-semibold text-gray-900 dark:text-gray-100'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                role="menuitem"
              >
                <span
                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: c.hex }}
                />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-[10px] opacity-60">{PROJECT_KIND_META[p.kind].glyph}</span>
              </button>
            );
          })}
          {value && (
            <button
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-[12px] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 border-t border-gray-100 dark:border-gray-800 mt-1"
              role="menuitem"
            >
              Clear project
            </button>
          )}
        </div>
      )}
    </div>
  );
}
