import { useMemo, useState } from 'react';
import type { NoteEntry } from '../types';

// Notes — a stream of free-form reflections. Zero structure by design;
// the value is friction-free capture and easy scroll-back. Search bar
// filters by substring; #hashtags in the text auto-render as chips.

interface NotesViewProps {
  entries: NoteEntry[];
  onAddNote: (text: string) => NoteEntry | null;
  onDeleteNote: (id: string) => void;
  onUpdateNote: (id: string, text: string) => void;
}

const HASHTAG_RE = /(#[\w-]+)/g;

function HashtaggedText({ text }: { text: string }) {
  const parts = text.split(HASHTAG_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('#') && part.length > 1) {
          return (
            <span
              key={i}
              className="inline-block px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full mx-0.5 align-baseline"
            >
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  const oneDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((now.getTime() - d.getTime()) / oneDay);
  if (diffDays === 1) {
    return `yesterday · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  if (diffDays < 7) {
    return d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function NotesView({
  entries,
  onAddNote,
  onDeleteNote,
  onUpdateNote,
}: NotesViewProps) {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((n) => n.text.toLowerCase().includes(q));
  }, [entries, query]);

  const commit = () => {
    if (!draft.trim()) return;
    onAddNote(draft);
    setDraft('');
  };

  const startEdit = (n: NoteEntry) => {
    setEditingId(n.id);
    setEditDraft(n.text);
  };
  const saveEdit = () => {
    if (!editingId || !editDraft.trim()) return;
    onUpdateNote(editingId, editDraft);
    setEditingId(null);
    setEditDraft('');
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft('');
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        <header className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">Journal</h2>
          <p className="text-xs text-gray-500 mt-1">
            Reflections, observations, ideas — anything that isn't a task. #hashtags become chips.
          </p>
        </header>

        {/* Compose */}
        <section className="bg-white border border-gray-200 rounded-2xl p-3 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Cmd/Ctrl + Enter submits; plain Enter keeps line-breaks so
              // multi-line thoughts don't get chopped.
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && draft.trim()) {
                e.preventDefault();
                commit();
              }
            }}
            placeholder="What are you noticing? What did you just realize? Any thought counts."
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-400">
              ⌘/Ctrl + Enter to save
            </span>
            <button
              onClick={commit}
              disabled={!draft.trim()}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </section>

        {/* Search — only shows when there are entries */}
        {entries.length > 0 && (
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${entries.length} note${entries.length === 1 ? '' : 's'}`}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          />
        )}

        {/* Stream — newest first, chronological within */}
        {filtered.length === 0 && entries.length === 0 && (
          <div className="text-center text-[12px] text-gray-500 border-2 border-dashed border-gray-200 rounded-2xl bg-white py-8 px-4">
            Nothing here yet. Write something you don't want to lose.
          </div>
        )}
        {filtered.length === 0 && entries.length > 0 && (
          <div className="text-center text-[12px] text-gray-500 py-4">
            No notes match "{query}".
          </div>
        )}

        <ul className="space-y-2">
          {filtered.map((n) => (
            <li key={n.id} className="bg-white border border-gray-200 rounded-2xl p-3 group">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[11px] text-gray-400 tabular-nums">
                  {formatWhen(n.createdAt)}
                </span>
                {editingId !== n.id && (
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEdit(n)}
                      className="text-[10px] font-semibold text-gray-500 hover:text-gray-900"
                    >
                      edit
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this note?')) onDeleteNote(n.id);
                      }}
                      className="text-[10px] font-semibold text-gray-400 hover:text-red-500"
                    >
                      delete
                    </button>
                  </div>
                )}
              </div>
              {editingId === n.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={3}
                    autoFocus
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={cancelEdit}
                      className="text-[11px] text-gray-500 hover:text-gray-800"
                    >
                      cancel
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={!editDraft.trim()}
                      className="px-2 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded disabled:opacity-40"
                    >
                      save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                  <HashtaggedText text={n.text} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
