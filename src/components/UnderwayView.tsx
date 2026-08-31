import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { BrainDumpTask, UnderwaySession, UnderwayOutcome, UnderwayJournalEntry, UnderwayPinnedResource, StuckPreset, PreflightItem } from '../types';

// Underway — synthetic body-doubling.
//
// The premise: body doubling works not because the other person is smart or
// motivating, but because of three things — presence, rhythm, and witness.
// This surface tries to imitate all three:
//
//   * Presence — the whole screen is about one task, right now. Everything
//     else on the app is behind you.
//   * Rhythm — timed check-in prompts. They don't try to be clever; they
//     just show up on schedule and ask "still with it?" — the medicine is
//     the reliability, not the content.
//   * Witness — every check-in gets a one-line note. That accumulating log
//     is the record that "someone" saw you doing this — even if the
//     someone is future you.
//
// Nautical fit: Sail is the act of moving. Calendar is charting; Grounding
// is steadying the helm; Underway is actually sailing.

type Phase = 'home' | 'quickstart' | 'stuck' | 'pick' | 'preflight' | 'underway' | 'wrap';

type PickedTask = {
  label: string;
  source: 'dump' | 'freeform' | 'plan';
  dumpId?: string; // only present when source === 'dump'
  planId?: string; // only present when source === 'plan' (Today's 1/3/5)
};

// Any positive number of minutes. Was a 2|15|60 union; widened so the
// pre-flight screen can offer a custom length.
type SizeMinutes = number;
const SIZE_PRESETS = [2, 15, 25, 45, 60, 90] as const;
const MAX_SESSION_MIN = 480;
// Short hints for the lengths that carry a distinct intent. Presets
// without one just show the number.
const SIZE_HINTS: Record<number, string> = {
  2: 'Token move — just start',
  15: 'Real start — one clean pass',
  25: 'Pomodoro',
  60: 'Deep push — settle in',
};

// Simple, hardcoded rhythm. Body doubling doesn't need smart pacing.
function checkInMinutesFor(size: SizeMinutes): number[] {
  // Roughly one nudge every ~15 min, never at the very start or the very
  // end. Short sessions get none — an interruption in a 2-minute sprint
  // is the whole session.
  if (size < 10) return [];
  const out: number[] = [];
  for (let m = 15; m < size; m += 15) out.push(m);
  if (out.length === 0) out.push(Math.round(size / 2));
  return out;
}

// What the user fills in before starting. The three fields here are the
// evidence-backed half of the ritual (see PreflightItem in types.ts):
// where, by when, and the if-then for the derailer.
type SessionPlan = {
  place: string;
  leaveBy: string;   // "HH:MM" or ''
  ifThen: string;
  done: Record<string, boolean>; // preflight item id -> ticked
};

const EMPTY_PLAN: SessionPlan = { place: '', leaveBy: '', ifThen: '', done: {} };

// Local alias for the persisted journal entry — matches UnderwayJournalEntry
// exactly. We keep the alias so the in-session code reads cleanly.
type JournalEntry = UnderwayJournalEntry;
type Outcome = UnderwayOutcome;

// Quick one-tap mood chips for the interstitial input. Emojis chosen for
// distinct silhouette so a fast scan-back through a log reads instantly.
const MOOD_CHIPS: { emoji: string; label: string }[] = [
  { emoji: '🔥', label: 'Flow' },
  { emoji: '🌀', label: 'Distracted' },
  { emoji: '😰', label: 'Stuck' },
  { emoji: '💡', label: 'Idea' },
  { emoji: '😴', label: 'Tired' },
];

// Lift URLs out of an entry so we can show them in a compact "Links from
// this session" strip. The regex is deliberately loose — it just catches
// http(s) URLs that show up somewhere in the entry text.
const URL_RE = /(https?:\/\/[^\s)]+)/g;
function extractUrls(text: string): string[] {
  return text.match(URL_RE) || [];
}
function tryHost(u: string): string {
  try { return new URL(u).host.replace(/^www\./, ''); } catch { return u; }
}

// Render a string with any http(s) URLs as clickable anchors, leaving
// the surrounding text untouched. Kept simple — no rich autolink for
// bare domains, only explicit http(s) URLs.
function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noreferrer noopener"
              className="text-indigo-700 dark:text-indigo-300 underline underline-offset-2 hover:text-indigo-900 dark:hover:text-indigo-100 dark:text-indigo-100 break-all"
            >
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function formatMMSS(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Produce a paste-ready markdown block for a saved session — used by the
// review UI's "copy log" button. Keeps the same format as the in-session
// copy so pasting into a Google doc / notes app looks consistent.
function formatSessionMarkdown(s: UnderwaySession): string {
  const startMs = new Date(s.startedAt).getTime();
  const startDisplay = new Date(startMs).toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
  const lines: string[] = [];
  lines.push(`# ${s.taskLabel}`);
  lines.push(`Started: ${startDisplay}`);
  lines.push(`Duration: ${s.sizeMin} min planned · ${formatMMSS(s.durationSec)} elapsed · ${s.outcome}`);
  lines.push('');
  if (s.entries && s.entries.length > 0) {
    lines.push('## Log');
    for (const e of s.entries) {
      const t = new Date(startMs + e.atMs).toLocaleTimeString([], {
        hour: 'numeric', minute: '2-digit',
      });
      const prefix = e.emotion ? `${e.emotion} ` : '';
      lines.push(`- ${t}  ${prefix}${e.text}`);
    }
    lines.push('');
  }
  if (s.note) lines.push(`Reflection: ${s.note}`);
  if (s.nextMicrostep) lines.push(`Next microstep: ${s.nextMicrostep}`);
  return lines.join('\n');
}

interface UnderwayViewProps {
  agedDumpTasks: BrainDumpTask[];
  unscheduledTasks: BrainDumpTask[];
  onDeleteDumpTask: (id: string) => void;
  onNavigateToGrounding: () => void;
  todaysSessions: UnderwaySession[];
  allSessions: UnderwaySession[];       // full history for the Past Sessions section
  weekCount: number;
  recentTaskLabels: string[];
  mantra: string;                       // user's editable BA reminder
  pinnedResources: UnderwayPinnedResource[];  // curated Stuck-screen resources
  // When set, the view opens directly into this phase on next mount
  // (used by Today's Activate menu to fast-path into Stuck / Quickstart).
  // Consumed via onConsumedInitialPhase to prevent re-firing.
  initialPhase?: 'quickstart' | 'stuck' | null;
  onConsumedInitialPhase?: () => void;
  // When set, the view opens directly into a live Underway focus session
  // with this task + size. Used by Knock one out (Today) and the Triage
  // session's "Do now" action. Consumed on mount like initialPhase.
  initialSession?: { label: string; sizeMin: 2 | 15 | 60; dumpId?: string; planId?: string } | null;
  onConsumedInitialSession?: () => void;
  // Called on Wrap-Done when the session was launched from a Today's-plan
  // task — auto-checks the plan slot so the user doesn't have to.
  onSessionCompletedFromPlan?: (planId: string) => void;
  onAddSession: (input: Omit<UnderwaySession, 'id'>) => UnderwaySession;
  onDeleteSession: (id: string) => void;
  onSetMantra: (m: string) => void;
  onAddPinnedResource: (input: { label: string; url: string; emoji?: string }) => UnderwayPinnedResource | null;
  onDeletePinnedResource: (id: string) => void;
  stuckPresets: StuckPreset[];
  onAddStuckPreset: (input: { emoji?: string; label: string }) => StuckPreset | null;
  onUpdateStuckPreset: (id: string, updates: { emoji?: string; label?: string }) => void;
  onDeleteStuckPreset: (id: string) => void;
  onResetStuckPresets: () => void;
  preflightItems: PreflightItem[];
  onAddPreflightItem: (input: { emoji?: string; label: string }) => PreflightItem | null;
  onUpdatePreflightItem: (id: string, updates: { emoji?: string; label?: string }) => void;
  onDeletePreflightItem: (id: string) => void;
  onResetPreflightItems: () => void;
  recentPlaces: string[];
}

export default function UnderwayView({
  agedDumpTasks,
  unscheduledTasks,
  onDeleteDumpTask,
  onNavigateToGrounding,
  todaysSessions,
  allSessions,
  weekCount,
  recentTaskLabels,
  mantra,
  pinnedResources,
  initialPhase,
  onConsumedInitialPhase,
  initialSession,
  onConsumedInitialSession,
  onSessionCompletedFromPlan,
  onAddSession,
  onDeleteSession,
  onSetMantra,
  onAddPinnedResource,
  onDeletePinnedResource,
  stuckPresets,
  onAddStuckPreset,
  onUpdateStuckPreset,
  onDeleteStuckPreset,
  onResetStuckPresets,
  preflightItems,
  onAddPreflightItem,
  onUpdatePreflightItem,
  onDeletePreflightItem,
  onResetPreflightItems,
  recentPlaces,
}: UnderwayViewProps) {
  const [phase, setPhase] = useState<Phase>('home');

  // Handle the Today → Underway fast-path. If an initialPhase is pending
  // and we're currently at home (fresh open, no in-flight session), jump
  // to it and clear the flag on the parent. Never disrupt a live session.
  useEffect(() => {
    if (!initialPhase) return;
    if (phase !== 'home') return;
    setPhase(initialPhase);
    onConsumedInitialPhase?.();
    // We only want this to fire when initialPhase changes — phase change
    // shouldn't retrigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPhase]);
  const [picked, setPicked] = useState<PickedTask | null>(null);
  const [plan, setPlan] = useState<SessionPlan>(EMPTY_PLAN);
  const [size, setSize] = useState<SizeMinutes | null>(null);

  // Underway session state — a fresh session every time we enter Underway.
  const [sessionStartMs, setSessionStartMs] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  // Interstitial journal — the growing timestamped stream that replaces
  // the old single-microstep field. Entries are stored newest-first for
  // display; persisted in that same order when the session wraps.
  const [entryDraft, setEntryDraft] = useState('');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [pendingCheckIn, setPendingCheckIn] = useState(false);

  // Overtime handling — instead of auto-jumping to Wrap when the clock
  // hits 0, we open a soft "End session?" prompt once. If the user
  // taps Keep going, `extending` sticks and the timer counts up as
  // overtime. They can still Done/Some/Bail at any point.
  const [endPromptOpen, setEndPromptOpen] = useState(false);
  const [extending, setExtending] = useState(false);

  // Wrap state
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [nextMicrostep, setNextMicrostep] = useState('');
  const [wrapNote, setWrapNote] = useState('');

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  const sessionDurationMs = size ? size * 60 * 1000 : 0;
  const remainingMs = Math.max(0, sessionDurationMs - elapsedMs);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const progressFraction = sessionDurationMs
    ? Math.min(1, elapsedMs / sessionDurationMs)
    : 0;

  // Underway timer + check-in trigger. Runs while phase === 'underway'.
  useEffect(() => {
    if (phase !== 'underway') {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
      return;
    }
    const tick = (ts: number) => {
      if (lastTsRef.current === null) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      setElapsedMs((prev) => prev + dt);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    };
  }, [phase]);

  // Fire check-ins on schedule, and end the session when time runs out.
  const checkInMinutes = useMemo(
    () => (size ? checkInMinutesFor(size) : []),
    [size]
  );
  useEffect(() => {
    if (phase !== 'underway' || !size) return;

    // End of committed time. Instead of hard-jumping to Wrap, open a
    // soft "End session?" prompt once. If the user has already tapped
    // "Keep going", `extending` is true and we don't re-prompt — timer
    // just keeps counting up. They can still Done/Some/Bail anytime.
    if (elapsedMs >= sessionDurationMs) {
      if (!extending && !endPromptOpen) {
        setEndPromptOpen(true);
      }
      // Do NOT return — check-in nudges still work in overtime too.
    }

    // Nudge a check-in banner at each scheduled minute mark. The banner
    // is a passive prompt — it lives above the always-visible interstitial
    // input; user logs anything (typed or a mood chip) and it dismisses.
    const elapsedMin = Math.floor(elapsedMs / 60000);
    // We count how many checkInMinutes have passed to decide whether we
    // should currently be prompting. Once user logs anything after a
    // prompt, we advance past that mark.
    const totalPromptsSoFar = checkInMinutes.filter((m) => elapsedMin >= m).length;
    // Prompts consumed = entries logged since the last prompt trigger.
    // Simpler: prompt whenever a new mark has been reached AND we're not
    // already prompting.
    if (totalPromptsSoFar > 0 && !pendingCheckIn) {
      // Only re-prompt if the mark just crossed (no entries logged AT or
      // AFTER that mark's ms yet); this is a loose heuristic, fine for
      // the size options we support (2 / 15 / 60 min).
      const lastMark = checkInMinutes[totalPromptsSoFar - 1];
      const lastMarkMs = lastMark * 60000;
      const loggedSinceMark = entries.some((e) => e.atMs >= lastMarkMs);
      if (!loggedSinceMark) setPendingCheckIn(true);
    }
  }, [elapsedMs, phase, size, sessionDurationMs, checkInMinutes, entries, pendingCheckIn, extending, endPromptOpen]);

  const resetAll = () => {
    setPhase('home');
    setPicked(null);
    setPlan(EMPTY_PLAN);
    setSize(null);
    setSessionStartMs(null);
    setElapsedMs(0);
    setEntryDraft('');
    setEntries([]);
    setPendingCheckIn(false);
    setEndPromptOpen(false);
    setExtending(false);
    setOutcome(null);
    setNextMicrostep('');
    setWrapNote('');
  };

  const startUnderway = () => {
    setSessionStartMs(Date.now());
    setElapsedMs(0);
    setEntries([]);
    setPendingCheckIn(false);
    setEndPromptOpen(false);
    setExtending(false);
    setPhase('underway');
  };

  // Log the current draft as a new entry. Called on Enter or the Log
  // button. Dismisses the check-in banner if one is active.
  const submitEntry = () => {
    const text = entryDraft.trim();
    if (!text) return;
    setEntries((prev) => [{ id: uuidv4(), atMs: elapsedMs, text }, ...prev]);
    setEntryDraft('');
    setPendingCheckIn(false);
  };

  // One-tap mood chip — logs a mood-only entry with the chip label as
  // the visible text and the emoji as the emotion badge. Dismisses the
  // check-in banner too.
  const logMood = (emoji: string, label: string) => {
    setEntries((prev) => [
      { id: uuidv4(), atMs: elapsedMs, text: label, emotion: emoji },
      ...prev,
    ]);
    setPendingCheckIn(false);
  };

  const removeEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  // Copy the full session log to the clipboard as paste-friendly
  // markdown. Works during and after the session.
  const copyLog = async () => {
    if (!picked) return;
    const startIso = sessionStartMs
      ? new Date(sessionStartMs).toLocaleString([], {
          weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit',
        })
      : '';
    // Reverse so the copied log is chronological (oldest → newest),
    // even though the UI shows newest-first.
    const chronological = [...entries].reverse();
    const lines: string[] = [];
    lines.push(`# ${picked.label}`);
    if (startIso) lines.push(`Started: ${startIso}`);
    if (size) lines.push(`Duration: ${size} min planned · ${formatMMSS(Math.floor(elapsedMs / 1000))} elapsed`);
    lines.push('');
    if (chronological.length > 0) {
      lines.push('## Log');
      for (const e of chronological) {
        const t = sessionStartMs
          ? new Date(sessionStartMs + e.atMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
          : formatMMSS(Math.floor(e.atMs / 1000));
        const prefix = e.emotion ? `${e.emotion} ` : '';
        lines.push(`- ${t}  ${prefix}${e.text}`);
      }
      lines.push('');
    }
    const md = lines.join('\n');
    try {
      await navigator.clipboard.writeText(md);
    } catch {
      // Clipboard permission edge case — silently skip. User can still
      // see the log on screen.
    }
  };

  const bail = () => {
    setOutcome('bailed');
    setPhase('wrap');
  };
  const markDone = () => {
    setOutcome('done');
    setPhase('wrap');
  };
  const markPartial = () => {
    setOutcome('partial');
    setPhase('wrap');
  };

  const finishAndReset = () => {
    // Persist a record of the session so the streak indicator + future
    // "same as last time" chips have something to feed on. Any outcome
    // gets a session — bailing counts as showing up.
    if (picked && sessionStartMs !== null && size !== null && outcome !== null) {
      // Persist the journal in chronological (oldest → newest) order so
      // the saved log reads naturally when reviewed later.
      const chronological = [...entries].reverse();
      onAddSession({
        taskLabel: picked.label,
        sizeMin: size,
        outcome,
        startedAt: new Date(sessionStartMs).toISOString(),
        durationSec: Math.floor(elapsedMs / 1000),
        place: plan.place.trim() || undefined,
        leaveBy: plan.leaveBy || undefined,
        ifThen: plan.ifThen.trim() || undefined,
        preflightDone: preflightItems.filter((i) => plan.done[i.id]).map((i) => i.label),
        note: wrapNote.trim() || undefined,
        nextMicrostep: nextMicrostep.trim() || undefined,
        source: picked.source,
        entries: chronological.length > 0 ? chronological : undefined,
      });
    }
    // If the picked task came from the dump and was fully done, drop it.
    if (outcome === 'done' && picked?.source === 'dump' && picked.dumpId) {
      onDeleteDumpTask(picked.dumpId);
    }
    // If the picked task came from Today's plan and was fully done,
    // auto-check the plan slot so the user doesn't have to.
    if (outcome === 'done' && picked?.source === 'plan' && picked.planId) {
      onSessionCompletedFromPlan?.(picked.planId);
    }
    resetAll();
  };

  // Set the task, then route. `viaPreflight` sends the user through the
  // planning screen (the default for Quickstart and Stuck); the explicit
  // fast-paths — Knock one out, Triage "Do now" — omit it and land
  // straight in the session, because those exist precisely to skip
  // deliberation.
  const startQuickstart = (
    label: string,
    sizeMin: SizeMinutes,
    opts?: { dumpId?: string; planId?: string; viaPreflight?: boolean },
  ) => {
    if (opts?.planId) {
      setPicked({ label, source: 'plan', planId: opts.planId });
    } else if (opts?.dumpId) {
      setPicked({ label, source: 'dump', dumpId: opts.dumpId });
    } else {
      setPicked({ label, source: 'freeform' });
    }
    setSize(sizeMin);
    if (opts?.viaPreflight) {
      setPlan(EMPTY_PLAN);
      setPhase('preflight');
      return;
    }
    setSessionStartMs(Date.now());
    setElapsedMs(0);
    setEntries([]);
    setPendingCheckIn(false);
    setEndPromptOpen(false);
    setExtending(false);
    setPhase('underway');
  };

  // Consume initialSession from Knock one out / Triage → Do now. Only
  // triggers from 'home' — never disrupts a live session. Calls the same
  // startQuickstart path so the source (dump vs freeform) is preserved
  // and Wrap-Done can still auto-drop the dump entry.
  useEffect(() => {
    if (!initialSession) return;
    if (phase !== 'home') return;
    startQuickstart(initialSession.label, initialSession.sizeMin, {
      dumpId: initialSession.dumpId,
      planId: initialSession.planId,
    });
    onConsumedInitialSession?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSession]);

  const endFromPrompt = () => {
    setEndPromptOpen(false);
    setOutcome('time-up');
    setPhase('wrap');
  };
  const keepGoing = () => {
    setEndPromptOpen(false);
    setExtending(true);
  };

  // ---------- Sub-view: Pick ----------

  const pickList = useMemo(() => {
    // Aged first (surfaced with a subtle badge), then the rest, deduped.
    const seen = new Set<string>();
    const out: (BrainDumpTask & { aged: boolean })[] = [];
    for (const t of agedDumpTasks) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push({ ...t, aged: true });
    }
    for (const t of unscheduledTasks) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push({ ...t, aged: false });
    }
    return out;
  }, [agedDumpTasks, unscheduledTasks]);

  // ---------- Render ----------

  if (phase === 'home') {
    // "Past" = everything that isn't in today's list. useUnderway already
    // sorts sessions newest-first, and todaysSessions is a filtered subset
    // of the same list.
    const todaysIds = new Set(todaysSessions.map((s) => s.id));
    const pastSessions = allSessions.filter((s) => !todaysIds.has(s.id));
    return (
      <HomePhase
        todaysSessions={todaysSessions}
        pastSessions={pastSessions}
        weekCount={weekCount}
        onStartNow={() => setPhase('quickstart')}
        onOpenStuck={() => setPhase('stuck')}
        onOpenFullSetup={() => setPhase('pick')}
        onDeleteSession={onDeleteSession}
      />
    );
  }

  if (phase === 'quickstart') {
    return (
      <QuickstartPhase
        recentLabels={recentTaskLabels}
        onBack={() => setPhase('home')}
        onGo={(label, sizeMin) => startQuickstart(label, sizeMin, { viaPreflight: true })}
      />
    );
  }

  if (phase === 'stuck') {
    return (
      <StuckPhase
        mantra={mantra}
        onSetMantra={onSetMantra}
        pinnedResources={pinnedResources}
        onAddPinnedResource={onAddPinnedResource}
        onDeletePinnedResource={onDeletePinnedResource}
        stuckPresets={stuckPresets}
        onAddStuckPreset={onAddStuckPreset}
        onUpdateStuckPreset={onUpdateStuckPreset}
        onDeleteStuckPreset={onDeleteStuckPreset}
        onResetStuckPresets={onResetStuckPresets}
        onBack={() => setPhase('home')}
        onGo={(label, sizeMin) => startQuickstart(label, sizeMin, { viaPreflight: true })}
      />
    );
  }

  if (phase === 'pick') {
    return (
      <PickPhase
        list={pickList}
        onBack={() => setPhase('home')}
        onPickDump={(t) => {
          setPicked({ label: t.label, source: 'dump', dumpId: t.id });
          setPhase('preflight');
        }}
        onPickFreeform={(label) => {
          setPicked({ label, source: 'freeform' });
          setPhase('preflight');
        }}
      />
    );
  }

  if (phase === 'preflight') {
    return (
      <PreflightPhase
        taskLabel={picked!.label}
        plan={plan}
        onPlanChange={(patch) => setPlan((p) => ({ ...p, ...patch }))}
        items={preflightItems}
        size={size}
        onSizeChange={(m) => setSize(m)}
        recentPlaces={recentPlaces}
        onAddItem={onAddPreflightItem}
        onUpdateItem={onUpdatePreflightItem}
        onDeleteItem={onDeletePreflightItem}
        onResetItems={onResetPreflightItems}
        onGround={onNavigateToGrounding}
        onBack={() => setPhase('home')}
        onStart={() => {
          if (size === null) setSize(15);
          startUnderway();
        }}
      />
    );
  }

  if (phase === 'underway') {
    return (
      <UnderwayPhase
        taskLabel={picked!.label}
        sizeMin={size!}
        remainingSec={remainingSec}
        progressFraction={progressFraction}
        elapsedMs={elapsedMs}
        sessionDurationMs={sessionDurationMs}
        extending={extending}
        endPromptOpen={endPromptOpen}
        onEnd={endFromPrompt}
        onKeepGoing={keepGoing}
        entries={entries}
        pendingCheckIn={pendingCheckIn}
        entryDraft={entryDraft}
        onEntryDraftChange={setEntryDraft}
        onSubmitEntry={submitEntry}
        onLogMood={logMood}
        onRemoveEntry={removeEntry}
        onCopyLog={copyLog}
        sessionStartMs={sessionStartMs}
        onBail={bail}
        onDone={markDone}
        onPartial={markPartial}
      />
    );
  }

  // phase === 'wrap'
  const totalSec = Math.floor(elapsedMs / 1000);
  return (
    <WrapPhase
      taskLabel={picked!.label}
      outcome={outcome!}
      totalSec={totalSec}
      entryCount={entries.length}
      nextMicrostep={nextMicrostep}
      onNextMicrostepChange={setNextMicrostep}
      wrapNote={wrapNote}
      onWrapNoteChange={setWrapNote}
      onFinish={finishAndReset}
      startedAt={sessionStartMs}
    />
  );
}

// ---------- Home ----------
//
// The EF/ADHD rescue front door. One giant "Start now" button and nothing
// else demanding a decision. Everything else on this screen is passive:
// a streak chip so you can see the shape of your week, and today's
// sessions so you have witness of what you already did today.
//
// Deliberately quiet: no notifications, no urgent-red, no ceremony. The
// hardest part of a session is starting it; the design of this screen
// is that "start" is a single action away, with defaults chosen for you.

function HomePhase({
  todaysSessions,
  pastSessions,
  weekCount,
  onStartNow,
  onOpenStuck,
  onOpenFullSetup,
  onDeleteSession,
}: {
  todaysSessions: UnderwaySession[];
  pastSessions: UnderwaySession[];  // sessions from before today
  weekCount: number;
  onStartNow: () => void;
  onOpenStuck: () => void;
  onOpenFullSetup: () => void;
  onDeleteSession: (id: string) => void;
}) {
  const [showAllPast, setShowAllPast] = useState(false);
  const visiblePast = showAllPast ? pastSessions : pastSessions.slice(0, 10);
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        <header className="text-center">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Underway</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            One tap. One task. The rest sorts itself out.
          </p>
        </header>

        <button
          onClick={onStartNow}
          className="w-full py-6 rounded-3xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md active:scale-[0.99] transition-transform"
        >
          <div className="text-3xl font-bold tracking-tight">Start now</div>
          <div className="text-[13px] font-medium text-indigo-100 mt-1">
            15 min · one thing · you can bail anytime
          </div>
        </button>

        {/* Stuck-mode entry point. Deliberately secondary to Start now, but
            prominent enough to be findable when overwhelmed. Uses emerald
            so it reads as help/growth rather than warning. The reminder
            the app externalizes (BA principle) lives inside this flow. */}
        <button
          onClick={onOpenStuck}
          className="w-full py-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-800 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100 flex items-center justify-center gap-2 transition-colors"
        >
          <span className="text-lg leading-none">🌱</span>
          <span className="font-semibold">Stuck?</span>
          <span className="text-[12px] text-emerald-800 dark:text-emerald-200">· start something small</span>
        </button>

        {/* Streak — visible progress fights the "was that even productive?" fog */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl px-3 py-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
              This week
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
              {weekCount}
            </div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
              {weekCount === 1 ? 'session' : 'sessions'}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl px-3 py-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Today
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
              {todaysSessions.length}
            </div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
              {todaysSessions.length === 1 ? 'session' : 'sessions'}
            </div>
          </div>
        </div>

        {/* Today's witness — what you already did today */}
        {todaysSessions.length > 0 && (
          <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
            <header className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
              Today's log · tap to review
            </header>
            <ul>
              {todaysSessions.map((s) => (
                <SessionRow key={s.id} session={s} onDelete={onDeleteSession} />
              ))}
            </ul>
          </section>
        )}

        {/* Past sessions — everything older than today, expandable to see
            the full journal + notes. Capped at 10 by default with a
            "Show all" toggle so history stays browsable but doesn't run
            the page long. */}
        {pastSessions.length > 0 && (
          <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
            <header className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 flex items-center justify-between">
              <span>Past sessions ({pastSessions.length})</span>
              {pastSessions.length > 10 && (
                <button
                  onClick={() => setShowAllPast((v) => !v)}
                  className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 dark:text-indigo-200 normal-case tracking-normal"
                >
                  {showAllPast ? 'Show fewer' : 'Show all'}
                </button>
              )}
            </header>
            <ul>
              {visiblePast.map((s) => (
                <SessionRow key={s.id} session={s} showDate onDelete={onDeleteSession} />
              ))}
            </ul>
          </section>
        )}

        {/* Escape hatch to the full ceremonial loop — quiet, not primary */}
        <button
          onClick={onOpenFullSetup}
          className="w-full text-[12px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 dark:text-gray-200 underline underline-offset-2"
        >
          Set up a full session (Pre-flight · Size · Wrap)
        </button>
      </div>
    </div>
  );
}

// ---------- SessionRow — expandable session detail ----------

function SessionRow({
  session,
  showDate = false,
  onDelete,
}: {
  session: UnderwaySession;
  showDate?: boolean;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const s = session;
  const startMs = new Date(s.startedAt).getTime();
  const dateStr = new Date(s.startedAt).toLocaleDateString([], {
    month: 'short', day: 'numeric',
  });
  const timeStr = new Date(s.startedAt).toLocaleTimeString([], {
    hour: 'numeric', minute: '2-digit',
  });

  const copyLog = async () => {
    try {
      await navigator.clipboard.writeText(formatSessionMarkdown(s));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission — silently ignore.
    }
  };

  const confirmDelete = () => {
    if (confirm(`Delete this session (${s.taskLabel})? This can't be undone.`)) {
      onDelete(s.id);
    }
  };

  return (
    <li className="border-b border-gray-100 dark:border-gray-800 last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-950"
      >
        <div className="flex items-center gap-2">
          <OutcomeDot outcome={s.outcome} />
          <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">
            {s.taskLabel}
          </span>
          {s.entries && s.entries.length > 0 && (
            <span
              className="text-[10px] text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-full px-1.5 py-0.5 tabular-nums"
              title={`${s.entries.length} journal ${s.entries.length === 1 ? 'entry' : 'entries'}`}
            >
              📓 {s.entries.length}
            </span>
          )}
          <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
            {showDate ? `${dateStr}·${s.sizeMin}m` : `${s.sizeMin}m`}
          </span>
          <span className={`text-gray-300 dark:text-gray-600 text-xs transition-transform ${open ? 'rotate-90' : ''}`}>
            ▶
          </span>
        </div>
        {s.note && !open && (
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 pl-4 truncate">{s.note}</div>
        )}
      </button>

      {open && (
        <div className="px-4 pb-3 pt-1 space-y-2 bg-gray-50/60 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
            <span>
              {timeStr} · {formatMMSS(s.durationSec)} elapsed · {s.outcome}
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={copyLog}
                className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 dark:text-indigo-200"
                title="Copy full log as markdown"
              >
                {copied ? '✓ copied' : '⧉ copy log'}
              </button>
              <button
                onClick={confirmDelete}
                className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 hover:text-red-500 dark:text-red-400"
                title="Delete session"
              >
                delete
              </button>
            </div>
          </div>

          {s.note && (
            <div className="text-[12px] text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-2.5 py-1.5">
              <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 mr-1">
                Reflection:
              </span>
              {s.note}
            </div>
          )}
          {s.nextMicrostep && (
            <div className="text-[12px] text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-2.5 py-1.5">
              <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 mr-1">
                Next microstep:
              </span>
              {s.nextMicrostep}
            </div>
          )}

          {s.entries && s.entries.length > 0 ? (
            <ul className="space-y-1 pt-1">
              {s.entries.map((e) => {
                const t = new Date(startMs + e.atMs).toLocaleTimeString([], {
                  hour: 'numeric', minute: '2-digit',
                });
                return (
                  <li key={e.id} className="flex items-start gap-2 text-[12px] leading-relaxed">
                    <span className="text-gray-400 dark:text-gray-500 tabular-nums font-mono whitespace-nowrap pt-0.5">
                      {t}
                    </span>
                    {e.emotion && (
                      <span className="text-sm leading-none pt-0.5" aria-hidden>{e.emotion}</span>
                    )}
                    <span className="flex-1 min-w-0 text-gray-800 dark:text-gray-200 break-words">
                      <LinkifiedText text={e.text} />
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="text-[11px] text-gray-400 dark:text-gray-500 italic pt-1">
              No journal entries were logged during this session.
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function OutcomeDot({ outcome }: { outcome: UnderwayOutcome }) {
  const color =
    outcome === 'done'    ? 'bg-emerald-500' :
    outcome === 'partial' ? 'bg-indigo-500'  :
    outcome === 'bailed'  ? 'bg-slate-400'   :
                            'bg-sky-500';
  return <span className={`w-2 h-2 rounded-full ${color}`} aria-hidden />;
}

// ---------- Quickstart ----------
//
// One text field, one pace, one GO button. Skips Pre-flight and the Size
// picker screen. Autofocuses the text field so a screen reader / keyboard
// user can just start typing. Recent-labels chips let repeat tasks
// become a zero-typing start.
//
// Intentional non-features: no 3-2-1 countdown (triggers performance
// anxiety in EF brains — the whole point of Underway is to be low-stakes
// to start), no "are you sure?", no confirmation modal.

function QuickstartPhase({
  recentLabels,
  onBack,
  onGo,
}: {
  recentLabels: string[];
  onBack: () => void;
  onGo: (label: string, sizeMin: 2 | 15 | 60) => void;
}) {
  const [label, setLabel] = useState('');
  const [sizeMin, setSizeMin] = useState<2 | 15 | 60>(15);

  const canGo = label.trim().length > 0;
  const go = () => {
    if (!canGo) return;
    onGo(label.trim(), sizeMin);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        <header className="text-center">
          <button
            onClick={onBack}
            className="text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 dark:text-gray-200 mb-1"
          >
            ← Back
          </button>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Start now</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            What are you doing? Any answer works.
          </p>
        </header>

        <input
          autoFocus
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canGo) {
              e.preventDefault();
              go();
            }
          }}
          placeholder="e.g. reply to that email"
          className="w-full px-4 py-4 text-base border border-gray-200 dark:border-gray-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white dark:bg-gray-900"
        />

        {recentLabels.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 mb-1.5">
              Recent
            </div>
            <div className="flex flex-wrap gap-1.5">
              {recentLabels.map((r) => (
                <button
                  key={r}
                  onClick={() => setLabel(r)}
                  className="px-2.5 py-1 text-[12px] rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-indigo-400 dark:hover:border-indigo-600 hover:bg-indigo-50/40 text-gray-700 dark:text-gray-300"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 mb-1.5">
            How long?
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {([2, 15, 60] as const).map((m) => {
              const active = sizeMin === m;
              return (
                <button
                  key={m}
                  onClick={() => setSizeMin(m)}
                  className={`py-3 rounded-xl text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:border-indigo-400 dark:hover:border-indigo-600'
                  }`}
                >
                  {m} min
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={go}
          disabled={!canGo}
          className="w-full py-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 dark:bg-gray-700 disabled:cursor-not-allowed text-white text-2xl font-bold tracking-tight transition-colors"
        >
          Go
        </button>

        <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
          No countdown, no ceremony. The timer starts the moment you tap Go.
        </p>
      </div>
    </div>
  );
}

// ---------- Stuck ----------
//
// Behavioral-activation front door. Opens when the user taps "Stuck?"
// from Home. The screen is a two-part answer to the exact problem the
// overwhelmed brain has:
//   1. It shows a persistent, user-editable BA reminder ("mantra") at
//      the top — the app remembering the principle so you don't have
//      to hold it in working memory when you can't.
//   2. It offers a low-friction path into a small session: preset
//      chips for common tiny actions (mastery / pleasure / values
//      buckets from BA research), a single input, and a size picker
//      biased toward 2 min.
//
// Copy is deliberately warm and non-shaming. Overwhelm is not a moral
// failure; noticing you're overwhelmed is the first BA action.

function StuckPhase({
  mantra,
  onSetMantra,
  pinnedResources,
  onAddPinnedResource,
  onDeletePinnedResource,
  stuckPresets,
  onAddStuckPreset,
  onUpdateStuckPreset,
  onDeleteStuckPreset,
  onResetStuckPresets,
  onBack,
  onGo,
}: {
  mantra: string;
  onSetMantra: (m: string) => void;
  pinnedResources: UnderwayPinnedResource[];
  onAddPinnedResource: (input: { label: string; url: string; emoji?: string }) => UnderwayPinnedResource | null;
  onDeletePinnedResource: (id: string) => void;
  stuckPresets: StuckPreset[];
  onAddStuckPreset: (input: { emoji?: string; label: string }) => StuckPreset | null;
  onUpdateStuckPreset: (id: string, updates: { emoji?: string; label?: string }) => void;
  onDeleteStuckPreset: (id: string) => void;
  onResetStuckPresets: () => void;
  onBack: () => void;
  onGo: (label: string, sizeMin: 2 | 15 | 60) => void;
}) {
  const [label, setLabel] = useState('');
  const [sizeMin, setSizeMin] = useState<2 | 15 | 60>(2);
  const [editing, setEditing] = useState(false);
  const [mantraDraft, setMantraDraft] = useState(mantra);
  // Pinned-resources UI state — inline add form, edit mode toggles the
  // per-chip × so accidental removals stay unlikely.
  const [addingResource, setAddingResource] = useState(false);
  const [pinsEditMode, setPinsEditMode] = useState(false);
  const [pinLabel, setPinLabel] = useState('');
  const [pinUrl, setPinUrl] = useState('');
  const savePin = () => {
    if (!pinLabel.trim() || !pinUrl.trim()) return;
    onAddPinnedResource({ label: pinLabel.trim(), url: pinUrl.trim() });
    setPinLabel('');
    setPinUrl('');
    setAddingResource(false);
  };
  const cancelPin = () => {
    setPinLabel('');
    setPinUrl('');
    setAddingResource(false);
  };

  // Preset editing — mirrors the pinned-resources pattern: an edit
  // toggle reveals per-chip delete, and tapping a chip while editing
  // opens it for rename instead of selecting it.
  const [presetsEditMode, setPresetsEditMode] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [addingPreset, setAddingPreset] = useState(false);

  const canGo = label.trim().length > 0;
  const go = () => {
    if (!canGo) return;
    onGo(label.trim(), sizeMin);
  };
  const saveMantra = () => {
    onSetMantra(mantraDraft);
    setEditing(false);
  };
  const revertMantra = () => {
    setMantraDraft(mantra);
    setEditing(false);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        <header className="text-center">
          <button
            onClick={onBack}
            className="text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 dark:text-gray-200 mb-1"
          >
            ← Back
          </button>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Stuck</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Noticing this is the first step. That already counts.
          </p>
        </header>

        {/* Mantra card — external memory of the BA principle. Shown
            large, editable, front-and-center. This is the piece the
            user asked for: the app remembers the solution so they
            don't have to. */}
        <section className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-800 dark:text-emerald-200">
              Remember
            </div>
            {!editing ? (
              <button
                onClick={() => { setMantraDraft(mantra); setEditing(true); }}
                className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-100 dark:text-emerald-100"
              >
                ✏️ edit
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={revertMantra}
                  className="text-[11px] text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-100 dark:text-emerald-100"
                >
                  cancel
                </button>
                <button
                  onClick={saveMantra}
                  className="text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-2 py-0.5 rounded"
                >
                  save
                </button>
              </div>
            )}
          </div>
          {!editing ? (
            <p className="text-[14px] leading-relaxed text-emerald-900 dark:text-emerald-100 font-medium">
              {mantra}
            </p>
          ) : (
            <textarea
              autoFocus
              value={mantraDraft}
              onChange={(e) => setMantraDraft(e.target.value)}
              rows={3}
              placeholder="Write yourself a line you want to hear when you're overwhelmed."
              className="w-full px-3 py-2 text-sm border border-emerald-300 dark:border-emerald-700 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 text-emerald-900 dark:text-emerald-100"
            />
          )}
        </section>

        {/* Pinned resources — a curated kit of go-to links the user set up
            for their overwhelmed self. Pep-talk YouTube, favorite article
            PDF, a document of North Stars, whatever helps them re-enter.
            Auto-detected icons keep the Add form to two fields. */}
        <section>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
              Pinned resources
            </div>
            {pinnedResources.length > 0 && (
              <button
                onClick={() => setPinsEditMode((v) => !v)}
                className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 dark:text-gray-200"
              >
                {pinsEditMode ? 'done' : 'edit'}
              </button>
            )}
          </div>

          {pinnedResources.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {pinnedResources.map((r) => (
                <span key={r.id} className="relative inline-flex">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl hover:border-emerald-300 dark:hover:border-emerald-700 dark:border-emerald-700 hover:bg-emerald-50/40 max-w-full"
                    title={r.url}
                  >
                    <span className="text-sm leading-none">{r.emoji || '🔗'}</span>
                    <span className="truncate max-w-[10rem]">{r.label}</span>
                  </a>
                  {pinsEditMode && (
                    <button
                      onClick={() => onDeletePinnedResource(r.id)}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] leading-none flex items-center justify-center hover:bg-red-600"
                      title="Remove"
                      aria-label={`Remove ${r.label}`}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              {!addingResource && !pinsEditMode && (
                <button
                  onClick={() => setAddingResource(true)}
                  className="px-3 py-2 text-[12px] font-semibold text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl hover:border-emerald-400 dark:hover:border-emerald-600 hover:text-emerald-700 dark:hover:text-emerald-300 dark:text-emerald-300"
                >
                  + add
                </button>
              )}
            </div>
          )}

          {pinnedResources.length === 0 && !addingResource && (
            <button
              onClick={() => setAddingResource(true)}
              className="w-full py-3 text-[12px] text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl hover:border-emerald-400 dark:hover:border-emerald-600 hover:text-emerald-700 dark:hover:text-emerald-300 dark:text-emerald-300"
            >
              + Pin a resource — pep talk, PDF, doc, anything you'll want when overwhelmed
            </button>
          )}

          {addingResource && (
            <div className="space-y-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3">
              <input
                autoFocus
                type="text"
                value={pinLabel}
                onChange={(e) => setPinLabel(e.target.value)}
                placeholder='Label (e.g. "5-min pep talk")'
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <input
                type="url"
                value={pinUrl}
                onChange={(e) => setPinUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); savePin(); } }}
                placeholder="https://…"
                className="w-full px-3 py-2 text-sm font-mono border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={cancelPin}
                  className="px-2 py-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 dark:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={savePin}
                  disabled={!pinLabel.trim() || !pinUrl.trim()}
                  className="px-3 py-1.5 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-40"
                >
                  Save
                </button>
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                Icon is chosen automatically: 🎥 YouTube · 📄 PDF · 🎵 music · 📝 Google Doc · 📓 Notion · 🔗 other.
              </p>
            </div>
          )}
        </section>

        {/* Task input — freeform first, chips below for zero-typing. */}
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 mb-1.5">
            What's the smallest step?
          </div>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canGo) {
                e.preventDefault();
                go();
              }
            }}
            placeholder="Any small thing counts"
            className="w-full px-4 py-3 text-base border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white dark:bg-gray-900"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
              Or pick one
            </div>
            <button
              onClick={() => {
                setPresetsEditMode((v) => !v);
                setEditingPresetId(null);
                setAddingPreset(false);
              }}
              className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              {presetsEditMode ? 'done' : 'edit'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {stuckPresets.map((p) => {
              const taskText = p.task || p.label;
              if (presetsEditMode && editingPresetId === p.id) {
                return (
                  <StuckPresetForm
                    key={p.id}
                    initial={p}
                    onCancel={() => setEditingPresetId(null)}
                    onSave={(emoji, newLabel) => {
                      onUpdateStuckPreset(p.id, { emoji, label: newLabel });
                      setEditingPresetId(null);
                    }}
                  />
                );
              }
              return (
                <span key={p.id} className="relative inline-flex">
                  <button
                    onClick={() => {
                      if (presetsEditMode) setEditingPresetId(p.id);
                      else setLabel(taskText);
                    }}
                    className={`w-full flex items-center gap-1.5 px-3 py-2 text-[12px] rounded-xl border transition-colors ${
                      !presetsEditMode && label === taskText
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-100 font-semibold'
                        : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/30'
                    }`}
                    title={presetsEditMode ? `Rename "${p.label}"` : taskText}
                  >
                    <span className="text-sm leading-none">{p.emoji}</span>
                    <span className="text-left truncate">{p.label}</span>
                    {presetsEditMode && (
                      <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">✏️</span>
                    )}
                  </button>
                  {presetsEditMode && (
                    <button
                      onClick={() => onDeleteStuckPreset(p.id)}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] leading-none flex items-center justify-center hover:bg-red-600"
                      title="Remove"
                      aria-label={`Remove ${p.label}`}
                    >
                      ×
                    </button>
                  )}
                </span>
              );
            })}

            {addingPreset && (
              <StuckPresetForm
                onCancel={() => setAddingPreset(false)}
                onSave={(emoji, newLabel) => {
                  onAddStuckPreset({ emoji, label: newLabel });
                  setAddingPreset(false);
                }}
              />
            )}

            {!addingPreset && (
              <button
                onClick={() => { setAddingPreset(true); setEditingPresetId(null); }}
                className="flex items-center justify-center gap-1 px-3 py-2 text-[12px] font-semibold rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-emerald-400 dark:hover:border-emerald-600 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
              >
                + add your own
              </button>
            )}
          </div>

          {presetsEditMode && (
            <button
              onClick={onResetStuckPresets}
              className="mt-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              title="Restore the six starting chips"
            >
              ↺ reset to defaults
            </button>
          )}

          {stuckPresets.length === 0 && !addingPreset && (
            <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
              No chips left. Add your own above, or reset to the defaults.
            </p>
          )}
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 mb-1.5">
            How long?
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {([2, 15, 60] as const).map((m) => {
              const active = sizeMin === m;
              return (
                <button
                  key={m}
                  onClick={() => setSizeMin(m)}
                  className={`py-3 rounded-xl text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:border-emerald-400 dark:hover:border-emerald-600'
                  }`}
                >
                  {m} min
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
            2 minutes is the default when stuck. It's short enough that starting is free.
          </p>
        </div>

        <button
          onClick={go}
          disabled={!canGo}
          className="w-full py-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 dark:bg-gray-700 disabled:cursor-not-allowed text-white text-2xl font-bold tracking-tight transition-colors"
        >
          Go
        </button>
      </div>
    </div>
  );
}

// Inline add/rename form for a Stuck chip. Occupies one grid cell so
// the layout doesn't jump when it opens. Two fields only — an emoji and
// the label — because anything longer is friction on a surface whose
// whole job is to be frictionless.
function StuckPresetForm({
  initial,
  onCancel,
  onSave,
}: {
  initial?: StuckPreset;
  onCancel: () => void;
  onSave: (emoji: string, label: string) => void;
}) {
  const [emoji, setEmoji] = useState(initial?.emoji || '');
  const [label, setLabel] = useState(initial?.label || '');
  const canSave = label.trim().length > 0;
  const save = () => {
    if (!canSave) return;
    onSave(emoji.trim(), label.trim());
  };
  return (
    <div className="col-span-2 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-900 p-2 space-y-1.5">
      <div className="flex gap-1.5">
        <input
          type="text"
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          placeholder="🎧"
          aria-label="Emoji"
          maxLength={4}
          className="w-12 flex-shrink-0 px-2 py-1.5 text-center text-[14px] border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
        <input
          autoFocus
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); save(); }
            else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          }}
          placeholder="Turn on my lecture video"
          aria-label="Chip label"
          className="flex-1 min-w-0 px-2 py-1.5 text-[13px] border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-2 py-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={!canSave}
          className="px-3 py-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-40"
        >
          {initial ? 'Save' : 'Add'}
        </button>
      </div>
    </div>
  );
}

// ---------- Pick ----------

function PickPhase({
  list,
  onBack,
  onPickDump,
  onPickFreeform,
}: {
  list: (BrainDumpTask & { aged: boolean })[];
  onBack: () => void;
  onPickDump: (t: BrainDumpTask) => void;
  onPickFreeform: (label: string) => void;
}) {
  const [freeform, setFreeform] = useState('');
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        <header className="text-center">
          <button
            onClick={onBack}
            className="text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 dark:text-gray-200 mb-1"
          >
            ← Back
          </button>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Underway</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Pick one thing. Not three, not the whole list. One.
          </p>
        </header>

        <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 space-y-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
            One thing right now
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={freeform}
              onChange={(e) => setFreeform(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && freeform.trim()) {
                  onPickFreeform(freeform.trim());
                }
              }}
              placeholder="e.g. reply to that email"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              onClick={() => freeform.trim() && onPickFreeform(freeform.trim())}
              disabled={!freeform.trim()}
              className="px-3 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Pick
            </button>
          </div>
        </section>

        {list.length > 0 && (
          <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
            <header className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
              From your hold ({list.length})
            </header>
            <ul>
              {list.map((t) => (
                <li key={t.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <button
                    onClick={() => onPickDump(t)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-950"
                  >
                    <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">{t.label}</span>
                    {t.aged && (
                      <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-full px-2 py-0.5">
                        aged
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {list.length === 0 && (
          <div className="text-center text-sm text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl bg-white dark:bg-gray-900 py-8 px-4">
            No held tasks. Type one above to get started.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Pre-flight ----------

function PreflightPhase({
  taskLabel,
  plan,
  onPlanChange,
  items,
  size,
  onSizeChange,
  recentPlaces,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onResetItems,
  onGround,
  onBack,
  onStart,
}: {
  taskLabel: string;
  plan: SessionPlan;
  onPlanChange: (patch: Partial<SessionPlan>) => void;
  items: PreflightItem[];
  size: SizeMinutes | null;
  onSizeChange: (m: SizeMinutes) => void;
  recentPlaces: string[];
  onAddItem: (input: { emoji?: string; label: string }) => PreflightItem | null;
  onUpdateItem: (id: string, updates: { emoji?: string; label?: string }) => void;
  onDeleteItem: (id: string) => void;
  onResetItems: () => void;
  onGround: () => void;
  onBack: () => void;
  onStart: () => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customMin, setCustomMin] = useState('');

  const checkedCount = items.filter((i) => plan.done[i.id]).length;
  const chosen = size ?? 15;

  const commitCustom = () => {
    const n = Math.round(Number(customMin));
    if (!Number.isFinite(n) || n < 1) return;
    onSizeChange(Math.min(n, MAX_SESSION_MIN));
    setCustomOpen(false);
    setCustomMin('');
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        <header className="text-center">
          <button
            onClick={onBack}
            className="text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mb-1"
          >
            ← Back
          </button>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Pre-flight</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Decide it here so you don't have to decide it later. Nothing below blocks Start.
          </p>
        </header>

        <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl px-3 py-2 text-center">
          <div className="text-[10px] uppercase tracking-wider font-bold text-indigo-700 dark:text-indigo-300">
            The one task
          </div>
          <div className="text-sm font-semibold text-indigo-900 dark:text-indigo-100 mt-0.5">{taskLabel}</div>
        </div>

        {/* ---- The plan. These three fields carry the evidence; the
             checklist below is the optional half. ---- */}
        <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-3 space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 mb-1">
              Where
            </label>
            <input
              type="text"
              value={plan.place}
              onChange={(e) => onPlanChange({ place: e.target.value })}
              placeholder="Library, 3rd floor — the far desk"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {recentPlaces.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {recentPlaces.map((pl) => (
                  <button
                    key={pl}
                    onClick={() => onPlanChange({ place: pl })}
                    className="px-2 py-0.5 text-[10px] rounded-full border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:border-indigo-400 dark:hover:border-indigo-600 hover:text-indigo-700 dark:hover:text-indigo-300 max-w-[12rem] truncate"
                    title={`You've worked here before: ${pl}`}
                  >
                    {pl}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 flex-shrink-0">
              Leave by
            </label>
            <input
              type="time"
              value={plan.leaveBy}
              onChange={(e) => onPlanChange({ leaveBy: e.target.value })}
              className="px-2 py-1.5 text-[12px] border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 tabular-nums"
            />
            {plan.leaveBy && (
              <button
                onClick={() => onPlanChange({ leaveBy: '' })}
                className="text-[11px] text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                clear
              </button>
            )}
            <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto text-right">
              the commute counts
            </span>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 mb-1">
              If … then …
            </label>
            <input
              type="text"
              value={plan.ifThen}
              onChange={(e) => onPlanChange({ ifThen: e.target.value })}
              placeholder="If I reach for my phone, then I put it in my bag"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">
              Name the derailer you actually expect. If-then plans are the part of
              this screen with real evidence behind them.
            </p>
          </div>
        </section>

        {/* ---- How long, presets + custom ---- */}
        <section>
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 mb-1.5">
            How long?
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {SIZE_PRESETS.map((m) => (
              <button
                key={m}
                onClick={() => { onSizeChange(m); setCustomOpen(false); }}
                title={SIZE_HINTS[m] ?? `${m} minutes`}
                className={`py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  chosen === m && !customOpen
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:border-indigo-400 dark:hover:border-indigo-600'
                }`}
              >
                {m} min
              </button>
            ))}
          </div>
          {customOpen ? (
            <div className="flex gap-1.5 mt-1.5">
              <input
                autoFocus
                type="number"
                min={1}
                max={MAX_SESSION_MIN}
                value={customMin}
                onChange={(e) => setCustomMin(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitCustom(); }
                  else if (e.key === 'Escape') { e.preventDefault(); setCustomOpen(false); }
                }}
                placeholder="minutes"
                aria-label="Custom minutes"
                className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 tabular-nums"
              />
              <button
                onClick={commitCustom}
                className="px-3 py-1.5 text-[12px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
              >
                Set
              </button>
              <button
                onClick={() => setCustomOpen(false)}
                className="px-2 text-[12px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setCustomOpen(true); setCustomMin(String(chosen)); }}
              className="mt-1.5 w-full py-1.5 text-[11px] font-semibold rounded-lg border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-indigo-400 dark:hover:border-indigo-600 hover:text-indigo-700 dark:hover:text-indigo-300"
            >
              {SIZE_PRESETS.includes(chosen as typeof SIZE_PRESETS[number])
                ? '＋ custom length'
                : `custom: ${chosen} min — tap to change`}
            </button>
          )}
        </section>

        {/* ---- The ritual checklist ---- */}
        <section>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
              Set up the room
            </div>
            <button
              onClick={() => { setEditMode((v) => !v); setEditingId(null); setAdding(false); }}
              className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              {editMode ? 'done' : 'edit'}
            </button>
          </div>

          <div className="space-y-1.5">
            {items.map((item) => {
              if (editMode && editingId === item.id) {
                return (
                  <StuckPresetForm
                    key={item.id}
                    initial={{ id: item.id, emoji: item.emoji, label: item.label }}
                    onCancel={() => setEditingId(null)}
                    onSave={(emoji, label) => {
                      onUpdateItem(item.id, { emoji, label });
                      setEditingId(null);
                    }}
                  />
                );
              }
              const on = !!plan.done[item.id];
              return (
                <div key={item.id} className="relative">
                  <button
                    onClick={() => {
                      if (editMode) setEditingId(item.id);
                      else onPlanChange({ done: { ...plan.done, [item.id]: !on } });
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors text-left ${
                      on && !editMode
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                        : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                        on && !editMode
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-gray-300 dark:border-gray-700'
                      }`}
                    >
                      {on && !editMode && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <span className="text-sm leading-none flex-shrink-0">{item.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold ${on && !editMode ? 'text-emerald-900 dark:text-emerald-100' : 'text-gray-800 dark:text-gray-200'}`}>
                        {item.label}
                      </div>
                      {item.hint && (
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{item.hint}</div>
                      )}
                    </div>
                    {editMode && <span className="text-[10px] text-gray-400 dark:text-gray-500">✏️</span>}
                  </button>
                  {editMode && (
                    <button
                      onClick={() => onDeleteItem(item.id)}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] leading-none flex items-center justify-center hover:bg-red-600"
                      title="Remove"
                      aria-label={`Remove ${item.label}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}

            {adding && (
              <StuckPresetForm
                onCancel={() => setAdding(false)}
                onSave={(emoji, label) => {
                  onAddItem({ emoji, label });
                  setAdding(false);
                }}
              />
            )}
            {!adding && (
              <button
                onClick={() => { setAdding(true); setEditingId(null); }}
                className="w-full py-2 text-[12px] font-semibold rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-indigo-400 dark:hover:border-indigo-600 hover:text-indigo-700 dark:hover:text-indigo-300"
              >
                + add a step
              </button>
            )}
          </div>

          {editMode && (
            <button
              onClick={onResetItems}
              className="mt-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              ↺ reset to defaults
            </button>
          )}

          <button
            onClick={onGround}
            className="mt-2 w-full text-[12px] text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-indigo-100 underline underline-offset-2"
          >
            → Wound up? Do a few minutes of Grounding first
          </button>
        </section>

        <div className="space-y-2 pb-2">
          <button
            onClick={onStart}
            className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xl font-bold tracking-tight transition-colors"
          >
            Start — {chosen} min
          </button>
          <p className="text-[11px] text-center text-gray-400 dark:text-gray-500">
            {checkedCount === 0
              ? "Nothing ticked is fine — the plan above is the part that matters."
              : `${checkedCount}/${items.length} set up`}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------- Size ----------

// ---------- Underway (the focus screen) ----------

function UnderwayPhase({
  taskLabel,
  sizeMin,
  remainingSec,
  progressFraction,
  elapsedMs,
  sessionDurationMs,
  extending,
  endPromptOpen,
  onEnd,
  onKeepGoing,
  entries,
  pendingCheckIn,
  entryDraft,
  onEntryDraftChange,
  onSubmitEntry,
  onLogMood,
  onRemoveEntry,
  onCopyLog,
  sessionStartMs,
  onBail,
  onDone,
  onPartial,
}: {
  taskLabel: string;
  sizeMin: SizeMinutes;
  remainingSec: number;
  progressFraction: number;
  elapsedMs: number;
  sessionDurationMs: number;
  extending: boolean;
  endPromptOpen: boolean;
  onEnd: () => void;
  onKeepGoing: () => void;
  entries: JournalEntry[];
  pendingCheckIn: boolean;
  entryDraft: string;
  onEntryDraftChange: (s: string) => void;
  onSubmitEntry: () => void;
  onLogMood: (emoji: string, label: string) => void;
  onRemoveEntry: (id: string) => void;
  onCopyLog: () => void;
  sessionStartMs: number | null;
  onBail: () => void;
  onDone: () => void;
  onPartial: () => void;
}) {
  const RADIUS = 42;
  const CIRC = 2 * Math.PI * RADIUS;

  // Overtime = past the committed size and we've committed to keep going
  // (or the end prompt is currently sitting open).
  const isOvertime = elapsedMs >= sessionDurationMs;
  const overtimeSec = Math.max(0, Math.floor((elapsedMs - sessionDurationMs) / 1000));

  // Ring stays full in overtime and shifts color from indigo → sky so the
  // change of mode is felt without being alarming.
  const dashOffset = isOvertime ? 0 : CIRC * (1 - progressFraction);
  const ringColor = extending ? '#0ea5e9' : '#4f46e5';
  const numberColor = extending ? 'text-sky-700 dark:text-sky-300' : 'text-gray-900 dark:text-gray-100';

  // Auto-collect URLs from all entries for the compact links strip.
  // Deduped, capped so the strip never dominates the layout.
  const collectedLinks = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const e of entries) {
      for (const u of extractUrls(e.text)) {
        if (seen.has(u)) continue;
        seen.add(u);
        out.push(u);
        if (out.length >= 8) return out;
      }
    }
    return out;
  }, [entries]);

  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    await onCopyLog();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Journal stream is collapsed by default — it stays a scratchpad you
  // reach for, not a wall of text competing for attention. Input + mood
  // chips remain visible so quick capture is still one tap.
  const [showStream, setShowStream] = useState(false);

  // Hide the timer ring. A visible countdown is the point for time
  // blindness, but it works against you in a split-screen setup where
  // it sits in your peripheral vision all session. Hiding is purely
  // visual — the session keeps running, check-ins still fire, and the
  // time's-up prompt still appears — so nothing is lost by looking away.
  // Persisted per device: this is a property of how you work, not of
  // one session.
  const [timerHidden, setTimerHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem('setatime.underway.hideTimer') === 'true';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('setatime.underway.hideTimer', String(timerHidden));
    } catch {
      // storage unavailable — non-fatal
    }
  }, [timerHidden]);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="max-w-md mx-auto px-4 py-5 space-y-4">
        {/* Task banner — compact, gives the timer + stream more room */}
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
              Right now
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-snug truncate">
              {taskLabel}
            </h2>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={() => setTimerHidden((v) => !v)}
              className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 hover:text-indigo-700 dark:hover:text-indigo-300 whitespace-nowrap"
              title={
                timerHidden
                  ? 'Show the timer — the session has been running either way'
                  : 'Hide the timer — useful in split screen; the session keeps running'
              }
              aria-pressed={timerHidden}
            >
              {timerHidden ? '👁 show timer' : '🙈 hide timer'}
            </button>
            <button
              onClick={doCopy}
              className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 dark:text-indigo-200 whitespace-nowrap"
              title="Copy session log as markdown"
            >
              {copied ? '✓ copied' : '⧉ copy log'}
            </button>
          </div>
        </div>

        {/* Timer ring — big and visceral. Time blindness needs BIG.
            In overtime the ring stays full and re-tints sky; the center
            number switches to +MM:SS overtime with an "over N min"
            subtitle so the state change is obvious. */}
        {timerHidden ? (
          <button
            onClick={() => setTimerHidden(false)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 text-[12px] font-semibold text-gray-500 dark:text-gray-400 hover:border-indigo-400 dark:hover:border-indigo-600 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
            title="Show the timer"
          >
            <span aria-hidden="true">🙈</span>
            <span>Timer hidden · session running · tap to show</span>
          </button>
        ) : (
        <div className="relative w-56 h-56 sm:w-64 sm:h-64 mx-auto">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle
              cx="50" cy="50" r={RADIUS}
              fill="none" className="stroke-gray-200 dark:stroke-gray-800" strokeWidth="3"
            />
            <circle
              cx="50" cy="50" r={RADIUS}
              fill="none" stroke={ringColor} strokeWidth="3"
              strokeDasharray={CIRC}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 200ms linear, stroke 300ms linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`text-5xl sm:text-6xl font-bold tabular-nums leading-none ${numberColor}`}>
              {extending ? `+${formatMMSS(overtimeSec)}` : formatMMSS(remainingSec)}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-2">
              {extending ? `over ${sizeMin} min` : `of ${sizeMin} min`}
            </div>
          </div>
        </div>
        )}

        {/* End-of-time prompt — one-shot when the committed clock hits 0.
            Uses emerald not red so the tone stays affirming: hitting your
            committed time is a win, not an alarm. */}
        {endPromptOpen && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-2xl p-4 space-y-3">
            <div>
              <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                Time's up — end session?
              </div>
              <div className="text-[11px] text-emerald-800 dark:text-emerald-200 mt-1 leading-relaxed">
                You committed to {sizeMin} min and you're there. End cleanly,
                or keep going — the timer will count up as extension.
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onEnd}
                className="px-3 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700"
              >
                End
              </button>
              <button
                onClick={onKeepGoing}
                className="px-3 py-2.5 rounded-xl text-sm font-semibold text-emerald-800 dark:text-emerald-200 bg-white dark:bg-gray-900 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/40 dark:bg-emerald-950/40"
              >
                Keep going →
              </button>
            </div>
          </div>
        )}

        {/* Quiet extension banner — shown after the user chose Keep going
            so the timer state stays legible without re-prompting. */}
        {extending && !endPromptOpen && (
          <div className="text-[11px] text-sky-800 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-xl px-3 py-1.5 text-center">
            In extension — {formatMMSS(overtimeSec)} past {sizeMin} min. Done/Some/Bail whenever.
          </div>
        )}

        {/* Auto-collected links from journal entries — quick access to
            docs/tabs pasted while working. */}
        {collectedLinks.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 mb-1">
              Links from this session
            </div>
            <div className="flex flex-wrap gap-1.5">
              {collectedLinks.map((u) => (
                <a
                  key={u}
                  href={u}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-800 dark:bg-indigo-900/40 max-w-full truncate"
                  title={u}
                >
                  🔗 {tryHost(u)}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Interstitial input — always visible. Enter → log. Pending
            check-in shows a subtle amber banner ABOVE the input instead
            of a modal; input placeholder shifts too. */}
        {pendingCheckIn && (
          <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
            Check-in nudge — say one line (or tap a mood chip). Anything counts.
          </div>
        )}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 flex-1">
              Interstitial log
            </div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </div>
          </div>
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={entryDraft}
              onChange={(e) => onEntryDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && entryDraft.trim()) {
                  e.preventDefault();
                  onSubmitEntry();
                }
              }}
              placeholder={
                pendingCheckIn
                  ? 'What\'s happening right now?'
                  : 'Log a thought, feeling, next step, or paste a link…'
              }
              className={`flex-1 min-w-0 px-3 py-2.5 text-sm border rounded-xl bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 ${
                pendingCheckIn
                  ? 'border-amber-300 dark:border-amber-700 focus:ring-amber-400'
                  : 'border-gray-200 dark:border-gray-800 focus:ring-indigo-400'
              }`}
            />
            <button
              onClick={onSubmitEntry}
              disabled={!entryDraft.trim()}
              className="px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-40"
            >
              Log
            </button>
          </div>

          {/* Mood chips — one-tap emotion logging */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {MOOD_CHIPS.map((m) => (
              <button
                key={m.emoji}
                onClick={() => onLogMood(m.emoji, m.label)}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-full hover:border-indigo-300 dark:hover:border-indigo-700 dark:border-indigo-700 hover:bg-indigo-50/40"
              >
                <span className="text-sm leading-none">{m.emoji}</span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* The stream — collapsed by default. Tapping the chip reveals
            the full timestamped list; hidden state keeps the focus
            screen quiet. Cleaner default; captures still land in real
            time via the always-visible input. */}
        {entries.length > 0 && !showStream && (
          <button
            onClick={() => setShowStream(true)}
            className="w-full text-[11px] text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-indigo-100 dark:text-indigo-100 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 flex items-center justify-center gap-1.5"
          >
            <span>📓</span>
            <span className="font-semibold tabular-nums">{entries.length}</span>
            <span>{entries.length === 1 ? 'entry' : 'entries'} · tap to show</span>
          </button>
        )}
        {entries.length > 0 && showStream && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-2">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
                Stream
              </div>
              <button
                onClick={() => setShowStream(false)}
                className="text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 dark:text-gray-200"
              >
                hide
              </button>
            </div>
            <ul className="space-y-1">
              {entries.map((e) => (
                <li key={e.id} className="group flex items-start gap-2 text-[12px] leading-relaxed">
                  <span className="text-gray-400 dark:text-gray-500 tabular-nums font-mono whitespace-nowrap pt-0.5">
                    {sessionStartMs
                      ? new Date(sessionStartMs + e.atMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                      : formatMMSS(Math.floor(e.atMs / 1000))}
                  </span>
                  {e.emotion && (
                    <span className="text-sm leading-none pt-0.5" aria-hidden>{e.emotion}</span>
                  )}
                  <span className="flex-1 min-w-0 text-gray-800 dark:text-gray-200 break-words">
                    <LinkifiedText text={e.text} />
                  </span>
                  <button
                    onClick={() => onRemoveEntry(e.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:text-red-400 text-sm leading-none transition-opacity"
                    title="Remove"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action row — Done + Partial (both are ok) + Bail (always visible) */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <button
            onClick={onDone}
            className="px-3 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700"
          >
            Done
          </button>
          <button
            onClick={onPartial}
            className="px-3 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Some
          </button>
          <button
            onClick={onBail}
            className="px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 dark:border-gray-700"
          >
            Bail
          </button>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">
          The tether: bail is always here. Stopping cleanly still counts as showing up.
        </p>
      </div>
    </div>
  );
}

// ---------- Wrap ----------

function WrapPhase({
  taskLabel,
  outcome,
  totalSec,
  entryCount,
  nextMicrostep,
  onNextMicrostepChange,
  wrapNote,
  onWrapNoteChange,
  onFinish,
  startedAt,
}: {
  taskLabel: string;
  outcome: Outcome;
  totalSec: number;
  entryCount: number;
  nextMicrostep: string;
  onNextMicrostepChange: (s: string) => void;
  wrapNote: string;
  onWrapNoteChange: (s: string) => void;
  onFinish: () => void;
  startedAt: number | null;
}) {
  const OUTCOME_META: Record<Outcome, { label: string; sub: string; chip: string; }> = {
    'done':    { label: 'Done',          sub: 'Task shipped. Nice.',                        chip: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800' },
    'partial': { label: 'Some of it',    sub: 'You showed up. That counts.',                chip: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800'   },
    'bailed':  { label: 'Bailed cleanly',sub: 'Bailing was the plan; you used the tether.', chip: 'bg-slate-100 dark:bg-slate-900/40 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800'     },
    'time-up': { label: 'Time up',       sub: 'You ran the full session.',                  chip: 'bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-800'            },
  };
  const m = OUTCOME_META[outcome];
  const [showMore, setShowMore] = useState(false);
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        {/* Outcome chip is the primary artifact — big, colored, felt.
            The Wrap screen used to have five fields; that's a wall at the
            end when the person is already spent. One field + one button
            is enough. Everything else is expandable. */}
        <header className="text-center">
          <div className={`inline-block px-4 py-1.5 rounded-full text-sm font-semibold border ${m.chip}`}>
            {m.label}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{m.sub}</p>
          <div className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 mt-3">{taskLabel}</div>
        </header>

        {/* One-line reflection — the only required field */}
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 mb-1.5">
            One line — how did that go?
          </div>
          <input
            autoFocus
            type="text"
            value={wrapNote}
            onChange={(e) => onWrapNoteChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onFinish();
              }
            }}
            placeholder="Focused / scattered / surprisingly easy / hard start"
            className="w-full px-4 py-3 text-base border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white dark:bg-gray-900"
          />
        </div>

        <button
          onClick={onFinish}
          className="w-full py-4 rounded-2xl text-lg font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
        >
          {outcome === 'done' ? 'Finish — drop from hold' : 'Finish'}
        </button>

        {/* Everything else lives behind a soft disclosure so it can't wall
            you at the end. Time · check-ins · start time · next microstep. */}
        <button
          onClick={() => setShowMore((s) => !s)}
          className="w-full text-[12px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 dark:text-gray-200 underline underline-offset-2"
        >
          {showMore ? 'Hide details' : 'Add more (time · next step)'}
        </button>

        {showMore && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 text-center">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Time</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                  {formatMMSS(totalSec)}
                </div>
              </div>
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 text-center">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Log entries</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{entryCount}</div>
              </div>
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 text-center">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Started</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                  {startedAt
                    ? new Date(startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                    : '—'}
                </div>
              </div>
            </div>

            {outcome !== 'done' && (
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 mb-1">
                  Next microstep (optional)
                </div>
                <input
                  type="text"
                  value={nextMicrostep}
                  onChange={(e) => onNextMicrostepChange(e.target.value)}
                  placeholder="When you come back to this, start with…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white dark:bg-gray-900"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
