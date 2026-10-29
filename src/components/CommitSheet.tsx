import { useState } from 'react';
import type { TaskBlock, BlockCommitment } from '../types';
import { formatTime24to12 } from '../utils/dateHelpers';
import { blockStartTime } from '../utils/calendarLayout';

// Turning a block into a decision.
//
// Four prompts, in the order that makes them work: see it, feel it, decline
// the alternative, then picture it finished *against* what stands in the
// way. The third is the one that does the work — a block becomes a
// commitment when the other things you could be doing stop being quietly
// available, and naming one out loud is what makes that happen.
//
// Only the alternative is required. The rest helps and can be skipped,
// because a flow that demands six answers at 10pm is a flow nobody runs
// twice.

const STEPS = ['See it', 'Feel it', 'Decide', 'Finish it'] as const;

export default function CommitSheet({
  block,
  onSave,
  onUnlock,
  onClose,
}: {
  block: TaskBlock;
  onSave: (commitment: BlockCommitment) => void;
  onUnlock?: () => void;
  onClose: () => void;
}) {
  const existing = block.commitment;
  const [step, setStep] = useState(0);
  const [scene, setScene] = useState(existing?.scene ?? '');
  const [feel, setFeel] = useState(existing?.feel ?? '');
  const [instead, setInstead] = useState(existing?.instead ?? '');
  const [shield, setShield] = useState(existing?.shield ?? '');
  const [doneLooksLike, setDone] = useState(existing?.doneLooksLike ?? '');
  const [obstacle, setObstacle] = useState(existing?.obstacle ?? '');

  const start = blockStartTime(block);
  const when = block.isAllDay ? 'that day' : formatTime24to12(start);
  const canLock = instead.trim().length > 0;

  const commit = () => {
    onSave({
      locked: true,
      lockedAt: new Date().toISOString(),
      scene: scene.trim() || undefined,
      feel: feel.trim() || undefined,
      instead: instead.trim(),
      shield: shield.trim() || undefined,
      doneLooksLike: doneLooksLike.trim() || undefined,
      obstacle: obstacle.trim() || undefined,
      outcome: existing?.outcome,
      reviewedAt: existing?.reviewedAt,
    });
  };

  const field =
    'mt-1 w-full px-2.5 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const label =
    'text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[88vh] flex flex-col bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
              {block.mainTask}
            </h2>
            <button
              onClick={onClose}
              className="text-[11px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 shrink-0"
            >
              Close
            </button>
          </div>
          <div className="flex gap-1 mt-2">
            {STEPS.map((s, i) => (
              <button
                key={s}
                onClick={() => setStep(i)}
                className={`flex-1 text-[10px] font-semibold py-1 rounded-md border transition-colors ${
                  step === i
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40'
                    : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {step === 0 && (
            <>
              <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed">
                It is {when}. Picture the room. Where are you sitting, what is
                open in front of you, what can you hear?
              </p>
              <label className="block">
                <span className={label}>The scene</span>
                <textarea
                  value={scene}
                  onChange={(e) => setScene(e.target.value)}
                  rows={3}
                  placeholder="Desk by the window, iPad on the stand, lecture already open, headphones on"
                  className={field}
                />
              </label>
            </>
          )}

          {step === 1 && (
            <>
              <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed">
                Not how you feel about it now — how it will feel in your body
                once you are twenty minutes in.
              </p>
              <label className="block">
                <span className={label}>One word</span>
                <input
                  value={feel}
                  onChange={(e) => setFeel(e.target.value)}
                  placeholder="settled"
                  className={field}
                />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {['settled', 'absorbed', 'steady', 'quick', 'heavy but moving'].map((w) => (
                  <button
                    key={w}
                    onClick={() => setFeel(w)}
                    className="px-2 py-0.5 text-[11px] rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400"
                  >
                    {w}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed">
                This is the one that matters. A thing is only decided when the
                alternatives stop being quietly available. What are you
                declining by putting this here?
              </p>
              <label className="block">
                <span className={label}>Instead of this, I could — and am not</span>
                <input
                  value={instead}
                  onChange={(e) => setInstead(e.target.value)}
                  placeholder="catching up on Anki, or going back to bed"
                  className={field}
                />
              </label>
              <label className="block">
                <span className={label}>When something pulls at me</span>
                <input
                  value={shield}
                  onChange={(e) => setShield(e.target.value)}
                  placeholder="phone in the other room, and I finish the hour first"
                  className={field}
                />
              </label>
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed">
                The moment it is over, concretely — and then, immediately, what
                stands in the way. Picturing the finish on its own tends to
                take the energy out of starting; pairing it with the obstacle
                is the part that helps.
              </p>
              <label className="block">
                <span className={label}>Done looks like</span>
                <input
                  value={doneLooksLike}
                  onChange={(e) => setDone(e.target.value)}
                  placeholder="map closed, three cards made, laptop shut"
                  className={field}
                />
              </label>
              <label className="block">
                <span className={label}>What is in the way</span>
                <input
                  value={obstacle}
                  onChange={(e) => setObstacle(e.target.value)}
                  placeholder="I will be tired and it will feel like it can wait"
                  className={field}
                />
              </label>
            </>
          )}
        </div>

        <footer className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
          {existing?.locked && onUnlock ? (
            <button
              onClick={onUnlock}
              className="text-[11px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 hover:text-rose-600 dark:hover:text-rose-400"
            >
              Unlock
            </button>
          ) : (
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {canLock ? 'Only the alternative is required.' : 'Name what you are declining to lock this.'}
            </span>
          )}
          <div className="flex items-center gap-2 shrink-0">
            {step < 3 && (
              <button
                onClick={() => setStep(step + 1)}
                className="px-2.5 py-1.5 text-[12px] font-semibold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400"
              >
                Next
              </button>
            )}
            <button
              onClick={commit}
              disabled={!canLock}
              className="px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {existing?.locked ? 'Update' : 'Lock it'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
