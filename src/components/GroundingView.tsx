import { useEffect, useRef, useState } from 'react';

// Box breathing — a four-phase cycle (inhale · hold · exhale · hold) each
// equal in duration. Used by Navy SEALs, ER doctors, and anyone whose
// nervous system is running hotter than the task in front of them needs
// it to. Four seconds per side is the classic default; longer sides
// (six, eight) are the deeper version.
//
// Where it lives: under Sail. Setting a course starts with a steady
// helm — you don't chart a route while hyperventilating.

type Phase = 'inhale' | 'hold-in' | 'exhale' | 'hold-out';

const PHASES: { key: Phase; label: string; hint: string }[] = [
  { key: 'inhale',   label: 'Inhale',  hint: 'Through the nose. Fill low, then high.' },
  { key: 'hold-in',  label: 'Hold',    hint: 'Full lungs. Soft face, soft shoulders.' },
  { key: 'exhale',   label: 'Exhale',  hint: 'Slow, through the mouth. Let it all leave.' },
  { key: 'hold-out', label: 'Hold',    hint: 'Empty. Notice the stillness before the next breath.' },
];

const DURATION_OPTIONS = [4, 5, 6, 7, 8] as const;
type DurationSec = (typeof DURATION_OPTIONS)[number];

function formatMMSS(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function GroundingView() {
  const [sideSec, setSideSec] = useState<DurationSec>(4);
  const [running, setRunning] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);   // 0..3 within a cycle
  const [phaseElapsed, setPhaseElapsed] = useState(0); // ms into current phase
  const [cycles, setCycles] = useState(0);
  const [totalSec, setTotalSec] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  const phase = PHASES[phaseIndex];
  const sideMs = sideSec * 1000;
  const progress = Math.min(1, phaseElapsed / sideMs); // 0..1 within phase
  const secondsLeft = Math.max(0, Math.ceil((sideMs - phaseElapsed) / 1000));

  // Animation loop. rAF ticks at ~60Hz; we advance phaseElapsed by the
  // wall-clock delta so the timer stays honest even if the tab throttles.
  useEffect(() => {
    if (!running) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
      return;
    }
    const tick = (ts: number) => {
      if (lastTsRef.current === null) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;

      setPhaseElapsed((prev) => {
        const next = prev + dt;
        if (next >= sideMs) {
          // Roll over to the next phase; carry the overshoot so long
          // frame gaps (throttled tabs) don't drift the clock.
          const overshoot = next - sideMs;
          setPhaseIndex((pi) => {
            const nextPi = (pi + 1) % 4;
            if (nextPi === 0) setCycles((c) => c + 1);
            return nextPi;
          });
          return overshoot;
        }
        return next;
      });
      setTotalSec((s) => s); // no-op; total counted via a separate 1Hz effect
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    };
  }, [running, sideMs]);

  // Separate 1Hz total-time counter — simpler than deriving from phase state.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTotalSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const reset = () => {
    setRunning(false);
    setPhaseIndex(0);
    setPhaseElapsed(0);
    setCycles(0);
    setTotalSec(0);
  };

  // Position the traveling dot along the square's perimeter based on
  // current phase + progress. The square lives in a 100x100 SVG viewBox
  // inset by 6 to leave room for the dot's radius.
  const dotPosition = (): { x: number; y: number } => {
    const INSET = 6;
    const LO = INSET;
    const HI = 100 - INSET;
    const SPAN = HI - LO;
    const p = progress;
    switch (phase.key) {
      case 'inhale':   return { x: LO,             y: HI - SPAN * p }; // up the left
      case 'hold-in':  return { x: LO + SPAN * p,  y: LO };            // across the top
      case 'exhale':   return { x: HI,             y: LO + SPAN * p }; // down the right
      case 'hold-out': return { x: HI - SPAN * p,  y: HI };            // across the bottom
    }
  };
  const dot = dotPosition();

  // Which side of the square is "active" (being traced) right now — used
  // to thicken/color that side so the eye can follow without decoding.
  const activeSide = phase.key;

  const phaseColor =
    phase.key === 'inhale'   ? '#4f46e5' : // indigo — drawing in
    phase.key === 'hold-in'  ? '#0ea5e9' : // sky   — full and steady
    phase.key === 'exhale'   ? '#059669' : // emerald — releasing
                               '#64748b';  // slate  — empty and still

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        <header className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">Grounding</h2>
          <p className="text-xs text-gray-500 mt-1">
            Box breathing — four equal sides. Steady the helm before you set the course.
          </p>
        </header>

        {/* The box. Traces one full cycle per revolution. */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="relative aspect-square w-full max-w-xs mx-auto">
            <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
              {/* Idle square outline */}
              <rect
                x="6"
                y="6"
                width="88"
                height="88"
                rx="10"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="1.5"
              />
              {/* Active side — highlighted */}
              {activeSide === 'inhale' && (
                <line x1="6" y1="94" x2="6" y2="6" stroke={phaseColor} strokeWidth="3" strokeLinecap="round" />
              )}
              {activeSide === 'hold-in' && (
                <line x1="6" y1="6" x2="94" y2="6" stroke={phaseColor} strokeWidth="3" strokeLinecap="round" />
              )}
              {activeSide === 'exhale' && (
                <line x1="94" y1="6" x2="94" y2="94" stroke={phaseColor} strokeWidth="3" strokeLinecap="round" />
              )}
              {activeSide === 'hold-out' && (
                <line x1="94" y1="94" x2="6" y2="94" stroke={phaseColor} strokeWidth="3" strokeLinecap="round" />
              )}
              {/* Traveling dot */}
              <circle
                cx={dot.x}
                cy={dot.y}
                r="4"
                fill={phaseColor}
                style={{ transition: running ? 'none' : 'all 200ms ease' }}
              />
            </svg>

            {/* Center prompt */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div
                className="text-2xl font-semibold tracking-tight tabular-nums"
                style={{ color: phaseColor }}
              >
                {phase.label}
              </div>
              <div className="text-4xl font-bold text-gray-800 tabular-nums mt-1">
                {secondsLeft}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-gray-400 mt-1">
                {running ? `${sideSec}s per side` : 'ready'}
              </div>
            </div>
          </div>

          {/* Hint under the box — one clean line, changes per phase */}
          <p className="mt-3 text-center text-xs text-gray-600 min-h-[1.25rem]">
            {phase.hint}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRunning((r) => !r)}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors ${
              running ? 'bg-slate-700 hover:bg-slate-800' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {running ? 'Pause' : cycles === 0 && totalSec === 0 ? 'Begin' : 'Resume'}
          </button>
          <button
            onClick={reset}
            disabled={cycles === 0 && totalSec === 0 && !running}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Reset
          </button>
        </div>

        {/* Pace picker — disabled while running so the tempo doesn't jerk */}
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1.5">
            Pace
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {DURATION_OPTIONS.map((sec) => {
              const active = sideSec === sec;
              return (
                <button
                  key={sec}
                  onClick={() => setSideSec(sec)}
                  disabled={running}
                  className={`px-2 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-300'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {sec}s
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">
            One full cycle = {sideSec * 4}s. Start at 4s; work up to 6–8 as it gets comfortable.
          </p>
        </div>

        {/* Session stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wider text-gray-500">Cycles</div>
            <div className="text-xl font-semibold text-gray-900 tabular-nums">{cycles}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wider text-gray-500">Time</div>
            <div className="text-xl font-semibold text-gray-900 tabular-nums">
              {formatMMSS(totalSec)}
            </div>
          </div>
        </div>

        {/* Why-it-works nudge — a light touch, not a lecture */}
        <details className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700">
          <summary className="cursor-pointer text-[13px] font-semibold text-gray-800">
            Why box breathing?
          </summary>
          <p className="mt-2 text-xs text-gray-600 leading-relaxed">
            Slow, controlled breathing (~6 breaths/min) lifts vagal tone, which
            downshifts the sympathetic nervous system. Equal sides keep the
            pace measured so you don't unconsciously creep back to a shallower
            baseline. Two to four minutes is usually enough to notice the
            shift.
          </p>
        </details>
      </div>
    </div>
  );
}
