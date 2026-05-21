import { useEffect, useMemo, useState } from 'react';
import type { Book, BookStatus } from '../types';

interface BooksViewProps {
  books: Book[];
  onAdd: (input: { title: string; author: string; totalPages: number; status: BookStatus }) => Book;
  onUpdate: (
    id: string,
    updates: Partial<Pick<Book, 'title' | 'author' | 'totalPages' | 'notes' | 'status' | 'currentPage'>>
  ) => void;
  onUpdateProgress: (id: string, currentPage: number) => void;
  onMarkReading: (id: string) => void;
  onMarkFinished: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatShortDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function percent(b: Book): number {
  if (b.totalPages <= 0) return 0;
  return Math.min(100, Math.round((b.currentPage / b.totalPages) * 100));
}

export default function BooksView({
  books,
  onAdd,
  onUpdate,
  onUpdateProgress,
  onMarkReading,
  onMarkFinished,
  onDelete,
}: BooksViewProps) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [progressId, setProgressId] = useState<string | null>(null);
  const [showFinished, setShowFinished] = useState(false);

  const reading = useMemo(
    () => books.filter((b) => b.status === 'reading').sort((a, b) => a.title.localeCompare(b.title)),
    [books]
  );
  const want = useMemo(
    () => books.filter((b) => b.status === 'want').sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [books]
  );
  const finished = useMemo(
    () =>
      books
        .filter((b) => b.status === 'finished')
        .sort((a, b) => (b.finishedAt || '').localeCompare(a.finishedAt || '')),
    [books]
  );

  const editing = editingId ? books.find((b) => b.id === editingId) ?? null : null;
  const progressBook = progressId ? books.find((b) => b.id === progressId) ?? null : null;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">Books</h2>
          <button
            onClick={() => setAdding(true)}
            className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            + Add
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-5">What you&rsquo;re reading, what&rsquo;s next, what&rsquo;s done.</p>

        {books.length === 0 ? (
          <EmptyState onAdd={() => setAdding(true)} />
        ) : (
          <>
            {/* Now reading — the surface that matters most day-to-day */}
            <Section title="Now reading" count={reading.length}>
              {reading.length === 0 ? (
                <EmptySection text="Nothing in progress. Tap a book in &ldquo;Want to read&rdquo; to start it." />
              ) : (
                <ul className="space-y-2">
                  {reading.map((b) => (
                    <ReadingCard
                      key={b.id}
                      book={b}
                      onUpdateProgress={() => setProgressId(b.id)}
                      onEdit={() => setEditingId(b.id)}
                    />
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Want to read" count={want.length} className="mt-6">
              {want.length === 0 ? (
                <EmptySection text="No backlog. Add a book to get started." />
              ) : (
                <ul className="space-y-2">
                  {want.map((b) => (
                    <WantCard
                      key={b.id}
                      book={b}
                      onStart={() => onMarkReading(b.id)}
                      onEdit={() => setEditingId(b.id)}
                    />
                  ))}
                </ul>
              )}
            </Section>

            {finished.length > 0 && (
              <div className="mt-8">
                <button
                  onClick={() => setShowFinished((v) => !v)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  {showFinished ? 'Hide' : 'Show'} finished ({finished.length})
                </button>
                {showFinished && (
                  <ul className="mt-2 space-y-2">
                    {finished.map((b) => (
                      <FinishedCard key={b.id} book={b} onEdit={() => setEditingId(b.id)} />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {progressBook && (
        <ProgressModal
          book={progressBook}
          onSave={(page) => {
            onUpdateProgress(progressBook.id, page);
            setProgressId(null);
          }}
          onCancel={() => setProgressId(null)}
        />
      )}

      {adding && (
        <BookModal
          book={null}
          onSave={(input) => {
            onAdd(input);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {editing && (
        <BookModal
          book={editing}
          onSave={(input) => {
            onUpdate(editing.id, input);
            setEditingId(null);
          }}
          onMarkFinished={
            editing.status !== 'finished'
              ? () => {
                  onMarkFinished(editing.id);
                  setEditingId(null);
                }
              : undefined
          }
          onDelete={() => {
            if (confirm('Delete this book and its progress? This cannot be undone.')) {
              onDelete(editing.id);
              setEditingId(null);
            }
          }}
          onCancel={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

// ---------- Section frame ----------

function Section({
  title,
  count,
  children,
  className = '',
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">{title}</h3>
        <span className="text-[11px] text-gray-400 tabular-nums">{count}</span>
      </div>
      {children}
    </section>
  );
}

function EmptySection({ text }: { text: string }) {
  return <p className="text-xs text-gray-400 px-1">{text}</p>;
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center bg-white border border-gray-200 rounded-2xl p-8 mt-2">
      <h3 className="text-base font-semibold text-gray-900 mb-1">Add your first book</h3>
      <p className="text-sm text-gray-500 mb-5 leading-relaxed">
        Anything you want to read, or anything you&rsquo;re part-way through. Track it with one number: the page you&rsquo;re on.
      </p>
      <button
        onClick={onAdd}
        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
      >
        Add a book
      </button>
    </div>
  );
}

// ---------- Cards ----------

function ReadingCard({
  book,
  onUpdateProgress,
  onEdit,
}: {
  book: Book;
  onUpdateProgress: () => void;
  onEdit: () => void;
}) {
  const pct = percent(book);
  const hasTotal = book.totalPages > 0;
  return (
    <li className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-stretch">
        <button onClick={onUpdateProgress} className="flex-1 text-left px-4 py-3 hover:bg-gray-50 transition-colors">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">{book.title}</div>
              {book.author && <div className="text-[11px] text-gray-500 truncate">{book.author}</div>}
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-base font-semibold text-gray-900 tabular-nums">
                {book.currentPage}
                {hasTotal && <span className="text-gray-400 font-normal"> / {book.totalPages}</span>}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-gray-400">
                {hasTotal ? `${pct}%` : 'page'}
              </div>
            </div>
          </div>
          {hasTotal && (
            <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
          <div className="text-[11px] text-indigo-600 font-medium mt-2">Update progress &rarr;</div>
        </button>
        <EditButton onClick={onEdit} />
      </div>
    </li>
  );
}

function WantCard({
  book,
  onStart,
  onEdit,
}: {
  book: Book;
  onStart: () => void;
  onEdit: () => void;
}) {
  return (
    <li className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-stretch">
        <button onClick={onStart} className="flex-1 text-left px-4 py-3 hover:bg-gray-50 transition-colors">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">{book.title}</div>
              {book.author && <div className="text-[11px] text-gray-500 truncate">{book.author}</div>}
            </div>
            <span className="text-[11px] text-indigo-600 font-medium flex-shrink-0">Start &rarr;</span>
          </div>
        </button>
        <EditButton onClick={onEdit} />
      </div>
    </li>
  );
}

function FinishedCard({ book, onEdit }: { book: Book; onEdit: () => void }) {
  return (
    <li className="bg-white border border-gray-200 rounded-xl overflow-hidden opacity-80">
      <div className="flex items-stretch">
        <button onClick={onEdit} className="flex-1 text-left px-4 py-3 hover:bg-gray-50 transition-colors">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-700 truncate">{book.title}</div>
              {book.author && <div className="text-[11px] text-gray-400 truncate">{book.author}</div>}
            </div>
            <span className="text-[11px] text-gray-400 flex-shrink-0 tabular-nums">
              {formatShortDate(book.finishedAt)}
            </span>
          </div>
        </button>
      </div>
    </li>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Edit"
      className="px-3 flex items-center text-gray-300 hover:text-gray-600 border-l border-gray-100"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );
}

// ---------- Progress modal — the primary interaction ----------

function ProgressModal({
  book,
  onSave,
  onCancel,
}: {
  book: Book;
  onSave: (page: number) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(String(book.currentPage));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const parsed = Math.max(0, parseInt(value, 10) || 0);
  const cap = book.totalPages > 0 ? book.totalPages : Number.POSITIVE_INFINITY;
  const clamped = Math.min(parsed, cap);
  const willFinish = book.totalPages > 0 && clamped >= book.totalPages;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onCancel}
    >
      <div
        className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Current page</div>
        <div className="text-base font-semibold text-gray-900 mb-4 truncate">{book.title}</div>

        <input
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          placeholder="Page number"
          className="w-full px-4 py-3 text-2xl font-semibold text-center tabular-nums border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
          autoFocus
        />
        {book.totalPages > 0 && (
          <div className="text-[11px] text-gray-400 text-center mt-1">
            of {book.totalPages}
            {willFinish && <span className="text-green-600 ml-1 font-medium">&middot; will mark finished</span>}
          </div>
        )}

        <div className="flex items-center gap-2 mt-5">
          <button
            onClick={() => onSave(clamped)}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Add / edit modal ----------

function BookModal({
  book,
  onSave,
  onMarkFinished,
  onDelete,
  onCancel,
}: {
  book: Book | null;
  onSave: (input: { title: string; author: string; totalPages: number; status: BookStatus }) => void;
  onMarkFinished?: () => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(book?.title ?? '');
  const [author, setAuthor] = useState(book?.author ?? '');
  const [totalPages, setTotalPages] = useState(book ? String(book.totalPages || '') : '');
  const [status, setStatus] = useState<BookStatus>(book?.status ?? 'want');

  const canSave = title.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      title: title.trim(),
      author: author.trim(),
      totalPages: parseInt(totalPages, 10) || 0,
      status,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onCancel}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">{book ? 'Edit book' : 'New book'}</h3>
        </div>

        <div className="px-5 py-4 space-y-4">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Atomic Habits"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
          </Field>

          <Field label="Author">
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g. James Clear"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </Field>

          <Field label="Total pages" hint="Leave blank if you don't know — you'll still see the page number, just no progress bar.">
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              value={totalPages}
              onChange={(e) => setTotalPages(e.target.value)}
              placeholder="e.g. 320"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </Field>

          <Field label="Status">
            <div className="flex gap-2">
              {(['want', 'reading', 'finished'] as BookStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    status === s
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {s === 'want' ? 'Want to read' : s === 'reading' ? 'Reading now' : 'Finished'}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
        </div>

        {(onMarkFinished || onDelete) && (
          <div className="px-5 pb-5 -mt-1 flex items-center justify-between">
            {onMarkFinished && (
              <button
                onClick={onMarkFinished}
                className="text-xs text-green-600 hover:text-green-800 font-medium"
              >
                Mark finished
              </button>
            )}
            {onDelete && (
              <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-700">
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}
