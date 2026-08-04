import { useState } from 'react';
import type { PrincipleEntry } from '../types';

// Principles — an ACT-flavored regret → value → action worksheet + creed.
//
// Two views:
//   Table  — the full 3-column exercise: Regret / Value / Action
//   Creed  — just the Action lines, big and clean; the artifact you
//            actually use
//
// Design principle: only Action is required. Some entries start from a
// regret you're working through; others just declare a principle you
// want to live by. Both are valid.

type ViewMode = 'table' | 'creed';

interface PrinciplesViewProps {
  entries: PrincipleEntry[];
  onAdd: (input: { regret?: string; value?: string; action: string }) => PrincipleEntry | null;
  onUpdate: (id: string, updates: Partial<Pick<PrincipleEntry, 'regret' | 'value' | 'action'>>) => void;
  onDelete: (id: string) => void;
}

export default function PrinciplesView({
  entries,
  onAdd,
  onUpdate,
  onDelete,
}: PrinciplesViewProps) {
  const [mode, setMode] = useState<ViewMode>('table');
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        <header className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">Principles</h2>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed max-w-lg mx-auto">
            Turn regret into policy. Each entry: what you regret (optional),
            what you value about it, and what you'll do from now on. The
            Action column is your creed — the artifact you actually use.
          </p>
        </header>

        {/* Mode toggle */}
        <div className="flex justify-center">
          <div className="inline-flex bg-white border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setMode('table')}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === 'table'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              📋 Table
            </button>
            <button
              onClick={() => setMode('creed')}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === 'creed'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              🌟 Creed
            </button>
          </div>
        </div>

        {mode === 'table' ? (
          <TableMode
            entries={entries}
            adding={adding}
            onOpenAdd={() => setAdding(true)}
            onCloseAdd={() => setAdding(false)}
            onAdd={(input) => {
              const r = onAdd(input);
              if (r) setAdding(false);
            }}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ) : (
          <CreedMode entries={entries} />
        )}
      </div>
    </div>
  );
}

// ---------- Table mode ----------

function TableMode({
  entries,
  adding,
  onOpenAdd,
  onCloseAdd,
  onAdd,
  onUpdate,
  onDelete,
}: {
  entries: PrincipleEntry[];
  adding: boolean;
  onOpenAdd: () => void;
  onCloseAdd: () => void;
  onAdd: (input: { regret?: string; value?: string; action: string }) => void;
  onUpdate: (id: string, updates: Partial<Pick<PrincipleEntry, 'regret' | 'value' | 'action'>>) => void;
  onDelete: (id: string) => void;
}) {
  if (entries.length === 0 && !adding) {
    return (
      <div className="text-center space-y-4 py-6">
        <div className="text-[13px] text-gray-600 max-w-md mx-auto leading-relaxed">
          Nothing here yet. Start with something you regret — even something
          small — and follow it to what you actually value and what you'd do
          differently from now on.
        </div>
        <button
          onClick={onOpenAdd}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700"
        >
          + Add first principle
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Column headers */}
      <div className="grid grid-cols-3 gap-2 text-[10px] uppercase tracking-wider font-bold text-gray-500 px-3">
        <div>What's the regret?</div>
        <div>What's the value?</div>
        <div>What's the action?</div>
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {entries.map((e) => (
          <PrincipleRow
            key={e.id}
            entry={e}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </div>

      {/* Add-form or trigger */}
      {adding ? (
        <PrincipleAddForm onCancel={onCloseAdd} onSubmit={onAdd} />
      ) : (
        <button
          onClick={onOpenAdd}
          className="w-full py-2 text-[12px] font-semibold text-gray-500 border border-dashed border-gray-300 rounded-xl hover:border-indigo-400 hover:text-indigo-700"
        >
          + Add another
        </button>
      )}
    </>
  );
}

function PrincipleRow({
  entry,
  onUpdate,
  onDelete,
}: {
  entry: PrincipleEntry;
  onUpdate: (id: string, updates: Partial<Pick<PrincipleEntry, 'regret' | 'value' | 'action'>>) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    regret: entry.regret || '',
    value: entry.value || '',
    action: entry.action,
  });

  const save = () => {
    onUpdate(entry.id, {
      regret: draft.regret,
      value: draft.value,
      action: draft.action,
    });
    setEditing(false);
  };
  const cancel = () => {
    setDraft({
      regret: entry.regret || '',
      value: entry.value || '',
      action: entry.action,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="bg-white border border-indigo-200 rounded-xl p-3 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <textarea
            value={draft.regret}
            onChange={(e) => setDraft({ ...draft, regret: e.target.value })}
            placeholder="Regret (optional)"
            rows={3}
            className="w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none bg-white"
          />
          <textarea
            value={draft.value}
            onChange={(e) => setDraft({ ...draft, value: e.target.value })}
            placeholder="Underlying value(s)"
            rows={3}
            className="w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none bg-white"
          />
          <textarea
            value={draft.action}
            onChange={(e) => setDraft({ ...draft, action: e.target.value })}
            placeholder="Going-forward action (required)"
            rows={3}
            className="w-full px-2 py-1.5 text-[12px] border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none bg-white"
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={cancel}
            className="text-[11px] text-gray-500 hover:text-gray-800"
          >
            cancel
          </button>
          <button
            onClick={save}
            disabled={!draft.action.trim()}
            className="px-2 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded disabled:opacity-40"
          >
            save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 group">
      <div className="grid grid-cols-3 gap-2 text-[13px] text-gray-800 leading-relaxed">
        <div className={entry.regret ? '' : 'text-gray-300 italic'}>
          {entry.regret || '—'}
        </div>
        <div className={entry.value ? '' : 'text-gray-300 italic'}>
          {entry.value || '—'}
        </div>
        <div className="font-semibold text-indigo-900">
          {entry.action}
        </div>
      </div>
      <div className="flex items-center justify-end gap-3 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setEditing(true)}
          className="text-[10px] font-semibold text-gray-500 hover:text-gray-900"
        >
          edit
        </button>
        <button
          onClick={() => {
            if (confirm('Delete this principle?')) onDelete(entry.id);
          }}
          className="text-[10px] font-semibold text-gray-400 hover:text-red-500"
        >
          delete
        </button>
      </div>
    </div>
  );
}

function PrincipleAddForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (input: { regret?: string; value?: string; action: string }) => void;
}) {
  const [regret, setRegret] = useState('');
  const [value, setValue] = useState('');
  const [action, setAction] = useState('');
  const commit = () => {
    if (!action.trim()) return;
    onSubmit({
      regret: regret.trim() || undefined,
      value: value.trim() || undefined,
      action: action.trim(),
    });
    setRegret(''); setValue(''); setAction('');
  };
  return (
    <div className="bg-white border border-indigo-200 rounded-xl p-3 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <textarea
          value={regret}
          onChange={(e) => setRegret(e.target.value)}
          placeholder="Regret (optional) — what you carry"
          rows={3}
          className="w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none bg-white"
        />
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Value — what it's about"
          rows={3}
          className="w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none bg-white"
        />
        <textarea
          autoFocus
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="Action (required) — what you'll do from now on"
          rows={3}
          className="w-full px-2 py-1.5 text-[12px] border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none bg-white"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="text-[11px] text-gray-500 hover:text-gray-800"
        >
          cancel
        </button>
        <button
          onClick={commit}
          disabled={!action.trim()}
          className="px-2 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded disabled:opacity-40"
        >
          save
        </button>
      </div>
      <p className="text-[10px] text-gray-400">
        Only Action is required — sometimes you set a principle without a specific regret.
      </p>
    </div>
  );
}

// ---------- Creed mode ----------

function CreedMode({ entries }: { entries: PrincipleEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="text-center text-[13px] text-gray-500 py-8">
        Your creed will appear here once you write some Actions in the Table mode.
      </div>
    );
  }
  return (
    <div className="space-y-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-gray-400 text-center">
        Your creed · {entries.length} {entries.length === 1 ? 'principle' : 'principles'}
      </div>
      <ul className="space-y-2">
        {entries.map((e, i) => (
          <li
            key={e.id}
            className="bg-white border border-indigo-100 rounded-2xl px-5 py-4 shadow-sm"
          >
            <div className="flex items-baseline gap-3">
              <span className="text-[10px] font-mono text-indigo-400 tabular-nums">
                {String(i + 1).padStart(2, '0')}
              </span>
              <p className="flex-1 text-base font-semibold text-indigo-900 leading-relaxed">
                {e.action}
              </p>
            </div>
            {e.value && (
              <div className="text-[11px] text-gray-500 mt-1 pl-8">
                <span className="uppercase tracking-wider font-bold mr-1">why:</span>
                {e.value}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
