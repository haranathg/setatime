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

export interface ChartNote {
  id: string;
  date: string; // "YYYY-MM-DD" — encounter date
  encounterType: 'daily' | 'weekly' | 'other';
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
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

export interface AppState {
  blocks: TaskBlock[];
  brainDump?: BrainDumpState;
  chart?: ChartState;
  habits?: HabitsState;
  inbox?: InboxState;
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
