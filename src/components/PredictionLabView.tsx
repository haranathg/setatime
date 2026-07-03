import { useEffect, useMemo, useState } from 'react';
import type {
  PredictionEntry,
  PredictionEmotion,
  PredictionMode,
  PredictionAccuracy,
  TrustShift,
} from '../types';
import type { NewEntryInput, ReflectionInput } from '../hooks/usePredictions';

const EMOTIONS: { value: PredictionEmotion; label: string }[] = [
  { value: 'anxiety', label: 'Anxiety' },
  { value: 'shame', label: 'Shame' },
  { value: 'overwhelm', label: 'Overwhelm' },
  { value: 'uncertainty', label: 'Uncertainty' },
  { value: 'sadness', label: 'Sadness' },
  { value: 'anger', label: 'Anger' },
  { value: 'curiosity', label: 'Curiosity' },
  { value: 'excitement', label: 'Excitement' },
  { value: 'guilt', label: 'Guilt' },
  { value: 'resistance', label: 'Resistance' },
];

interface PredictionLabViewProps {
  entries: PredictionEntry[];
  stats: {
    total: number;
    tested: number;
    inaccuratePct: number;
    partialPct: number;
    accuratePct: number;
    topEmotions: [PredictionEmotion, number][];
  };
  overdueReflections: PredictionEntry[];
  initialReflectId?: string | null;
  onConsumedInitialReflectId?: () => void;
  onAddEntry: (input: NewEntryInput) => PredictionEntry;
  onRecordReflection: (id: string, input: ReflectionInput) => void;
  onScheduleThis: (prefill: { taskName?: string; time?: string; dateKey?: string }) => void;
  onDeleteEntry: (id: string) => void;
}

type Flow =
  | { kind: 'none' }
  | { kind: 'mode-pick' }
  | { kind: 'new'; mode: PredictionMode; step: number; draft: Draft }
  | { kind: 'reflect'; entryId: string; step: number; draft: ReflectDraft }
  | { kind: 'detail'; entryId: string };

interface Draft {
  situation: string;
  prediction: string;
  confidence: number;
  emotions: PredictionEmotion[];
  emotionIntensity: number;
  firstMove: string;
  evidenceFor: string;
  evidenceAgainst: string;
  behavioralPull: string;
  oneYearProjection: string;
  valuesAction: string;
  experiment: string;
  experimentWhenWhere: string;
}

interface ReflectDraft {
  outcome: string;
  predictionAccurate: PredictionAccuracy | '';
  shouldHaveBeenConfidence: number;
  surprise: number;
  insight: string;
  trustFuturePredictionsMore: TrustShift | '';
}

const EMPTY_DRAFT: Draft = {
  situation: '',
  prediction: '',
  confidence: 50,
  emotions: [],
  emotionIntensity: 50,
  firstMove: '',
  evidenceFor: '',
  evidenceAgainst: '',
  behavioralPull: '',
  oneYearProjection: '',
  valuesAction: '',
  experiment: '',
  experimentWhenWhere: '',
};

const EMPTY_REFLECT: ReflectDraft = {
  outcome: '',
  predictionAccurate: '',
  shouldHaveBeenConfidence: 50,
  surprise: 50,
  insight: '',
  trustFuturePredictionsMore: '',
};

export default function PredictionLabView({
  entries,
  stats,
  overdueReflections,
  initialReflectId,
  onConsumedInitialReflectId,
  onAddEntry,
  onRecordReflection,
  onDeleteEntry,
  onScheduleThis,
}: PredictionLabViewProps) {
  const [flow, setFlow] = useState<Flow>({ kind: 'none' });

  // If TodayView (or another caller) jumped us in to reflect on a specific
  // entry, open that reflection flow once on mount.
  useEffect(() => {
    if (!initialReflectId) return;
    const target = entries.find((e) => e.id === initialReflectId);
    if (!target) return;
    setFlow({ kind: 'reflect', entryId: initialReflectId, step: 0, draft: EMPTY_REFLECT });
    onConsumedInitialReflectId?.();
    // We deliberately key off initialReflectId only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReflectId]);

  if (flow.kind === 'mode-pick') {
    return (
      <Shell onExit={() => setFlow({ kind: 'none' })}>
        <ModePicker
          onPick={(mode) =>
            setFlow({ kind: 'new', mode, step: 0, draft: { ...EMPTY_DRAFT } })
          }
        />
      </Shell>
    );
  }

  if (flow.kind === 'new') {
    return (
      <Shell onExit={() => setFlow({ kind: 'none' })}>
        <NewEntryWizard
          mode={flow.mode}
          step={flow.step}
          draft={flow.draft}
          onChange={(draft) => setFlow({ ...flow, draft })}
          onBack={() =>
            flow.step === 0
              ? setFlow({ kind: 'mode-pick' })
              : setFlow({ ...flow, step: flow.step - 1 })
          }
          onNext={() => setFlow({ ...flow, step: flow.step + 1 })}
          onFinish={() => {
            const d = flow.draft;
            onAddEntry({
              mode: flow.mode,
              situation: d.situation.trim(),
              prediction: d.prediction.trim(),
              confidence: d.confidence,
              emotions: d.emotions,
              emotionIntensity: d.emotionIntensity,
              firstMove: d.firstMove.trim(),
              evidenceFor: emptyToUndef(d.evidenceFor),
              evidenceAgainst: emptyToUndef(d.evidenceAgainst),
              behavioralPull: emptyToUndef(d.behavioralPull),
              oneYearProjection: emptyToUndef(d.oneYearProjection),
              valuesAction: emptyToUndef(d.valuesAction),
              experiment: emptyToUndef(d.experiment),
              experimentWhenWhere: emptyToUndef(d.experimentWhenWhere),
            });
            setFlow({ kind: 'none' });
          }}
        />
      </Shell>
    );
  }

  if (flow.kind === 'reflect') {
    const entry = entries.find((e) => e.id === flow.entryId);
    if (!entry) {
      setFlow({ kind: 'none' });
      return null;
    }
    return (
      <Shell onExit={() => setFlow({ kind: 'none' })}>
        <ReflectionWizard
          entry={entry}
          step={flow.step}
          draft={flow.draft}
          onChange={(draft) => setFlow({ ...flow, draft })}
          onBack={() =>
            flow.step === 0
              ? setFlow({ kind: 'none' })
              : setFlow({ ...flow, step: flow.step - 1 })
          }
          onNext={() => setFlow({ ...flow, step: flow.step + 1 })}
          onFinish={() => {
            const d = flow.draft;
            onRecordReflection(entry.id, {
              outcome: d.outcome.trim(),
              predictionAccurate: (d.predictionAccurate || 'partly') as PredictionAccuracy,
              shouldHaveBeenConfidence: d.shouldHaveBeenConfidence,
              surprise: d.surprise,
              insight: emptyToUndef(d.insight),
              trustFuturePredictionsMore: (d.trustFuturePredictionsMore || undefined) as
                | TrustShift
                | undefined,
            });
            setFlow({ kind: 'none' });
          }}
        />
      </Shell>
    );
  }

  if (flow.kind === 'detail') {
    const entry = entries.find((e) => e.id === flow.entryId);
    if (!entry) {
      setFlow({ kind: 'none' });
      return null;
    }
    return (
      <Shell onExit={() => setFlow({ kind: 'none' })}>
        <EntryDetail
          entry={entry}
          onReflect={() =>
            setFlow({ kind: 'reflect', entryId: entry.id, step: 0, draft: EMPTY_REFLECT })
          }
          onDelete={() => {
            if (confirm('Delete this prediction entry? This cannot be undone.')) {
              onDeleteEntry(entry.id);
              setFlow({ kind: 'none' });
            }
          }}
          onScheduleThis={onScheduleThis}
        />
      </Shell>
    );
  }

  return (
    <Dashboard
      entries={entries}
      stats={stats}
      overdueReflections={overdueReflections}
      onNew={() => setFlow({ kind: 'mode-pick' })}
      onReflect={(id) =>
        setFlow({ kind: 'reflect', entryId: id, step: 0, draft: EMPTY_REFLECT })
      }
      onOpen={(id) => setFlow({ kind: 'detail', entryId: id })}
    />
  );
}

// ---------- Shell (focus-mode container shared by every wizard step) ----------

function Shell({ children, onExit }: { children: React.ReactNode; onExit: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto bg-[#fbfaf7]">
      <div className="max-w-2xl mx-auto px-5 pt-4 pb-12 min-h-full flex flex-col">
        <div className="flex justify-end mb-2">
          <button
            onClick={onExit}
            className="text-xs uppercase tracking-wider text-gray-400 hover:text-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}

// ---------- Dashboard ----------

function Dashboard({
  entries,
  stats,
  overdueReflections,
  onNew,
  onReflect,
  onOpen,
}: {
  entries: PredictionEntry[];
  stats: PredictionLabViewProps['stats'];
  overdueReflections: PredictionEntry[];
  onNew: () => void;
  onReflect: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [entries]
  );

  return (
    <div className="flex-1 overflow-y-auto bg-[#fbfaf7]">
      <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
        <header className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">Prediction Lab</h1>
            <p className="text-sm text-gray-500 mt-1 leading-snug">
              Make subconscious predictions visible. Test them. Recalibrate.
            </p>
          </div>
          <button
            onClick={onNew}
            className="flex-shrink-0 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-colors"
          >
            + New entry
          </button>
        </header>

        {/* Overdue reflections — ties into the visibility system */}
        {overdueReflections.length > 0 && (
          <section className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] uppercase tracking-wider font-bold text-amber-800">
                Awaiting reflection
              </span>
              <span className="text-[11px] text-amber-700">
                {overdueReflections.length} prediction
                {overdueReflections.length === 1 ? '' : 's'} ready to close the loop
              </span>
            </div>
            <ul className="space-y-1.5">
              {overdueReflections.slice(0, 5).map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => onReflect(e.id)}
                    className="w-full text-left px-3 py-2 bg-white border border-amber-200 hover:border-amber-400 rounded-xl transition-colors flex items-center justify-between gap-3"
                  >
                    <span className="flex-1 min-w-0 truncate text-sm text-gray-800">
                      {e.prediction || e.situation || '(empty entry)'}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 flex-shrink-0">
                      Reflect ›
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* KPI cards */}
        <section className="grid grid-cols-3 gap-3">
          <KPICard label="Entries" value={stats.total} />
          <KPICard label="Tested" value={stats.tested} />
          <KPICard
            label="Off-target"
            value={stats.tested === 0 ? '—' : `${stats.inaccuratePct}%`}
            hint={stats.tested === 0 ? 'Reflect to populate' : `Of ${stats.tested} tested`}
          />
        </section>

        {/* Emotion strip */}
        {stats.topEmotions.length > 0 && (
          <section className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-2">
              Most common emotions
            </div>
            <div className="flex flex-wrap gap-1.5">
              {stats.topEmotions.map(([name, count]) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full"
                >
                  {capitalize(name)}
                  <span className="text-[10px] text-indigo-500">{count}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Recent entries */}
        <section>
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-2 px-1">
            Recent entries
          </div>
          {sortedEntries.length === 0 ? (
            <EmptyHint onNew={onNew} />
          ) : (
            <ul className="space-y-2">
              {sortedEntries.slice(0, 20).map((e) => (
                <EntryRow key={e.id} entry={e} onOpen={() => onOpen(e.id)} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function KPICard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900 leading-none">{value}</div>
      {hint && <div className="mt-1 text-[10px] text-gray-400">{hint}</div>}
    </div>
  );
}

function EmptyHint({ onNew }: { onNew: () => void }) {
  return (
    <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl px-6 py-10 text-center">
      <p className="text-sm font-semibold text-gray-800">No predictions logged yet</p>
      <p className="text-xs text-gray-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
        When you catch yourself simulating a future ("they probably won't…", "this will be exhausting"),
        capture the prediction with a confidence number. Reflect later. Over time your nervous system
        becomes more calibrated.
      </p>
      <button
        onClick={onNew}
        className="mt-4 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors"
      >
        Try your first one
      </button>
    </div>
  );
}

function EntryRow({ entry, onOpen }: { entry: PredictionEntry; onOpen: () => void }) {
  const accClass = (() => {
    if (!entry.reflectedAt) return 'bg-amber-50 text-amber-700 border-amber-200';
    if (entry.predictionAccurate === 'no') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (entry.predictionAccurate === 'partly') return 'bg-sky-50 text-sky-700 border-sky-200';
    return 'bg-gray-100 text-gray-600 border-gray-200';
  })();
  const accLabel = !entry.reflectedAt
    ? 'Awaiting'
    : entry.predictionAccurate === 'no'
    ? 'Off-target'
    : entry.predictionAccurate === 'partly'
    ? 'Partly'
    : entry.predictionAccurate === 'yes'
    ? 'On-target'
    : 'Reflected';

  return (
    <li>
      <button
        onClick={onOpen}
        className="w-full text-left bg-white border border-gray-200 hover:border-indigo-300 hover:shadow-sm rounded-2xl px-4 py-3 transition-all"
      >
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 font-mono">
            {formatDate(entry.createdAt)} · {capitalize(entry.mode)}
          </span>
          <span
            className={`text-[10px] uppercase tracking-wider font-bold border rounded-sm px-1.5 py-0.5 ${accClass}`}
          >
            {accLabel}
          </span>
        </div>
        <div className="text-sm font-medium text-gray-900 line-clamp-2">{entry.prediction}</div>
        {entry.situation && (
          <div className="text-[12px] text-gray-500 mt-1 line-clamp-1">{entry.situation}</div>
        )}
        <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-500">
          <span>
            Confidence{' '}
            <span className="font-mono text-gray-700 font-semibold">{entry.confidence}</span>
          </span>
          <span>·</span>
          <span>
            Intensity{' '}
            <span className="font-mono text-gray-700 font-semibold">{entry.emotionIntensity}</span>
          </span>
          {entry.emotions.length > 0 && (
            <>
              <span>·</span>
              <span className="truncate">{entry.emotions.map(capitalize).join(', ')}</span>
            </>
          )}
        </div>
      </button>
    </li>
  );
}

// ---------- Mode picker ----------

function ModePicker({ onPick }: { onPick: (m: PredictionMode) => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-12">
      <h2 className="text-2xl font-semibold text-gray-900 text-center mb-2 tracking-tight">
        How deep do you want to go?
      </h2>
      <p className="text-sm text-gray-500 text-center mb-8 max-w-md">
        Quick captures the core calibration loop in three prompts. Deep adds CBT/ACT-style evidence,
        values, and a small experiment.
      </p>
      <div className="w-full max-w-md space-y-3">
        <button
          onClick={() => onPick('quick')}
          className="w-full text-left bg-white border border-gray-200 hover:border-indigo-400 hover:shadow-md rounded-2xl px-5 py-4 transition-all"
        >
          <div className="text-xs uppercase tracking-wider font-bold text-indigo-600 mb-1">Quick</div>
          <div className="text-base font-semibold text-gray-900 mb-1">~60 seconds, 3 prompts</div>
          <div className="text-[12px] text-gray-500 leading-snug">
            Prediction + confidence, emotion + intensity, smallest physical move. Closes the
            calibration loop with minimum friction.
          </div>
        </button>
        <button
          onClick={() => onPick('deep')}
          className="w-full text-left bg-white border border-gray-200 hover:border-indigo-400 hover:shadow-md rounded-2xl px-5 py-4 transition-all"
        >
          <div className="text-xs uppercase tracking-wider font-bold text-indigo-600 mb-1">Deep</div>
          <div className="text-base font-semibold text-gray-900 mb-1">~5 minutes, 7 prompts</div>
          <div className="text-[12px] text-gray-500 leading-snug">
            Adds evidence FOR/AGAINST, what the emotion is pulling you toward, where it leads in a
            year, the values-aligned move, and a small experiment with an implementation intention.
          </div>
        </button>
      </div>
    </div>
  );
}

// ---------- New entry wizard ----------

interface WizardChildProps {
  draft: Draft;
  onChange: (d: Draft) => void;
  onNext: () => void;
}

function NewEntryWizard({
  mode,
  step,
  draft,
  onChange,
  onBack,
  onNext,
  onFinish,
}: {
  mode: PredictionMode;
  step: number;
  draft: Draft;
  onChange: (d: Draft) => void;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
}) {
  // Quick mode: 3 steps. Deep mode: 7 steps. Last step calls onFinish.
  const steps: (() => React.ReactNode)[] =
    mode === 'quick'
      ? [
          () => <StepCapturePrediction draft={draft} onChange={onChange} onNext={onNext} />,
          () => <StepEmotion draft={draft} onChange={onChange} onNext={onNext} />,
          () => <StepFirstMove draft={draft} onChange={onChange} onNext={onFinish} />,
        ]
      : [
          () => <StepSituation draft={draft} onChange={onChange} onNext={onNext} />,
          () => <StepPredictionDeep draft={draft} onChange={onChange} onNext={onNext} />,
          () => <StepEmotion draft={draft} onChange={onChange} onNext={onNext} />,
          () => <StepEvidence draft={draft} onChange={onChange} onNext={onNext} />,
          () => <StepBehavioralPull draft={draft} onChange={onChange} onNext={onNext} />,
          () => <StepValuesAndMove draft={draft} onChange={onChange} onNext={onNext} />,
          () => <StepExperiment draft={draft} onChange={onChange} onNext={onFinish} />,
        ];
  const totalSteps = steps.length;
  const safeStep = Math.min(step, totalSteps - 1);

  return (
    <div className="flex-1 flex flex-col">
      <ProgressDots total={totalSteps} index={safeStep} />
      <div className="flex-1 py-4">{steps[safeStep]()}</div>
      <div className="pt-4 mt-2 border-t border-gray-100 flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          ← Back
        </button>
        <div className="text-[10px] uppercase tracking-wider text-gray-400">
          Step {safeStep + 1} of {totalSteps}
        </div>
      </div>
    </div>
  );
}

function ProgressDots({ total, index }: { total: number; index: number }) {
  return (
    <div className="flex items-center gap-1.5 justify-center mb-4">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i === index
              ? 'w-6 bg-indigo-500'
              : i < index
              ? 'w-1.5 bg-indigo-300'
              : 'w-1.5 bg-gray-200'
          }`}
        />
      ))}
    </div>
  );
}

// ---------- Individual steps ----------

function PromptHeading({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="text-center mb-6">
      <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 tracking-tight leading-tight">
        {children}
      </h2>
      {sub && <p className="text-sm text-gray-500 mt-2 leading-snug">{sub}</p>}
    </div>
  );
}

function ContinueButton({
  onClick,
  disabled,
  label = 'Continue',
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="mt-6 w-full px-4 py-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed rounded-xl transition-colors"
    >
      {label}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1.5">
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  multiline?: boolean;
}) {
  const cls =
    'w-full px-4 py-3 text-base text-gray-900 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder:text-gray-400 transition-colors';
  if (multiline) {
    return (
      <textarea
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className={`${cls} resize-y leading-relaxed`}
      />
    );
  }
  return (
    <input
      type="text"
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cls}
    />
  );
}

function Slider({
  value,
  onChange,
  leftLabel,
  rightLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-indigo-500"
      />
      <div className="mt-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-gray-400">
        <span>{leftLabel}</span>
        <span className="text-base font-semibold text-indigo-600 normal-case tracking-normal">{value}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}

// Quick step 1 / Deep step 2: prediction + confidence (and capture if quick)
function StepCapturePrediction({ draft, onChange, onNext }: WizardChildProps) {
  return (
    <div>
      <PromptHeading sub="What did your brain just simulate? Give it a confidence rating.">
        What future is your brain predicting?
      </PromptHeading>
      <div className="space-y-4">
        <div>
          <FieldLabel>The prediction</FieldLabel>
          <TextInput
            autoFocus
            multiline
            value={draft.prediction}
            onChange={(v) => onChange({ ...draft, prediction: v })}
            placeholder='e.g. "The gym will be exhausting and I&apos;ll feel worse afterward"'
          />
        </div>
        <div>
          <FieldLabel>Context (optional)</FieldLabel>
          <TextInput
            value={draft.situation}
            onChange={(v) => onChange({ ...draft, situation: v })}
            placeholder='e.g. "Thinking about going to the gym at 6pm"'
          />
        </div>
        <div>
          <FieldLabel>How confident are you in this prediction?</FieldLabel>
          <Slider
            value={draft.confidence}
            onChange={(n) => onChange({ ...draft, confidence: n })}
            leftLabel="Could go either way"
            rightLabel="Almost certain"
          />
        </div>
      </div>
      <ContinueButton onClick={onNext} disabled={!draft.prediction.trim()} />
    </div>
  );
}

// Deep step 1: just situation
function StepSituation({ draft, onChange, onNext }: WizardChildProps) {
  return (
    <div>
      <PromptHeading sub="A single sentence is enough. We'll get to the prediction next.">
        What happened?
      </PromptHeading>
      <TextInput
        autoFocus
        multiline
        value={draft.situation}
        onChange={(v) => onChange({ ...draft, situation: v })}
        placeholder='e.g. "I thought about going to the gym."'
      />
      <ContinueButton onClick={onNext} disabled={!draft.situation.trim()} />
    </div>
  );
}

// Deep step 2: prediction + confidence
function StepPredictionDeep({ draft, onChange, onNext }: WizardChildProps) {
  return (
    <div>
      <PromptHeading sub="The forecast your brain is making about what will happen.">
        What is your brain simulating?
      </PromptHeading>
      <div className="space-y-4">
        <TextInput
          autoFocus
          multiline
          value={draft.prediction}
          onChange={(v) => onChange({ ...draft, prediction: v })}
          placeholder='e.g. "If I schedule my week I&apos;ll lose my freedom."'
        />
        <div>
          <FieldLabel>How confident in this prediction?</FieldLabel>
          <Slider
            value={draft.confidence}
            onChange={(n) => onChange({ ...draft, confidence: n })}
            leftLabel="Could go either way"
            rightLabel="Almost certain"
          />
        </div>
      </div>
      <ContinueButton onClick={onNext} disabled={!draft.prediction.trim()} />
    </div>
  );
}

function StepEmotion({ draft, onChange, onNext }: WizardChildProps) {
  const toggle = (em: PredictionEmotion) => {
    onChange({
      ...draft,
      emotions: draft.emotions.includes(em)
        ? draft.emotions.filter((e) => e !== em)
        : [...draft.emotions, em],
    });
  };
  return (
    <div>
      <PromptHeading sub="Pick all that apply. Then rate the overall intensity.">
        What emotions are present?
      </PromptHeading>
      <div className="flex flex-wrap gap-2 justify-center mb-6">
        {EMOTIONS.map((em) => {
          const active = draft.emotions.includes(em.value);
          return (
            <button
              key={em.value}
              onClick={() => toggle(em.value)}
              className={`px-3 py-1.5 text-sm rounded-full border transition-all ${
                active
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'
              }`}
            >
              {em.label}
            </button>
          );
        })}
      </div>
      <div>
        <FieldLabel>Intensity (0–100)</FieldLabel>
        <Slider
          value={draft.emotionIntensity}
          onChange={(n) => onChange({ ...draft, emotionIntensity: n })}
          leftLabel="Barely there"
          rightLabel="Overwhelming"
        />
      </div>
      <ContinueButton onClick={onNext} disabled={draft.emotions.length === 0} />
    </div>
  );
}

function StepEvidence({ draft, onChange, onNext }: WizardChildProps) {
  return (
    <div>
      <PromptHeading sub="Observable facts, not feelings. Either column can be empty.">
        What's the evidence?
      </PromptHeading>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel>FOR the prediction</FieldLabel>
          <TextInput
            autoFocus
            multiline
            value={draft.evidenceFor}
            onChange={(v) => onChange({ ...draft, evidenceFor: v })}
            placeholder="Concrete things you've observed"
          />
        </div>
        <div>
          <FieldLabel>AGAINST the prediction</FieldLabel>
          <TextInput
            multiline
            value={draft.evidenceAgainst}
            onChange={(v) => onChange({ ...draft, evidenceAgainst: v })}
            placeholder="Counter-observations"
          />
        </div>
      </div>
      <ContinueButton onClick={onNext} label="Continue" />
    </div>
  );
}

function StepBehavioralPull({ draft, onChange, onNext }: WizardChildProps) {
  return (
    <div>
      <PromptHeading sub="Avoid? Wait? Hide? Scroll? Seek reassurance? Then ask where that pull leads.">
        What is this emotion pulling you toward?
      </PromptHeading>
      <div className="space-y-4">
        <div>
          <FieldLabel>The pull</FieldLabel>
          <TextInput
            autoFocus
            value={draft.behavioralPull}
            onChange={(v) => onChange({ ...draft, behavioralPull: v })}
            placeholder="e.g. delay, research forever, scroll"
          />
        </div>
        <div>
          <FieldLabel>If you followed this pull for a year, where would it lead?</FieldLabel>
          <TextInput
            multiline
            value={draft.oneYearProjection}
            onChange={(v) => onChange({ ...draft, oneYearProjection: v })}
            placeholder="A specific, honest answer"
          />
        </div>
      </div>
      <ContinueButton onClick={onNext} />
    </div>
  );
}

function StepValuesAndMove({ draft, onChange, onNext }: WizardChildProps) {
  return (
    <div>
      <PromptHeading sub="The version of you you're trying to become has a move. So does your body, right now.">
        Values move + first physical move
      </PromptHeading>
      <div className="space-y-4">
        <div>
          <FieldLabel>What would becoming-you do next?</FieldLabel>
          <TextInput
            autoFocus
            value={draft.valuesAction}
            onChange={(v) => onChange({ ...draft, valuesAction: v })}
            placeholder="e.g. send the email even if it's imperfect"
          />
        </div>
        <div>
          <FieldLabel>Smallest physical action you can take right now</FieldLabel>
          <TextInput
            value={draft.firstMove}
            onChange={(v) => onChange({ ...draft, firstMove: v })}
            placeholder="e.g. stand up, open the laptop, touch the notebook"
          />
        </div>
      </div>
      <ContinueButton onClick={onNext} disabled={!draft.firstMove.trim()} />
    </div>
  );
}

function StepExperiment({ draft, onChange, onNext }: WizardChildProps) {
  return (
    <div>
      <PromptHeading sub="Low-risk. Specific. When and where matters more than how.">
        What small experiment tests the prediction?
      </PromptHeading>
      <div className="space-y-4">
        <div>
          <FieldLabel>The experiment</FieldLabel>
          <TextInput
            autoFocus
            multiline
            value={draft.experiment}
            onChange={(v) => onChange({ ...draft, experiment: v })}
            placeholder="e.g. go to the gym for 10 minutes; send one email"
          />
        </div>
        <div>
          <FieldLabel>When and where will you do it?</FieldLabel>
          <TextInput
            value={draft.experimentWhenWhere}
            onChange={(v) => onChange({ ...draft, experimentWhenWhere: v })}
            placeholder="e.g. tonight at 7pm, in the kitchen"
          />
          <p className="text-[10px] text-gray-400 mt-1.5">
            Implementation intentions roughly double follow-through (Gollwitzer).
          </p>
        </div>
      </div>
      <ContinueButton onClick={onNext} label="Save entry" />
    </div>
  );
}

function StepFirstMove({ draft, onChange, onNext }: WizardChildProps) {
  return (
    <div>
      <PromptHeading sub="A body movement that breaks inertia. Physical action precedes affect change.">
        Smallest physical move you can make right now
      </PromptHeading>
      <TextInput
        autoFocus
        value={draft.firstMove}
        onChange={(v) => onChange({ ...draft, firstMove: v })}
        placeholder="e.g. stand up, put on shoes, open the laptop"
      />
      <ContinueButton onClick={onNext} disabled={!draft.firstMove.trim()} label="Save entry" />
    </div>
  );
}

// ---------- Reflection wizard ----------

function ReflectionWizard({
  entry,
  step,
  draft,
  onChange,
  onBack,
  onNext,
  onFinish,
}: {
  entry: PredictionEntry;
  step: number;
  draft: ReflectDraft;
  onChange: (d: ReflectDraft) => void;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
}) {
  const steps: (() => React.ReactNode)[] = [
    () => (
      <div>
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 mb-6 text-[12px]">
          <div className="text-[10px] uppercase tracking-wider font-bold text-indigo-700 mb-1">
            Your original prediction · {entry.confidence}% confidence
          </div>
          <div className="text-gray-800 leading-snug">{entry.prediction}</div>
        </div>
        <PromptHeading sub="A single honest sentence is enough.">What actually happened?</PromptHeading>
        <TextInput
          autoFocus
          multiline
          value={draft.outcome}
          onChange={(v) => onChange({ ...draft, outcome: v })}
          placeholder="e.g. went to the gym, felt better after the first 5 minutes"
        />
        <ContinueButton onClick={onNext} disabled={!draft.outcome.trim()} />
      </div>
    ),
    () => (
      <div>
        <PromptHeading sub="Compared to your prediction.">Was your prediction accurate?</PromptHeading>
        <div className="flex flex-col gap-2">
          {(['yes', 'partly', 'no'] as PredictionAccuracy[]).map((acc) => (
            <button
              key={acc}
              onClick={() => onChange({ ...draft, predictionAccurate: acc })}
              className={`text-left px-4 py-3 rounded-xl border-2 transition-all ${
                draft.predictionAccurate === acc
                  ? 'bg-indigo-50 border-indigo-400 text-indigo-900'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-200'
              }`}
            >
              <div className="text-sm font-semibold capitalize">{acc}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                {acc === 'yes' && 'On-target — the prediction matched reality.'}
                {acc === 'partly' && 'Some aspects matched, some didn\'t.'}
                {acc === 'no' && 'Off-target — reality came out differently.'}
              </div>
            </button>
          ))}
        </div>
        <div className="mt-6">
          <FieldLabel>In hindsight, what confidence SHOULD you have had?</FieldLabel>
          <Slider
            value={draft.shouldHaveBeenConfidence}
            onChange={(n) => onChange({ ...draft, shouldHaveBeenConfidence: n })}
            leftLabel="Could go either way"
            rightLabel="Almost certain"
          />
          <p className="text-[10px] text-gray-400 mt-1.5">
            Original: <span className="font-mono text-gray-600">{entry.confidence}</span>
          </p>
        </div>
        <ContinueButton onClick={onNext} disabled={!draft.predictionAccurate} />
      </div>
    ),
    () => (
      <div>
        <PromptHeading sub="Calibrating your gut requires noticing when reality diverges.">
          How surprised were you?
        </PromptHeading>
        <Slider
          value={draft.surprise}
          onChange={(n) => onChange({ ...draft, surprise: n })}
          leftLabel="Saw it coming"
          rightLabel="Genuine surprise"
        />
        <ContinueButton onClick={onNext} />
      </div>
    ),
    () => (
      <div>
        <PromptHeading sub="What did you learn? Should you trust this kind of prediction more or less?">
          The takeaway
        </PromptHeading>
        <div className="space-y-4">
          <div>
            <FieldLabel>One-line insight</FieldLabel>
            <TextInput
              autoFocus
              value={draft.insight}
              onChange={(v) => onChange({ ...draft, insight: v })}
              placeholder='e.g. "Resistance drops once I actually start"'
            />
          </div>
          <div>
            <FieldLabel>Should your future self trust this kind of prediction…</FieldLabel>
            <div className="flex gap-2 mt-1">
              {(['less', 'same', 'more'] as TrustShift[]).map((opt) => (
                <button
                  key={opt}
                  onClick={() => onChange({ ...draft, trustFuturePredictionsMore: opt })}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-xl border-2 transition-all ${
                    draft.trustFuturePredictionsMore === opt
                      ? 'bg-indigo-50 border-indigo-400 text-indigo-900'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-200'
                  }`}
                >
                  {capitalize(opt)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <ContinueButton onClick={onFinish} label="Save reflection" />
      </div>
    ),
  ];

  const totalSteps = steps.length;
  const safeStep = Math.min(step, totalSteps - 1);

  return (
    <div className="flex-1 flex flex-col">
      <ProgressDots total={totalSteps} index={safeStep} />
      <div className="flex-1 py-4">{steps[safeStep]()}</div>
      <div className="pt-4 mt-2 border-t border-gray-100 flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          ← Back
        </button>
        <div className="text-[10px] uppercase tracking-wider text-gray-400">
          Step {safeStep + 1} of {totalSteps}
        </div>
      </div>
    </div>
  );
}

// ---------- Entry detail ----------

function EntryDetail({
  entry,
  onReflect,
  onDelete,
  onScheduleThis,
}: {
  entry: PredictionEntry;
  onReflect: () => void;
  onDelete: () => void;
  onScheduleThis: (prefill: { taskName?: string; time?: string; dateKey?: string }) => void;
}) {
  return (
    <div className="space-y-5 py-2">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-gray-400 font-mono mb-1">
          {formatDate(entry.createdAt)} · {capitalize(entry.mode)} entry
        </div>
        <h2 className="text-lg font-semibold text-gray-900 leading-snug">{entry.prediction}</h2>
        {entry.situation && (
          <p className="text-sm text-gray-600 mt-1.5 leading-snug">{entry.situation}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <DetailBox label="Confidence" value={`${entry.confidence}`} />
        <DetailBox label="Intensity" value={`${entry.emotionIntensity}`} />
      </div>

      {entry.emotions.length > 0 && (
        <DetailSection label="Emotions">
          <div className="flex flex-wrap gap-1.5">
            {entry.emotions.map((em) => (
              <span
                key={em}
                className="px-2 py-0.5 text-[12px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full"
              >
                {capitalize(em)}
              </span>
            ))}
          </div>
        </DetailSection>
      )}

      {entry.firstMove && <DetailSection label="First physical move">{entry.firstMove}</DetailSection>}
      {entry.evidenceFor && <DetailSection label="Evidence FOR">{entry.evidenceFor}</DetailSection>}
      {entry.evidenceAgainst && (
        <DetailSection label="Evidence AGAINST">{entry.evidenceAgainst}</DetailSection>
      )}
      {entry.behavioralPull && (
        <DetailSection label="Behavioral pull">{entry.behavioralPull}</DetailSection>
      )}
      {entry.oneYearProjection && (
        <DetailSection label="If followed for a year">{entry.oneYearProjection}</DetailSection>
      )}
      {entry.valuesAction && (
        <DetailSection label="Values move">{entry.valuesAction}</DetailSection>
      )}
      {entry.experiment && (
        <div>
          <DetailSection label="Experiment">{entry.experiment}</DetailSection>
          <button
            onClick={() =>
              onScheduleThis({
                taskName: entry.experiment,
              })
            }
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors"
            title="Jump to the calendar with this experiment pre-filled — Gollwitzer's research says a real time slot roughly doubles follow-through vs an intention without one"
          >
            ↳ Schedule this experiment
          </button>
        </div>
      )}
      {entry.experimentWhenWhere && (
        <DetailSection label="When and where">{entry.experimentWhenWhere}</DetailSection>
      )}

      {entry.reflectedAt ? (
        <section className="bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 space-y-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-indigo-700">
            Reflection · {formatDate(entry.reflectedAt)}
          </div>
          {entry.outcome && (
            <DetailSection label="Outcome">{entry.outcome}</DetailSection>
          )}
          <div className="grid grid-cols-3 gap-3">
            <DetailBox
              label="Accuracy"
              value={
                entry.predictionAccurate ? capitalize(entry.predictionAccurate) : '—'
              }
              compact
            />
            <DetailBox
              label="Should-have-been"
              value={entry.shouldHaveBeenConfidence != null ? `${entry.shouldHaveBeenConfidence}` : '—'}
              compact
            />
            <DetailBox
              label="Surprise"
              value={entry.surprise != null ? `${entry.surprise}` : '—'}
              compact
            />
          </div>
          {entry.insight && <DetailSection label="Insight">{entry.insight}</DetailSection>}
          {entry.trustFuturePredictionsMore && (
            <DetailSection label="Trust shift">
              {capitalize(entry.trustFuturePredictionsMore)} in future
            </DetailSection>
          )}
        </section>
      ) : (
        <button
          onClick={onReflect}
          className="w-full px-4 py-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors"
        >
          Reflect on this prediction
        </button>
      )}

      <div className="flex justify-end pt-3 border-t border-gray-100">
        <button
          onClick={onDelete}
          className="text-xs uppercase tracking-wider text-gray-400 hover:text-red-500 transition-colors"
        >
          Delete entry
        </button>
      </div>
    </div>
  );
}

function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">
        {label}
      </div>
      <div className="text-sm text-gray-800 leading-snug whitespace-pre-wrap">{children}</div>
    </div>
  );
}

function DetailBox({
  label,
  value,
  compact,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`bg-white border border-gray-200 rounded-xl px-3 ${compact ? 'py-1.5' : 'py-2'}`}
    >
      <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500">{label}</div>
      <div className={`mt-0.5 ${compact ? 'text-base' : 'text-xl'} font-semibold text-gray-900`}>
        {value}
      </div>
    </div>
  );
}

// ---------- Helpers ----------

function capitalize<T extends string>(s: T): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function emptyToUndef(s: string): string | undefined {
  const trimmed = s.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
