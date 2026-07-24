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
  mainTime: string; // "HH:MM" 24hr format. When isAllDay=true this is unused for
                    // rendering but kept as a valid string ("00:00") so existing
                    // code paths stay type-safe.
  subTasks: SubTask[];
  color: string;
  createdAt: string; // ISO timestamp
  // "Reserve the day" mode. Renders as a band above the hour grid instead of
  // at a specific time. Sub-tasks with real times still render normally within
  // the day — you can lock in the day, schedule specifics later.
  isAllDay?: boolean;
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

// Prediction Lab modes:
// - 'quick' / 'deep': reactive gut-check predictions (existing).
// - 'leap': decision-under-uncertainty framework. Different mental move —
//   you don't have a strong gut, you have a choice with real uncertainty
//   and safety-bias tends to win by default. The 5 steps break stuckness
//   with evidence-based prompts: reversibility (Bezos type-1/type-2 +
//   Duke's Thinking in Bets), upside asymmetry (Kahneman loss-aversion
//   is ~2x gain-weighting so most decisions have well-imagined downside
//   and vague upside — concretizing upside re-balances the ledger), the
//   bridge (cost-of-inaction reframed: if you'll face this eventually,
//   delay just compounds the discomfort), and 5-year regret minimization
//   (Bezos again).
export type PredictionMode = 'quick' | 'deep' | 'leap';

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

// Leap-specific enums
export type LeapReversibility = 'fully' | 'mostly' | 'partial' | 'not';
export type LeapDecisionOutcome = 'took' | 'did-not-take' | 'partial';
export type LeapOutcomeVsExpectation = 'better' | 'as-expected' | 'worse';
export type LeapFearProportion = 'proportional' | 'over' | 'under';

export interface PredictionEntry {
  id: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  mode: PredictionMode;

  // Capture — always required. For quick/deep: "the situation." For leap:
  // "the choice you're deciding between."
  situation: string;

  // First physical move — the smallest body action that breaks inertia.
  // Always required.
  firstMove: string;

  // Prediction fields — required for quick/deep, optional for leap
  prediction?: string;
  confidence?: number; // 0–100; user's stated belief that the prediction will hold

  // Emotion — required for quick/deep, optional for leap
  emotions?: PredictionEmotion[];
  emotionIntensity?: number; // 0–100

  // Deep-mode optional fields
  evidenceFor?: string;
  evidenceAgainst?: string;
  behavioralPull?: string;     // what the emotion is encouraging you to do
  oneYearProjection?: string;  // where that pull leads in a year
  valuesAction?: string;       // what the version of you you're becoming would do
  experiment?: string;         // small, low-risk probe of the prediction
  experimentWhenWhere?: string; // implementation intention: when + where

  // Leap-mode fields
  leapReversibility?: LeapReversibility;
  leapUpside?: string;         // realistic best case — what opens up if it works
  leapBridgeCost?: string;     // cost of delay itself, not consequences of a decision
  leapRegret?: string;         // 5-year-self answer that becomes decision rationale
  leapDecision?: string;       // what they committed to (fills the "prediction" role in the timeline)

  // Reflection — filed later from a TodayView pin
  reflectionDueAt: string;     // ISO; defaults to createdAt + 24h
  reflectedAt?: string;        // ISO; presence marks the loop as closed
  outcome?: string;            // what actually happened
  // Prediction-mode reflection
  predictionAccurate?: PredictionAccuracy;
  shouldHaveBeenConfidence?: number; // 0–100; user's retro-rating of "right confidence"
  surprise?: number;           // 0–100; how surprising was the outcome
  // Leap-mode reflection
  leapTookIt?: LeapDecisionOutcome;
  leapOutcomeVsExpectation?: LeapOutcomeVsExpectation;
  leapFearProportion?: LeapFearProportion;
  // Shared
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
  stateLog?: StateLogState;
  horizon?: HorizonState;
  underway?: UnderwayState;
  compass?: CompassState;
}

// ---------- Horizon (life-scale perspective) ----------
//
// Zoom-out view. Life Weeks grid + user-defined Eras (Med school, Residency,
// Family life…) that give the arc structure. Opt-in surface — never persistent
// on Today. The whole point is to visit it *when you want* perspective, not to
// have it looming over you. Research on Terror Management Theory is clear:
// scheduled contemplative reflection is generative; sudden reminders are
// anxiety-inducing. This surface is designed for the former.

export interface HorizonEra {
  id: string;
  name: string;             // "Med school", "Residency", "Family life"
  color: string;             // palette id — 'indigo' | 'sky' | 'emerald' | ...
  startDate: string;         // "YYYY-MM-DD"; year-only inputs stored as YYYY-01-01
  endDate?: string;          // undefined = ongoing OR future-estimated (see isEstimated)
  isEstimated?: boolean;     // true = future-projected. Grid renders these lighter/dashed.
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HorizonState {
  birthDate?: string;        // "YYYY-MM-DD"
  lifespanYears: number;     // default 90; user-editable
  eras: HorizonEra[];
}

// ---------- State log ----------
//
// Periodic "How's your energy · because ___" entries. The 1-5 dial is nautical
// (Doldrums · Fog · Cruising · Tailwind · Following seas) so you can see
// direction of drift at a glance instead of choosing from a 3-bucket feeling.
// Each entry can optionally tag whether the reasons *recharged* or *drained*
// you — the signal that later powers pattern mining ("what puts wind in my
// sails").
//
// Legacy 3-bucket `feeling` field kept as optional for pre-scale-upgrade
// entries; read paths use `effectiveEnergy(entry)` which prefers `energy` and
// falls back to a mapping of the legacy value.

export type EnergyLevel = 1 | 2 | 3 | 4 | 5;
export type EnergyDirection = 'recharged' | 'drained' | 'neutral';
export type StateFeeling = 'off' | 'neutral' | 'good'; // deprecated; kept for back-compat reads

export interface StateLogEntry {
  id: string;
  loggedAt: string;             // ISO
  energy?: EnergyLevel;         // 1-5; required for new entries
  direction?: EnergyDirection;  // did the reasons recharge or drain you?
  feeling?: StateFeeling;       // legacy 3-bucket; only present on pre-upgrade entries
  reasons: string[];            // free-text tags user believes contributed to this state
  note?: string;                // optional free-form context
}

export interface StateLogState {
  entries: StateLogEntry[];
}

// ---------- Underway (focus sessions) ----------
//
// Each completed session is one entry here. Persistence matters for the
// EF/ADHD case specifically — being able to *see* your own history is
// what makes the experience non-evaporating. Powers the streak indicator
// on the Underway home + future "same as last time" chips.

export type UnderwayOutcome = 'done' | 'partial' | 'bailed' | 'time-up';

// One line in the interstitial journal — timestamped observation, next
// step, mood, or link. Emotion is optional; when set, it's a short glyph
// like "🔥" or "🌀" that renders as a badge alongside the text.
export interface UnderwayJournalEntry {
  id: string;
  atMs: number;         // ms since session start
  text: string;
  emotion?: string;     // optional mood glyph
}

export interface UnderwaySession {
  id: string;
  taskLabel: string;
  sizeMin: number;                    // committed size (2 / 15 / 60)
  outcome: UnderwayOutcome;
  startedAt: string;                  // ISO
  durationSec: number;                // actual time spent underway
  note?: string;                      // one-line reflection from Wrap
  nextMicrostep?: string;             // hand-off to future you
  source: 'dump' | 'freeform';
  entries?: UnderwayJournalEntry[];   // interstitial journal stream
}

export interface UnderwayState {
  sessions: UnderwaySession[];
}

// ---------- Compass (Circle of Control worksheet) ----------
//
// A CBT/ACT-flavored exercise for anxiety reduction: name what's on your
// mind, sort each piece into Control / Influence / Concern, then either
// act on it, plan influence, or explicitly set it down.
//
// The therapeutic move is "clean pain vs dirty pain" — actionable problems
// are worth energy, rumination on the uncontrollable is not. Making that
// distinction explicit is calibrating in its own right, even before you
// take a single action.
//
// "Getting help" is deliberately surfaced as a first-class Control action
// — many people forget that asking IS in their control.

export type ControlCategory = 'control' | 'influence' | 'concern';

export interface CompassItem {
  id: string;
  text: string;
  category?: ControlCategory;   // undefined = not yet sorted
  nextStep?: string;            // for control/influence
  released?: boolean;           // for concern — user has "set it down"
}

export interface CompassEntry {
  id: string;
  createdAt: string;            // ISO
  items: CompassItem[];
}

export interface CompassState {
  entries: CompassEntry[];
}

// Prefer new energy field; map legacy feeling to a coarse point on the scale.
// Off → 2 (Fog), Neutral → 3 (Cruising), Good → 4 (Tailwind).
export function effectiveEnergy(entry: StateLogEntry): EnergyLevel {
  if (entry.energy !== undefined) return entry.energy;
  if (entry.feeling === 'off') return 2;
  if (entry.feeling === 'good') return 4;
  return 3;
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
