import { useState } from 'react';
import type { ResetActivity, ResetDirection } from '../types';

// The library of ways back into the window of tolerance.
//
// Two columns, because the two directions are genuinely opposite moves and
// mixing them into one list is how you end up doing a calming exercise when
// you are already shut down. Down-regulating comes first: activation is the
// state in which you are least able to read a long list.

const DIRECTION_META: Record<
  ResetDirection,
  { title: string; from: string; emoji: string; blurb: string; accent: string; bg: string; border: string }
> = {
  down: {
    title: 'Bring it down',
    from: 'Hyper → window',
    emoji: '🔥',
    blurb: 'Wired, racing, braced. These work on the body, because when you are activated "think about it differently" is the instruction you cannot follow.',
    accent: 'text-rose-700 dark:text-rose-300',
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    border: 'border-rose-200 dark:border-rose-800',
  },
  up: {
    title: 'Bring it up',
    from: 'Hypo → window',
    emoji: '🧊',
    blurb: 'Foggy, flat, far away. These work by input — sound, movement, temperature, another person — because there is nothing to calm down.',
    accent: 'text-sky-700 dark:text-sky-300',
    bg: 'bg-sky-50 dark:bg-sky-950/40',
    border: 'border-sky-200 dark:border-sky-800',
  },
};

export default function RegulateView({
  activities,
  usage,
  onAdd,
  onUpdate,
  onDelete,
  onResetDefaults,
  onOpenStuck,
}: {
  activities: ResetActivity[];
  /** label → how many times it has been tapped from a state log entry. */
  usage: Map<string, { total: number; hyper: number; hypo: number }>;
  onAdd: (input: { emoji: string; label: string; direction: ResetDirection; how?: string; minutes?: number }) => void;
  onUpdate: (id: string, patch: Partial<Omit<ResetActivity, 'id'>>) => void;
  onDelete: (id: string) => void;
  onResetDefaults: () => void;
  onOpenStuck: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<ResetDirection | null>(null);

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 space-y-5">
      <header>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Regulate
          </h1>
          <button
            onClick={() => setEditing((e) => !e)}
            className="text-[11px] uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-snug">
          Your own ways back into the window of tolerance. When you log hyper or hypo on Today,
          the matching set appears there — this is where you shape it.
        </p>
      </header>

      {/* The model, in three lines. Here rather than on Today because Today is
          where you act and this is where you learn the vocabulary. */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-2">
          The window
        </div>
        <dl className="space-y-1.5 text-[12px] leading-snug">
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 font-semibold text-rose-700 dark:text-rose-300">🔥 Hyper</dt>
            <dd className="text-gray-600 dark:text-gray-400">Too much. Racing, braced, can’t settle. Needs bringing down.</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 font-semibold text-emerald-700 dark:text-emerald-300">🎯 Window</dt>
            <dd className="text-gray-600 dark:text-gray-400">Workable. You can think and feel at the same time. Nothing to fix.</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 font-semibold text-sky-700 dark:text-sky-300">🧊 Hypo</dt>
            <dd className="text-gray-600 dark:text-gray-400">Too little. Foggy, flat, far away. Needs bringing up.</dd>
          </div>
        </dl>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2.5 leading-snug">
          Both ends feel bad and they need opposite responses — which is the whole reason it is
          worth naming which one you are in before reaching for anything.
        </p>
      </section>

      {(['down', 'up'] as ResetDirection[]).map((dir) => {
        const meta = DIRECTION_META[dir];
        const items = activities.filter((a) => a.direction === dir);
        return (
          <section key={dir} className={`rounded-2xl border ${meta.border} ${meta.bg} px-4 py-3`}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className={`text-sm font-semibold ${meta.accent}`}>
                {meta.emoji} {meta.title}
              </h2>
              <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
                {meta.from}
              </span>
            </div>
            <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1 mb-3 leading-snug">
              {meta.blurb}
            </p>

            {items.length === 0 && (
              <p className="text-[12px] text-gray-500 dark:text-gray-400 italic mb-3">
                Nothing here yet.
              </p>
            )}

            <ul className="space-y-1.5">
              {items.map((a) =>
                editing ? (
                  <EditRow key={a.id} activity={a} onUpdate={onUpdate} onDelete={onDelete} />
                ) : (
                  <li
                    key={a.id}
                    className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-base leading-none">{a.emoji}</span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {a.label}
                      </span>
                      {a.minutes !== undefined && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
                          {a.minutes}m
                        </span>
                      )}
                      {(usage.get(a.label)?.total ?? 0) > 0 && (
                        <span
                          className="ml-auto text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 tabular-nums"
                          title="Times you've tapped this from a state log"
                        >
                          used {usage.get(a.label)!.total}×
                        </span>
                      )}
                    </div>
                    {a.how && (
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                        {a.how}
                      </p>
                    )}
                  </li>
                )
              )}
            </ul>

            {adding === dir ? (
              <AddForm
                direction={dir}
                onCancel={() => setAdding(null)}
                onSave={(input) => {
                  onAdd(input);
                  setAdding(null);
                }}
              />
            ) : (
              <button
                onClick={() => setAdding(dir)}
                className="mt-2 text-[11px] uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
              >
                + Add your own
              </button>
            )}
          </section>
        );
      })}

      {/* Cross-link. Stuck and Regulate answer different questions and the
          wrong one is a real dead end, so each says so out loud. */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3">
        <p className="text-[12px] text-gray-600 dark:text-gray-400 leading-snug">
          <strong className="text-gray-800 dark:text-gray-200">In the window and still not starting?</strong>{' '}
          That is a different problem — inertia, not arousal. Your one-tap starters live on the
          Stuck screen.
        </p>
        <button
          onClick={onOpenStuck}
          className="mt-2 text-[11px] uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
        >
          Go to Stuck →
        </button>
      </section>

      {editing && (
        <div className="flex justify-end">
          <button
            onClick={() => {
              if (confirm('Replace your reset list with the defaults? Your own entries will be lost.')) {
                onResetDefaults();
              }
            }}
            className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500 hover:text-red-500"
          >
            ↺ Reset to defaults
          </button>
        </div>
      )}
    </div>
  );
}

function EditRow({
  activity,
  onUpdate,
  onDelete,
}: {
  activity: ResetActivity;
  onUpdate: (id: string, patch: Partial<Omit<ResetActivity, 'id'>>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <li className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          value={activity.emoji}
          onChange={(e) => onUpdate(activity.id, { emoji: e.target.value })}
          aria-label="Emoji"
          className="w-12 px-2 py-1 text-base text-center bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <input
          value={activity.label}
          onChange={(e) => onUpdate(activity.id, { label: e.target.value })}
          aria-label="Label"
          className="flex-1 min-w-0 px-2 py-1 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <input
          type="number"
          min={0}
          value={activity.minutes ?? ''}
          onChange={(e) =>
            onUpdate(activity.id, {
              minutes: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)),
            })
          }
          placeholder="min"
          aria-label="Minutes"
          className="w-14 px-2 py-1 text-sm tabular-nums bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <button
          onClick={() => onDelete(activity.id)}
          className="text-lg leading-none text-gray-300 dark:text-gray-600 hover:text-red-500 px-1"
          title="Delete"
        >
          &times;
        </button>
      </div>
      <input
        value={activity.how ?? ''}
        onChange={(e) => onUpdate(activity.id, { how: e.target.value || undefined })}
        placeholder="How — the bit you'll forget in the moment"
        aria-label="How"
        className="w-full px-2 py-1 text-[12px] text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />
    </li>
  );
}

function AddForm({
  direction,
  onSave,
  onCancel,
}: {
  direction: ResetDirection;
  onSave: (input: { emoji: string; label: string; direction: ResetDirection; how?: string; minutes?: number }) => void;
  onCancel: () => void;
}) {
  const [emoji, setEmoji] = useState('');
  const [label, setLabel] = useState('');
  const [how, setHow] = useState('');
  const [minutes, setMinutes] = useState('');

  const save = () => {
    if (!label.trim()) return;
    onSave({
      emoji: emoji.trim() || '•',
      label: label.trim(),
      direction,
      how: how.trim() || undefined,
      minutes: minutes === '' ? undefined : Math.max(0, Number(minutes)),
    });
  };

  return (
    <div className="mt-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          placeholder="🌿"
          aria-label="Emoji"
          className="w-12 px-2 py-1 text-base text-center bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="What you do"
          aria-label="Label"
          className="flex-1 min-w-0 px-2 py-1 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <input
          type="number"
          min={0}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          placeholder="min"
          aria-label="Minutes"
          className="w-14 px-2 py-1 text-sm tabular-nums bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>
      <input
        value={how}
        onChange={(e) => setHow(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        placeholder="How (optional)"
        aria-label="How"
        className="w-full px-2 py-1 text-[12px] text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />
      <div className="flex justify-end gap-2 pt-0.5">
        <button onClick={onCancel} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={!label.trim()}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 dark:disabled:bg-gray-800 dark:disabled:text-gray-600"
        >
          Add
        </button>
      </div>
    </div>
  );
}
