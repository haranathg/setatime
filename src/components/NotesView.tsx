import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { NoteEntry } from '../types';

// Journal — free-flowing timestamped stream.
//
// Design goals:
//   * Fastest possible capture: type + Enter = one timestamped entry.
//     Shift+Enter for a line break within the current entry (chat-app
//     convention). No Save button.
//   * Google-Doc "sections" feel via automatic time clustering: entries
//     within 5 minutes of each other render under a single time header,
//     so bursts of writing group visually. Bigger gaps break into new
//     sections.
//   * Markdown-lite rendering: bold, italic, headers, bullet lists,
//     plus the existing #hashtag chips and URL autolinks. Type
//     markdown, it renders. No toolbar, no WYSIWYG.
//   * Auto-focus on mount so opening the Journal = ready to write.
//
// Data model unchanged: NoteEntry { id, text, createdAt }. Existing
// notes render exactly the same, just in the new layout.

interface NotesViewProps {
  entries: NoteEntry[];
  onAddNote: (text: string) => NoteEntry | null;
  onDeleteNote: (id: string) => void;
  onUpdateNote: (id: string, text: string) => void;
}

const HASHTAG_RE = /(#[\w-]+)/g;
const URL_RE = /(https?:\/\/[^\s)]+)/g;
const BOLD_RE = /\*\*(.+?)\*\*/g;
const ITALIC_RE = /(?<!\*)\*([^*]+)\*(?!\*)/g;
const CLUSTER_MS = 5 * 60 * 1000;

// ---------- Markdown / inline rendering ----------
//
// Kept small and readable. Inline pass handles bold + italic +
// hashtag + URL. Line-level pass handles # header, ## subheader,
// - bullet list. Order matters: bold before italic (both use *),
// URL before hashtag (URL fragments can look tag-like).

// Inline text renderer: URL → link, #hashtag → chip, **bold**, *italic*.
// Uses map + Fragment wrapping (avoids flatMap's tight TS return types).
function renderInline(text: string, keyPrefix: string): React.ReactNode {
  const urlParts = text.split(URL_RE);
  return (
    <>
      {urlParts.map((urlChunk, urlIdx) => {
        if (urlIdx % 2 === 1) {
          return (
            <a
              key={`${keyPrefix}-url-${urlIdx}`}
              href={urlChunk}
              target="_blank"
              rel="noreferrer noopener"
              className="text-indigo-700 dark:text-indigo-300 underline underline-offset-2 hover:text-indigo-900 dark:hover:text-indigo-100 dark:text-indigo-100 break-all"
            >
              {urlChunk}
            </a>
          );
        }
        // Non-URL chunk: split for hashtags, then for bold, then italic.
        const hashParts = urlChunk.split(HASHTAG_RE);
        return (
          <Fragment key={`${keyPrefix}-nu-${urlIdx}`}>
            {hashParts.map((hashChunk, hIdx) => {
              if (hIdx % 2 === 1) {
                return (
                  <span
                    key={`${keyPrefix}-h-${urlIdx}-${hIdx}`}
                    className="inline-block px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-full mx-0.5 align-baseline"
                  >
                    {hashChunk}
                  </span>
                );
              }
              return (
                <Fragment key={`${keyPrefix}-nh-${urlIdx}-${hIdx}`}>
                  {applyInlineFormatting(hashChunk, `${keyPrefix}-b-${urlIdx}-${hIdx}`)}
                </Fragment>
              );
            })}
          </Fragment>
        );
      })}
    </>
  );
}

function applyInlineFormatting(text: string, keyPrefix: string): React.ReactNode {
  const boldParts = text.split(BOLD_RE);
  return (
    <>
      {boldParts.map((part, bIdx) => {
        if (bIdx % 2 === 1) {
          return (
            <strong key={`${keyPrefix}-bold-${bIdx}`} className="font-bold">
              {applyItalic(part, `${keyPrefix}-bold-${bIdx}`)}
            </strong>
          );
        }
        return (
          <Fragment key={`${keyPrefix}-nb-${bIdx}`}>
            {applyItalic(part, `${keyPrefix}-p-${bIdx}`)}
          </Fragment>
        );
      })}
    </>
  );
}

function applyItalic(text: string, keyPrefix: string): React.ReactNode {
  const parts = text.split(ITALIC_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          return <em key={`${keyPrefix}-it-${i}`} className="italic">{part}</em>;
        }
        return <Fragment key={`${keyPrefix}-t-${i}`}>{part}</Fragment>;
      })}
    </>
  );
}

function renderMarkdown(text: string, keyPrefix: string): React.ReactNode {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let listBuffer: React.ReactNode[] = [];
  const flushList = () => {
    if (listBuffer.length > 0) {
      nodes.push(
        <ul key={`${keyPrefix}-ul-${nodes.length}`} className="list-disc pl-5 space-y-0.5 my-1">
          {listBuffer}
        </ul>
      );
      listBuffer = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '');
    const key = `${keyPrefix}-l-${i}`;
    if (line.startsWith('# ')) {
      flushList();
      nodes.push(
        <div key={key} className="text-base font-bold text-gray-900 dark:text-gray-100 mt-1">
          {renderInline(line.slice(2), key)}
        </div>
      );
      return;
    }
    if (line.startsWith('## ')) {
      flushList();
      nodes.push(
        <div key={key} className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-1">
          {renderInline(line.slice(3), key)}
        </div>
      );
      return;
    }
    if (line.startsWith('- ')) {
      listBuffer.push(
        <li key={key}>{renderInline(line.slice(2), key)}</li>
      );
      return;
    }
    flushList();
    if (line === '') {
      nodes.push(<div key={key} className="h-1" />);
      return;
    }
    nodes.push(
      <div key={key}>
        {renderInline(line, key)}
      </div>
    );
  });
  flushList();
  return nodes;
}

// ---------- Time formatting ----------

function formatClusterHeader(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const oneDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((now.getTime() - d.getTime()) / oneDay);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today · ${time}`;
  if (diffDays === 1) return `Yesterday · ${time}`;
  if (diffDays < 7) return `${d.toLocaleDateString([], { weekday: 'short' })} · ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${time}`;
}

// ---------- View ----------

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus on mount so opening the Journal = ready to write.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-grow the compose textarea up to 6 lines so multi-line drafts
  // have room without dominating the screen.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const max = 6 * 24; // ~6 lines
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [draft]);

  const commit = () => {
    if (!draft.trim()) return;
    onAddNote(draft);
    setDraft('');
    // Refocus the input after save for fast successive entries.
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  // Ascending for cluster walk; we'll reverse for display so newest is
  // at the top under the input.
  const sortedAsc = useMemo(
    () => [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [entries]
  );

  const filteredAsc = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedAsc;
    return sortedAsc.filter((n) => n.text.toLowerCase().includes(q));
  }, [sortedAsc, query]);

  // Build clusters: consecutive entries within CLUSTER_MS of each other
  // group under a single header. Bigger gaps start a new cluster.
  const clustersAsc = useMemo(() => {
    if (query.trim()) {
      // Don't cluster during search — each match stands alone with its time.
      return filteredAsc.map((n) => ({ headerTime: n.createdAt, entries: [n] }));
    }
    const out: { headerTime: string; entries: NoteEntry[] }[] = [];
    for (const n of filteredAsc) {
      const cur = out[out.length - 1];
      if (!cur) {
        out.push({ headerTime: n.createdAt, entries: [n] });
        continue;
      }
      const last = cur.entries[cur.entries.length - 1];
      const gap = new Date(n.createdAt).getTime() - new Date(last.createdAt).getTime();
      if (gap <= CLUSTER_MS) {
        cur.entries.push(n);
      } else {
        out.push({ headerTime: n.createdAt, entries: [n] });
      }
    }
    return out;
  }, [filteredAsc, query]);

  // Newest cluster at top for display (so the input at top has recent
  // context right below it).
  const clustersDesc = useMemo(() => [...clustersAsc].reverse(), [clustersAsc]);

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
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        <header className="text-center">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Journal</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Enter to save · Shift+Enter for a new line · **bold** · *italic* · # header · - list · #hashtag
          </p>
        </header>

        {/* Compose — always visible at the top */}
        <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-3">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commit();
              }
              // Shift+Enter falls through to default newline behavior.
            }}
            placeholder="What are you noticing?"
            rows={1}
            className="w-full px-2 py-1 text-sm border-0 focus:outline-none resize-none bg-transparent leading-relaxed"
            style={{ overflowY: 'hidden' }}
          />
          <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500 mt-1">
            <span>Enter to save · Shift+Enter for line break</span>
            <button
              onClick={commit}
              disabled={!draft.trim()}
              className="px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 dark:text-indigo-200 disabled:opacity-30"
            >
              save
            </button>
          </div>
        </section>

        {entries.length > 0 && (
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white dark:bg-gray-900"
          />
        )}

        {/* Empty / no-match states */}
        {entries.length === 0 && (
          <div className="text-center text-[12px] text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl bg-white dark:bg-gray-900 py-8 px-4">
            Nothing here yet. Type above — every Enter is a new timestamped entry.
          </div>
        )}
        {entries.length > 0 && filteredAsc.length === 0 && (
          <div className="text-center text-[12px] text-gray-500 dark:text-gray-400 py-4">
            No entries match "{query}".
          </div>
        )}

        {/* Clustered stream — newest cluster on top; within a cluster,
            entries render oldest-first (chronological within the burst). */}
        {clustersDesc.map((cluster) => (
          <section
            key={cluster.headerTime + '-' + cluster.entries[0].id}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden"
          >
            <div className="px-4 py-1.5 border-b border-gray-100 dark:border-gray-800 text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 flex items-center justify-between">
              <span>{formatClusterHeader(cluster.headerTime)}</span>
              {cluster.entries.length > 1 && (
                <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500 normal-case tracking-normal tabular-nums">
                  {cluster.entries.length} entries
                </span>
              )}
            </div>
            <ul className="divide-y divide-gray-100">
              {cluster.entries.map((n) => (
                <li key={n.id} className="group px-4 py-2">
                  {editingId === n.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={3}
                        autoFocus
                        className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={cancelEdit}
                          className="text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 dark:text-gray-200"
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
                    <>
                      <div className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
                        {renderMarkdown(n.text, n.id)}
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-3 mt-1">
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums mr-auto">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </span>
                        <button
                          onClick={() => startEdit(n)}
                          className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 dark:text-gray-100"
                        >
                          edit
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Delete this entry?')) onDeleteNote(n.id);
                          }}
                          className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 hover:text-red-500 dark:text-red-400"
                        >
                          delete
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
