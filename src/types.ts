export interface SubStep {
  id: string;
  label: string;
  done: boolean;
}

export interface SubTask {
  id: string;
  time: string; // "HH:MM" 24hr format
  label: string;
  completed: boolean;
  date?: string; // Optional override "YYYY-MM-DD" for cross-midnight sub-tasks
  steps?: SubStep[]; // optional one-level breakdown; when present, `completed` rolls up from steps
}

export interface TaskBlock {
  id: string;
  date: string; // "YYYY-MM-DD"
  mainTask: string;
  mainTime: string; // "HH:MM" 24hr format
  subTasks: SubTask[];
  color: string;
  createdAt: string; // ISO timestamp
}

export type EisenhowerPriority = 'do-first' | 'schedule' | 'delegate' | 'drop';

export interface BrainDumpTask {
  id: string;
  label: string;
  extractedAt: string; // ISO timestamp
  priority?: EisenhowerPriority;
  tags?: string[]; // freeform value tags (family, work, health, etc.)
}

export interface BrainDumpState {
  unscheduledTasks: BrainDumpTask[];
}

export interface Problem {
  id: string;
  label: string; // short title, e.g. "Sleep debt", "Q3 launch scope"
  detail?: string; // optional one-liner of context
  resolved?: boolean; // checkbox state; doesn't auto-archive, just marks done
  createdAt: string; // ISO timestamp
}

export interface PlanTask {
  id: string;
  text: string;
  done: boolean;
  dumpTaskId?: string; // id of the BrainDumpTask created when user pushed it to the dump
  createdAt: string; // ISO timestamp
}

export interface ChartNote {
  id: string;
  date: string; // "YYYY-MM-DD" — encounter date
  encounterType: 'daily' | 'weekly' | 'other';
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  problems?: Problem[]; // optional — older notes may not have this
  planTasks?: PlanTask[]; // optional — older notes may not have this
  signedAt?: string; // ISO — set when user signs off the note, undefined while still a draft
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface ChartState {
  notes: ChartNote[];
}

export interface HabitLogEntry {
  date: string; // "YYYY-MM-DD" — local date the vote was cast
  at: string; // ISO timestamp
}

export interface Habit {
  id: string;
  name: string;
  reason: string; // one-line immediate "because", set at planning time only
  activationStep: string; // the smallest physical first action
  microSteps: string[]; // even-smaller fallbacks, tiniest-first
  votes: number; // cumulative evidence — only ever increases, never resets
  log: HabitLogEntry[]; // append-only, at most one entry per local day
  createdAt: string; // ISO timestamp
  archived?: boolean; // honest off-ramp; hidden from the doing surface
}

export interface HabitsState {
  habits: Habit[];
}

export type ThoughtStatus = 'inbox' | 'now' | 'future' | 'discarded';

export interface Thought {
  id: string;
  text: string;
  capturedAt: string; // ISO timestamp
  status: ThoughtStatus;
  triagedAt?: string; // ISO, set when status moves out of 'inbox'
  futureSurfaceDate?: string; // "YYYY-MM-DD", for thoughts in 'future' bucket
  promotedToTaskId?: string; // BrainDumpTask id if user clicked "Send to Dump"
  tags?: string[];
}

export interface InboxState {
  thoughts: Thought[];
}

export type BookStatus = 'want' | 'reading' | 'finished';

export interface Book {
  id: string;
  title: string;
  author: string;
  status: BookStatus;
  currentPage: number; // 0..totalPages; the one number that moves while reading
  totalPages: number; // 0 if unknown — progress bar hides when unknown
  notes: string;
  createdAt: string; // ISO timestamp
  startedAt?: string; // ISO, stamped when status first becomes 'reading'
  finishedAt?: string; // ISO, stamped when status becomes 'finished'
}

export interface BooksState {
  books: Book[];
}

export interface SubTaskTemplate {
  id: string;
  label: string;
  offsetMinutes: number; // minutes from the main-task start; can be negative (cross-midnight earlier)
}

export interface BlockTemplate {
  id: string;
  name: string; // user-facing template name, e.g. "Morning routine"
  mainTaskLabel: string; // default main-task label applied with the template
  color?: string; // optional pinned color; falls back to random if absent
  subTasks: SubTaskTemplate[];
  createdAt: string; // ISO timestamp
}

export interface BlockTemplatesState {
  blockTemplates: BlockTemplate[];
}

export type ChartSection = 'subjective' | 'objective' | 'assessment' | 'plan';

// One row per (noteId, section, name). `count` reflects the number of "+name"
// occurrences in that section's current text. Edited live as the note changes.
export interface ActivityLogEntry {
  id: string;
  name: string; // lowercase tag, e.g. "water", "meditate"
  noteId: string;
  section: ChartSection;
  noteDate: string; // "YYYY-MM-DD" copied from the source note's date
  count: number;
  firstLoggedAt: string; // ISO — when this entry first came into being
  updatedAt: string; // ISO — last reconciliation
}

export interface ActivitiesState {
  log: ActivityLogEntry[];
}

// "Don't forget" pin shown at the top of TodayView. Daily-reset: a pin is
// considered "checked for today" when `lastCheckedAt`'s local date matches
// today's date. The next morning it visually unchecks itself without losing
// history.
export interface Pin {
  id: string;
  label: string;
  createdAt: string; // ISO timestamp
  lastCheckedAt?: string; // ISO; presence + date determine today's checked state
}

export interface PinsState {
  pins: Pin[];
}

export interface AppState {
  blocks: TaskBlock[];
  brainDump?: BrainDumpState;
  chart?: ChartState;
  habits?: HabitsState;
  inbox?: InboxState;
  books?: BooksState;
  templates?: BlockTemplatesState;
  activities?: ActivitiesState;
  pins?: PinsState;
}

export interface RenderedBlock {
  block: TaskBlock;
  startMinute: number;
  endMinute: number;
  topPx: number;
  heightPx: number;
  left: string;
  width: string;
  isCrossDay?: boolean;
}
