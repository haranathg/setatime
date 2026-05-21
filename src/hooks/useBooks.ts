import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Book, BookStatus } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

export function useBooks() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setBooks(local.books?.books || []);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.books?.books) {
            // Same merge convention as brainDump: cloud wins by id, keep local-only.
            const byId = new Map<string, Book>();
            for (const b of cloud.books.books) byId.set(b.id, b);
            for (const b of local.books?.books || []) {
              if (!byId.has(b.id)) byId.set(b.id, b);
            }
            setBooks(Array.from(byId.values()));
          }
        } catch {
          // sync errors surfaced by useAppState
        }
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const state = loadState();
    const updated = { ...state, books: { books } };
    saveState(updated);

    const key = getSecretKey();
    if (key) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          await syncSave(key, updated);
        } catch {
          // handled elsewhere
        }
      }, 1500);
    }
  }, [books, loaded]);

  const addBook = useCallback(
    (input: { title: string; author: string; totalPages: number; status: BookStatus }): Book => {
      const now = new Date().toISOString();
      const book: Book = {
        id: uuidv4(),
        title: input.title.trim(),
        author: input.author.trim(),
        status: input.status,
        currentPage: 0,
        totalPages: Math.max(0, Math.floor(input.totalPages)) || 0,
        notes: '',
        createdAt: now,
        startedAt: input.status === 'reading' ? now : undefined,
      };
      setBooks((prev) => [book, ...prev]);
      return book;
    },
    []
  );

  // Generic edit — also stamps started/finished timestamps the first time the
  // status transitions through 'reading' / 'finished', so the user never has
  // to remember to record those dates.
  const updateBook = useCallback(
    (
      id: string,
      updates: Partial<Pick<Book, 'title' | 'author' | 'totalPages' | 'notes' | 'status' | 'currentPage'>>
    ) => {
      setBooks((prev) =>
        prev.map((b) => {
          if (b.id !== id) return b;
          const next: Book = { ...b, ...updates };
          if (typeof updates.totalPages === 'number') {
            next.totalPages = Math.max(0, Math.floor(updates.totalPages)) || 0;
          }
          if (typeof updates.currentPage === 'number') {
            const cap = next.totalPages > 0 ? next.totalPages : Number.POSITIVE_INFINITY;
            next.currentPage = Math.max(0, Math.min(Math.floor(updates.currentPage), cap));
          }
          if (next.status === 'reading' && !next.startedAt) {
            next.startedAt = new Date().toISOString();
          }
          if (next.status === 'finished' && !next.finishedAt) {
            next.finishedAt = new Date().toISOString();
          }
          return next;
        })
      );
    },
    []
  );

  // The primary in-the-moment interaction: "what page are you on?"
  // Auto-finishes the book when you hit the last page so you don't have to
  // think about status while you're putting it down.
  const updateProgress = useCallback((id: string, currentPage: number) => {
    setBooks((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;
        const cap = b.totalPages > 0 ? b.totalPages : Number.POSITIVE_INFINITY;
        const page = Math.max(0, Math.min(Math.floor(currentPage), cap));
        const reachedEnd = b.totalPages > 0 && page >= b.totalPages;
        const now = new Date().toISOString();
        return {
          ...b,
          currentPage: page,
          status: reachedEnd ? 'finished' : b.status === 'want' ? 'reading' : b.status,
          startedAt: b.startedAt ?? (b.status === 'want' || !b.startedAt ? now : b.startedAt),
          finishedAt: reachedEnd ? b.finishedAt ?? now : b.finishedAt,
        };
      })
    );
  }, []);

  const markReading = useCallback((id: string) => {
    setBooks((prev) =>
      prev.map((b) =>
        b.id === id
          ? { ...b, status: 'reading', startedAt: b.startedAt ?? new Date().toISOString() }
          : b
      )
    );
  }, []);

  const markFinished = useCallback((id: string) => {
    setBooks((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              status: 'finished',
              finishedAt: b.finishedAt ?? new Date().toISOString(),
              currentPage: b.totalPages > 0 ? b.totalPages : b.currentPage,
            }
          : b
      )
    );
  }, []);

  const deleteBook = useCallback((id: string) => {
    setBooks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  return {
    books,
    loaded,
    addBook,
    updateBook,
    updateProgress,
    markReading,
    markFinished,
    deleteBook,
  };
}
