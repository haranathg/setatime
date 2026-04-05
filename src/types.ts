export interface SubTask {
  id: string;
  time: string; // "HH:MM" 24hr format
  label: string;
  completed: boolean;
  date?: string; // Optional override "YYYY-MM-DD" for cross-midnight sub-tasks
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

export interface BrainDumpTask {
  id: string;
  label: string;
  extractedAt: string; // ISO timestamp
}

export interface BrainDumpState {
  unscheduledTasks: BrainDumpTask[];
}

export interface AppState {
  blocks: TaskBlock[];
  brainDump?: BrainDumpState;
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
