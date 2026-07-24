import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { BrainDumpTask, UnderwaySession, UnderwayOutcome, UnderwayJournalEntry } from '../types';

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

type Phase = 'home' | 'quickstart' | 'pick' | 'preflight' | 'size' | 'underway' | 'wrap';

type PickedTask = {
  label: string;
  source: 'dump' | 'freeform';
  dumpId?: string; // only present when source === 'dump'
};

type SizeMinutes = 2 | 15 | 60;
const SIZE_OPTIONS: {
  value: SizeMinutes;
  label: string;
  hint: string;
}[] = [
  { value: 2,  label: '2 min',  hint: 'Token move — just start' },
  { value: 15, label: '15 min', hint: 'Real start — one clean pass' },
  { value: 60, label: '60 min', hint: 'Deep push — settle in' },
];

// Simple, hardcoded rhythm. Body doubling doesn't need smart pacing.
function checkInMinutesFor(size: SizeMinutes): number[] {
  if (size === 2)  return [];
  if (size === 15) return [10];
  return [15, 30, 45];
}

type PreflightState = {
  caffeine: boolean;
  fed: boolean;
  slept: boolean;
  grounded: boolean;
};
const PREFLIGHT_ITEMS: {
  key: keyof PreflightState;
  label: string;
  hint: string;
}[] = [
  { key: 'caffeine', label: 'Caffeine',  hint: 'If you use it — has it landed?' },
  { key: 'fed',      label: 'Fed',       hint: 'Not hungry, not stuffed' },
  { key: 'slept',    label: 'Rested',    hint: 'Good sleep or a nap counts' },
  { key: 'grounded', label: 'Grounded',  hint: 'Nervous system settled' },
];

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
              className="text-indigo-700 underline underline-offset-2 hover:text-indigo-900 break-all"
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

interface UnderwayViewProps {
  agedDumpTasks: BrainDumpTask[];
  unscheduledTasks: BrainDumpTask[];
  onDeleteDumpTask: (id: string) => void;
  onNavigateToGrounding: () => void;
  todaysSessions: UnderwaySession[];
  weekCount: number;
  recentTaskLabels: string[];
  onAddSession: (input: Omit<UnderwaySession, 'id'>) => UnderwaySession;
}

export default function UnderwayView({
  agedDumpTasks,
  unscheduledTasks,
  onDeleteDumpTask,
  onNavigateToGrounding,
  todaysSessions,
  weekCount,
  recentTaskLabels,
  onAddSession,
}: UnderwayViewProps) {
  const [phase, setPhase] = useState<Phase>('home');
  const [picked, setPicked] = useState<PickedTask | null>(null);
  const [preflight, setPreflight] = useState<PreflightState>({
    caffeine: false, fed: false, slept: false, grounded: false,
  });
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

    // End of session — jump to wrap with time-up outcome.
    if (elapsedMs >= sessionDurationMs) {
      setOutcome('time-up');
      setPhase('wrap');
      return;
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
  }, [elapsedMs, phase, size, sessionDurationMs, checkInMinutes, entries, pendingCheckIn]);

  const resetAll = () => {
    setPhase('home');
    setPicked(null);
    setPreflight({ caffeine: false, fed: false, slept: false, grounded: false });
    setSize(null);
    setSessionStartMs(null);
    setElapsedMs(0);
    setEntryDraft('');
    setEntries([]);
    setPendingCheckIn(false);
    setOutcome(null);
    setNextMicrostep('');
    setWrapNote('');
  };

  const startUnderway = () => {
    setSessionStartMs(Date.now());
    setElapsedMs(0);
    setEntries([]);
    setPendingCheckIn(false);
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
    resetAll();
  };

  // Quickstart path — from Home, one task input + pace + go, then straight
  // to Underway. No Pre-flight, no Size picker screen, no ceremony.
  const startQuickstart = (label: string, sizeMin: 2 | 15 | 60) => {
    setPicked({ label, source: 'freeform' });
    setSize(sizeMin);
    setSessionStartMs(Date.now());
    setElapsedMs(0);
    setEntries([]);
    setPendingCheckIn(false);
    setPhase('underway');
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
    return (
      <HomePhase
        todaysSessions={todaysSessions}
        weekCount={weekCount}
        onStartNow={() => setPhase('quickstart')}
        onOpenFullSetup={() => setPhase('pick')}
      />
    );
  }

  if (phase === 'quickstart') {
    return (
      <QuickstartPhase
        recentLabels={recentTaskLabels}
        onBack={() => setPhase('home')}
        onGo={(label, sizeMin) => startQuickstart(label, sizeMin)}
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
        state={preflight}
        onToggle={(key) => setPreflight((p) => ({ ...p, [key]: !p[key] }))}
        onGround={onNavigateToGrounding}
        onBack={() => setPhase('pick')}
        onContinue={() => setPhase('size')}
      />
    );
  }

  if (phase === 'size') {
    return (
      <SizePhase
        taskLabel={picked!.label}
        onBack={() => setPhase('preflight')}
        onPick={(m) => {
          setSize(m);
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
  weekCount,
  onStartNow,
  onOpenFullSetup,
}: {
  todaysSessions: UnderwaySession[];
  weekCount: number;
  onStartNow: () => void;
  onOpenFullSetup: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        <header className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">Underway</h2>
          <p className="text-xs text-gray-500 mt-1">
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

        {/* Streak — visible progress fights the "was that even productive?" fog */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white border border-gray-200 rounded-2xl px-3 py-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-gray-500">
              This week
            </div>
            <div className="text-3xl font-bold text-gray-900 tabular-nums">
              {weekCount}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {weekCount === 1 ? 'session' : 'sessions'}
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl px-3 py-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-gray-500">
              Today
            </div>
            <div className="text-3xl font-bold text-gray-900 tabular-nums">
              {todaysSessions.length}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {todaysSessions.length === 1 ? 'session' : 'sessions'}
            </div>
          </div>
        </div>

        {/* Today's witness — what you already did today */}
        {todaysSessions.length > 0 && (
          <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <header className="px-4 py-2 border-b border-gray-100 text-[10px] uppercase tracking-wider font-bold text-gray-500">
              Today's log
            </header>
            <ul>
              {todaysSessions.slice(0, 5).map((s) => (
                <li key={s.id} className="px-4 py-2 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-2">
                    <OutcomeDot outcome={s.outcome} />
                    <span className="flex-1 text-sm text-gray-800 truncate">
                      {s.taskLabel}
                    </span>
                    {s.entries && s.entries.length > 0 && (
                      <span
                        className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-1.5 py-0.5 tabular-nums"
                        title={`${s.entries.length} journal ${s.entries.length === 1 ? 'entry' : 'entries'}`}
                      >
                        📓 {s.entries.length}
                      </span>
                    )}
                    <span className="text-[11px] text-gray-500 tabular-nums">
                      {s.sizeMin}m
                    </span>
                  </div>
                  {s.note && (
                    <div className="text-[11px] text-gray-500 mt-0.5 pl-4">{s.note}</div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Escape hatch to the full ceremonial loop — quiet, not primary */}
        <button
          onClick={onOpenFullSetup}
          className="w-full text-[12px] text-gray-500 hover:text-gray-800 underline underline-offset-2"
        >
          Set up a full session (Pre-flight · Size · Wrap)
        </button>
      </div>
    </div>
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
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        <header className="text-center">
          <button
            onClick={onBack}
            className="text-[11px] text-gray-500 hover:text-gray-800 mb-1"
          >
            ← Back
          </button>
          <h2 className="text-lg font-semibold text-gray-900">Start now</h2>
          <p className="text-xs text-gray-500 mt-1">
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
          className="w-full px-4 py-4 text-base border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        />

        {recentLabels.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1.5">
              Recent
            </div>
            <div className="flex flex-wrap gap-1.5">
              {recentLabels.map((r) => (
                <button
                  key={r}
                  onClick={() => setLabel(r)}
                  className="px-2.5 py-1 text-[12px] rounded-full bg-white border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/40 text-gray-700"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1.5">
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
                      : 'bg-white text-gray-700 border border-gray-200 hover:border-indigo-400'
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
          className="w-full py-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-2xl font-bold tracking-tight transition-colors"
        >
          Go
        </button>

        <p className="text-[11px] text-gray-400 text-center">
          No countdown, no ceremony. The timer starts the moment you tap Go.
        </p>
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
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        <header className="text-center">
          <button
            onClick={onBack}
            className="text-[11px] text-gray-500 hover:text-gray-800 mb-1"
          >
            ← Back
          </button>
          <h2 className="text-lg font-semibold text-gray-900">Underway</h2>
          <p className="text-xs text-gray-500 mt-1">
            Pick one thing. Not three, not the whole list. One.
          </p>
        </header>

        <section className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
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
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
          <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <header className="px-4 py-2 border-b border-gray-100 text-[10px] uppercase tracking-wider font-bold text-gray-500">
              From your hold ({list.length})
            </header>
            <ul>
              {list.map((t) => (
                <li key={t.id} className="border-b border-gray-100 last:border-0">
                  <button
                    onClick={() => onPickDump(t)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50"
                  >
                    <span className="flex-1 text-sm text-gray-800">{t.label}</span>
                    {t.aged && (
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
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
          <div className="text-center text-sm text-gray-500 border-2 border-dashed border-gray-200 rounded-2xl bg-white py-8 px-4">
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
  state,
  onToggle,
  onGround,
  onBack,
  onContinue,
}: {
  taskLabel: string;
  state: PreflightState;
  onToggle: (key: keyof PreflightState) => void;
  onGround: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const checkedCount = PREFLIGHT_ITEMS.filter((i) => state[i.key]).length;
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        <header className="text-center">
          <button
            onClick={onBack}
            className="text-[11px] text-gray-500 hover:text-gray-800 mb-1"
          >
            ← Pick again
          </button>
          <h2 className="text-lg font-semibold text-gray-900">Pre-flight</h2>
          <p className="text-xs text-gray-500 mt-1">
            Name the state you're bringing. Nothing here blocks you.
          </p>
        </header>

        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 text-center">
          <div className="text-[10px] uppercase tracking-wider font-bold text-indigo-700">
            Task
          </div>
          <div className="text-sm font-semibold text-indigo-900 mt-0.5">{taskLabel}</div>
        </div>

        <div className="space-y-2">
          {PREFLIGHT_ITEMS.map((item) => {
            const on = state[item.key];
            return (
              <button
                key={item.key}
                onClick={() => onToggle(item.key)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
                  on
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    on ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300'
                  }`}
                >
                  {on && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <div className="flex-1">
                  <div className={`text-sm font-semibold ${on ? 'text-emerald-900' : 'text-gray-800'}`}>
                    {item.label}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{item.hint}</div>
                </div>
              </button>
            );
          })}
        </div>

        {!state.grounded && (
          <button
            onClick={onGround}
            className="w-full text-[12px] text-indigo-700 hover:text-indigo-900 underline underline-offset-2"
          >
            → Do 3 min of Grounding first
          </button>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={onContinue}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Continue — {checkedCount === 4 ? 'ready' : checkedCount === 0 ? 'anyway' : `${checkedCount}/4`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Size ----------

function SizePhase({
  taskLabel,
  onBack,
  onPick,
}: {
  taskLabel: string;
  onBack: () => void;
  onPick: (m: SizeMinutes) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        <header className="text-center">
          <button
            onClick={onBack}
            className="text-[11px] text-gray-500 hover:text-gray-800 mb-1"
          >
            ← Pre-flight
          </button>
          <h2 className="text-lg font-semibold text-gray-900">How much?</h2>
          <p className="text-xs text-gray-500 mt-1">
            Pick the smallest brave you can commit to. Any of them counts as shipping.
          </p>
        </header>

        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 text-center">
          <div className="text-[10px] uppercase tracking-wider font-bold text-indigo-700">
            Task
          </div>
          <div className="text-sm font-semibold text-indigo-900 mt-0.5">{taskLabel}</div>
        </div>

        <div className="space-y-2">
          {SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onPick(opt.value)}
              className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-white border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors text-left"
            >
              <div className="text-2xl font-bold text-indigo-700 w-16 tabular-nums">
                {opt.label}
              </div>
              <div className="flex-1 text-sm text-gray-700">{opt.hint}</div>
              <span className="text-xl text-gray-300">→</span>
            </button>
          ))}
        </div>

        <p className="text-[11px] text-gray-400 text-center">
          You can bail cleanly at any time. That still counts as showing up.
        </p>
      </div>
    </div>
  );
}

// ---------- Underway (the focus screen) ----------

function UnderwayPhase({
  taskLabel,
  sizeMin,
  remainingSec,
  progressFraction,
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
  const dashOffset = CIRC * (1 - progressFraction);

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

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-5 space-y-4">
        {/* Task banner — compact, gives the timer + stream more room */}
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400">
              Right now
            </div>
            <h2 className="text-base font-semibold text-gray-900 leading-snug truncate">
              {taskLabel}
            </h2>
          </div>
          <button
            onClick={doCopy}
            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 whitespace-nowrap"
            title="Copy session log as markdown"
          >
            {copied ? '✓ copied' : '⧉ copy log'}
          </button>
        </div>

        {/* Timer ring — big and visceral. Time blindness needs BIG. */}
        <div className="relative w-56 h-56 sm:w-64 sm:h-64 mx-auto">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle
              cx="50" cy="50" r={RADIUS}
              fill="none" stroke="#e5e7eb" strokeWidth="3"
            />
            <circle
              cx="50" cy="50" r={RADIUS}
              fill="none" stroke="#4f46e5" strokeWidth="3"
              strokeDasharray={CIRC}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 200ms linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-5xl sm:text-6xl font-bold text-gray-900 tabular-nums leading-none">
              {formatMMSS(remainingSec)}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-gray-400 mt-2">
              of {sizeMin} min
            </div>
          </div>
        </div>

        {/* Auto-collected links from journal entries — quick access to
            docs/tabs pasted while working. */}
        {collectedLinks.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">
              Links from this session
            </div>
            <div className="flex flex-wrap gap-1.5">
              {collectedLinks.map((u) => (
                <a
                  key={u}
                  href={u}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full hover:bg-indigo-100 max-w-full truncate"
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
          <div className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Check-in nudge — say one line (or tap a mood chip). Anything counts.
          </div>
        )}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 flex-1">
              Interstitial log
            </div>
            <div className="text-[10px] text-gray-400 tabular-nums">
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
              className={`flex-1 min-w-0 px-3 py-2.5 text-sm border rounded-xl bg-white focus:outline-none focus:ring-2 ${
                pendingCheckIn
                  ? 'border-amber-300 focus:ring-amber-400'
                  : 'border-gray-200 focus:ring-indigo-400'
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
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-gray-700 bg-white border border-gray-200 rounded-full hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <span className="text-sm leading-none">{m.emoji}</span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* The stream — newest at top so recent thought is always in view.
            Timestamps show clock time when we have a session start; fall
            back to elapsed mm:ss. URLs in text render as clickable links. */}
        {entries.length > 0 && (
          <ul className="space-y-1 border-t border-gray-200 pt-2">
            {entries.map((e) => (
              <li key={e.id} className="group flex items-start gap-2 text-[12px] leading-relaxed">
                <span className="text-gray-400 tabular-nums font-mono whitespace-nowrap pt-0.5">
                  {sessionStartMs
                    ? new Date(sessionStartMs + e.atMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                    : formatMMSS(Math.floor(e.atMs / 1000))}
                </span>
                {e.emotion && (
                  <span className="text-sm leading-none pt-0.5" aria-hidden>{e.emotion}</span>
                )}
                <span className="flex-1 min-w-0 text-gray-800 break-words">
                  <LinkifiedText text={e.text} />
                </span>
                <button
                  onClick={() => onRemoveEntry(e.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 text-sm leading-none transition-opacity"
                  title="Remove"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
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
            className="px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:border-gray-300"
          >
            Bail
          </button>
        </div>
        <p className="text-[10px] text-gray-400 text-center">
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
    'done':    { label: 'Done',          sub: 'Task shipped. Nice.',                        chip: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    'partial': { label: 'Some of it',    sub: 'You showed up. That counts.',                chip: 'bg-indigo-50 text-indigo-800 border-indigo-200'   },
    'bailed':  { label: 'Bailed cleanly',sub: 'Bailing was the plan; you used the tether.', chip: 'bg-slate-100 text-slate-800 border-slate-200'     },
    'time-up': { label: 'Time up',       sub: 'You ran the full session.',                  chip: 'bg-sky-50 text-sky-800 border-sky-200'            },
  };
  const m = OUTCOME_META[outcome];
  const [showMore, setShowMore] = useState(false);
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        {/* Outcome chip is the primary artifact — big, colored, felt.
            The Wrap screen used to have five fields; that's a wall at the
            end when the person is already spent. One field + one button
            is enough. Everything else is expandable. */}
        <header className="text-center">
          <div className={`inline-block px-4 py-1.5 rounded-full text-sm font-semibold border ${m.chip}`}>
            {m.label}
          </div>
          <p className="text-xs text-gray-500 mt-2">{m.sub}</p>
          <div className="text-[13px] font-semibold text-gray-800 mt-3">{taskLabel}</div>
        </header>

        {/* One-line reflection — the only required field */}
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1.5">
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
            className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
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
          className="w-full text-[12px] text-gray-500 hover:text-gray-800 underline underline-offset-2"
        >
          {showMore ? 'Hide details' : 'Add more (time · next step)'}
        </button>

        {showMore && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-center">
                <div className="text-[10px] uppercase tracking-wider text-gray-500">Time</div>
                <div className="text-lg font-semibold text-gray-900 tabular-nums">
                  {formatMMSS(totalSec)}
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-center">
                <div className="text-[10px] uppercase tracking-wider text-gray-500">Log entries</div>
                <div className="text-lg font-semibold text-gray-900 tabular-nums">{entryCount}</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-center">
                <div className="text-[10px] uppercase tracking-wider text-gray-500">Started</div>
                <div className="text-lg font-semibold text-gray-900 tabular-nums">
                  {startedAt
                    ? new Date(startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                    : '—'}
                </div>
              </div>
            </div>

            {outcome !== 'done' && (
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">
                  Next microstep (optional)
                </div>
                <input
                  type="text"
                  value={nextMicrostep}
                  onChange={(e) => onNextMicrostepChange(e.target.value)}
                  placeholder="When you come back to this, start with…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
