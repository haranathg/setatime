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
  // When present, this block was synthesized from a dashboard spiral with a
  // schedule. It is not stored in the `blocks` slice — it's expanded at read
  // time. Callers must NOT pass virtual blocks back through addBlock/updateBlock.
  virtualSpiral?: { spiralId: string; dateKey: string };
  durationMinutes?: number; // optional; used by virtual spirals + future block editing
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

// ---------- Prediction Lab ----------
//
// A calibration-loop journal: capture a prediction with a confidence number,
// reflect on it later, compare imagination to reality. The goal is to make
// subconscious affective forecasts visible so they can be tested rather than
// silently driving behavior.
//
// Quick mode (3 prompts: prediction+confidence, emotion+intensity, first move)
// is for in-the-moment use. Deep mode adds CBT/ACT-style evidence, behavioral
// pull, values check, and a structured experiment with an implementation
// intention. Reflection is filed later from a Don't-forget-style pin on Today.

export type PredictionMode = 'quick' | 'deep';

export type PredictionEmotion =
  | 'anxiety'
  | 'shame'
  | 'overwhelm'
  | 'uncertainty'
  | 'sadness'
  | 'anger'
  | 'curiosity'
  | 'excitement'
  | 'guilt'
  | 'resistance';

export type PredictionAccuracy = 'yes' | 'partly' | 'no';
export type TrustShift = 'more' | 'less' | 'same';

export interface PredictionEntry {
  id: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  mode: PredictionMode;

  // Capture + prediction (always required)
  situation: string;
  prediction: string;
  confidence: number; // 0–100; user's stated belief that the prediction will hold

  // Emotion (always)
  emotions: PredictionEmotion[];
  emotionIntensity: number; // 0–100

  // First physical move — the smallest body action that breaks inertia
  firstMove: string;

  // Deep-mode optional fields
  evidenceFor?: string;
  evidenceAgainst?: string;
  behavioralPull?: string;     // what the emotion is encouraging you to do
  oneYearProjection?: string;  // where that pull leads in a year
  valuesAction?: string;       // what the version of you you're becoming would do
  experiment?: string;         // small, low-risk probe of the prediction
  experimentWhenWhere?: string; // implementation intention: when + where

  // Reflection — filed later from a TodayView pin
  reflectionDueAt: string;     // ISO; defaults to createdAt + 24h
  reflectedAt?: string;        // ISO; presence marks the loop as closed
  outcome?: string;            // what actually happened
  predictionAccurate?: PredictionAccuracy;
  shouldHaveBeenConfidence?: number; // 0–100; user's retro-rating of "right confidence"
  surprise?: number;           // 0–100; how surprising was the outcome
  insight?: string;            // one-line takeaway
  trustFuturePredictionsMore?: TrustShift;
}

export interface PredictionLabState {
  entries: PredictionEntry[];
}

// ---------- Today dashboard ("car dashboard" of daily basics) ----------
//
// Iconified indicators on TodayView — hydration, shower, meals, etc. State is
// derived from a time-series of `BasicLog` events plus the indicator's own
// thresholds. Defaults are anchored to the South Asian Heart Center's MEDS
// framework (Meals, Exercise, Destress, Sleep) — an evidence-based metabolic
// and cardiovascular health protocol (Sinha, El Camino) — alongside hydration
// and shower from the user's original ask. All defaults are toggleable, and
// users can add custom indicators with their own thresholds.

// `daily` = a single tap-per-day indicator (e.g., shower, sleep). State is
//   "green" once logged; "amber"/"red" after warn/urgent hour-of-day if not.
// `counter` = multi-tap with a daily target (e.g., hydration, meals). State
//   is "amber"/"red" by time-since-last-log (or 7am start if no logs yet).
export type IndicatorMode = 'daily' | 'counter';

// When does this spiral apply? Daily = every day. Weekdays = Mon-Fri only.
// Specific = pick days via `daysOfWeek`. Backward-compat: missing cadence
// behaves as 'daily' so pre-cadence data renders unchanged.
export type SpiralCadence = 'daily' | 'weekdays' | 'specific';

// When set on an indicator, the dashboard tile materializes a virtual block
// on the calendar at this time on every active day. The block is non-editable
// in v1 — tapping opens a small popover with Log / Skip-today / open Settings.
export interface SpiralSchedule {
  time: string;              // "HH:MM" 24-hour
  durationMinutes?: number;  // optional; defaults to 30 for visual size
}

// A per-occurrence override on a scheduled spiral. v1 only supports
// 'skipped' (the virtual block disappears from that single day). Future
// override kinds (rescheduled, edited) can be added without migration.
export interface SpiralOccurrenceException {
  id: string;
  spiralId: string;
  dateKey: string; // "YYYY-MM-DD" of the skipped occurrence
  kind: 'skipped';
}

export interface BasicIndicator {
  id: string;
  name: string;
  icon: string;     // emoji — used as fallback when no iconKey is set
  iconKey?: string; // SVG glyph key (looked up in the IndicatorIcons registry)
  hint?: string;    // tiny line of guidance (e.g., "8 cups a day", "plant-forward")
  mode: IndicatorMode;
  enabled: boolean;
  preset?: string;  // preset key when seeded from defaults
  dailyTarget?: number;          // counter: ideal count per day (used in display)
  warnAfterMinutes?: number;     // counter: stale-time → amber
  urgentAfterMinutes?: number;   // counter: stale-time → red+pulse
  warnAfterHourOfDay?: number;   // daily: amber after this local hour if no log
  urgentAfterHourOfDay?: number; // daily: red+pulse after this local hour
  // Recurrence + scheduling (all optional for back-compat)
  cadence?: SpiralCadence;       // when this spiral applies (default 'daily')
  daysOfWeek?: number[];         // 0=Sun..6=Sat; required when cadence='specific'
  schedule?: SpiralSchedule;     // optional time-of-day → virtual calendar block
  pausedUntil?: string;          // ISO timestamp; while in the future tile & block both hide
  northStarIds?: string[];       // which North Stars this spiral is contributing to
}

export interface BasicLog {
  id: string;
  indicatorId: string;
  loggedAt: string; // ISO
}

export interface DashboardState {
  indicators: BasicIndicator[];
  logs: BasicLog[];
  occurrenceExceptions?: SpiralOccurrenceException[];
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
  predictions?: PredictionLabState;
  dashboard?: DashboardState;
  northStars?: NorthStarsState;
}

// ---------- North Stars ----------
//
// The macro layer of the app: 1-3 long-term anchors ("Metabolic efficiency",
// "Creative practice") that everything else attributes to. Hard-capped at 3
// active stars because behavior-change research (Locke, Baumeister) shows
// pursuit dilutes past that. Micro-actions on the dashboard, calendar, and
// chart can each tag one or more stars via optional id arrays; the star's
// detail page rolls up its attributed activity.
//
// "Why" is a short paragraph — the user's own words about why this matters.
// "Direction" is an optional short phrase in ACT-style values framing ("live
// in a way that respects my body"). Both optional; name is enough for v1.
// A concrete, measurable rung between the values-direction of a Star and the
// daily actions of a spiral. Each target carries its own "next step" prompt
// so opening the Stars tab always answers "what's the immediate next move?"
export type TargetStatus = 'active' | 'achieved' | 'abandoned';

export interface Target {
  id: string;
  title: string;              // "6:55 mile time"
  targetDate?: string;        // "YYYY-MM-DD"; optional
  status: TargetStatus;
  nextStep?: string;          // single-line prompt; cleared when converted to a task
  createdAt: string;
  updatedAt: string;
  achievedAt?: string;        // ISO; presence marks the rung as reached
}

export interface NorthStar {
  id: string;
  name: string;
  why?: string;
  direction?: string;
  color: string;          // one of a small palette; used for the strip accent + spiral tag dots
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;    // soft delete; archived stars stop counting toward the 3-cap
  targets?: Target[];     // up to 3 active at a time; achieved/abandoned don't count
}

export interface NorthStarsState {
  stars: NorthStar[];
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
