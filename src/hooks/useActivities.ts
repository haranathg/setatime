import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ActivityLogEntry, ChartSection } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

// Extract "+tag" tokens from text. A tag is a letter followed by letters,
// digits, or hyphens. The leading "+" must be at the start of input or follow
// whitespace/punctuation so "c++" and "1+2" never match. Returns lowercase
// names, one per occurrence.
const TAG_RE = /(?:^|[\s.,;:!?()\-])\+([a-zA-Z][a-zA-Z0-9-]*)/g;

export function extractActivityTags(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(text)) !== null) {
    out.push(m[1].toLowerCase());
  }
  return out;
}

export function countTags(tags: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tags) counts.set(t, (counts.get(t) || 0) + 1);
  return counts;
}

export function useActivities() {
  const [log, setLog] = useState<ActivityLogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setLog(local.activities?.log || []);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.activities?.log) {
            const merged = new Map<string, ActivityLogEntry>();
            for (const e of cloud.activities.log) merged.set(e.id, e);
            for (const e of local.activities?.log || []) {
              const existing = merged.get(e.id);
              if (!existing || existing.updatedAt < e.updatedAt) merged.set(e.id, e);
            }
            setLog(Array.from(merged.values()));
          }
        } catch {
          // sync errors handled elsewhere
        }
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const state = loadState();
    const updated = { ...state, activities: { log } };
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
  }, [log, loaded]);

  // Reconcile entries for a single note's section against its current text.
  // Adds new entries, updates counts, removes entries whose tag no longer
  // appears. Other notes' entries are untouched.
  const syncSection = useCallback(
    (noteId: string, noteDate: string, section: ChartSection, text: string) => {
      const tags = extractActivityTags(text);
      const counts = countTags(tags);
      const now = new Date().toISOString();
      setLog((prev) => {
        const sameSection = prev.filter((e) => e.noteId === noteId && e.section === section);
        const otherEntries = prev.filter((e) => !(e.noteId === noteId && e.section === section));
        const byName = new Map(sameSection.map((e) => [e.name, e]));
        const next: ActivityLogEntry[] = [...otherEntries];
        for (const [name, count] of counts) {
          const existing = byName.get(name);
          if (existing) {
            if (existing.count !== count || existing.noteDate !== noteDate) {
              next.push({ ...existing, count, noteDate, updatedAt: now });
            } else {
              next.push(existing);
            }
          } else {
            next.push({
              id: uuidv4(),
              name,
              noteId,
              section,
              noteDate,
              count,
              firstLoggedAt: now,
              updatedAt: now,
            });
          }
        }
        // entries whose name no longer appears get dropped (not re-pushed)
        return next;
      });
    },
    []
  );

  // Reconcile ALL four sections of a note in one shot. Useful for copy-forward
  // and bulk loads.
  const syncNote = useCallback(
    (noteId: string, noteDate: string, sections: Record<ChartSection, string>) => {
      const sectionNames: ChartSection[] = ['subjective', 'objective', 'assessment', 'plan'];
      // Pre-compute counts per section
      const perSection = new Map<ChartSection, Map<string, number>>();
      for (const s of sectionNames) {
        perSection.set(s, countTags(extractActivityTags(sections[s] || '')));
      }
      const now = new Date().toISOString();
      setLog((prev) => {
        const others = prev.filter((e) => e.noteId !== noteId);
        const sameNote = prev.filter((e) => e.noteId === noteId);
        const next: ActivityLogEntry[] = [...others];
        for (const s of sectionNames) {
          const counts = perSection.get(s)!;
          const existingForSection = sameNote.filter((e) => e.section === s);
          const byName = new Map(existingForSection.map((e) => [e.name, e]));
          for (const [name, count] of counts) {
            const existing = byName.get(name);
            if (existing) {
              if (existing.count !== count || existing.noteDate !== noteDate) {
                next.push({ ...existing, count, noteDate, updatedAt: now });
              } else {
                next.push(existing);
              }
            } else {
              next.push({
                id: uuidv4(),
                name,
                noteId,
                section: s,
                noteDate,
                count,
                firstLoggedAt: now,
                updatedAt: now,
              });
            }
          }
        }
        return next;
      });
    },
    []
  );

  // Drop all entries tied to a deleted note.
  const dropForNote = useCallback((noteId: string) => {
    setLog((prev) => prev.filter((e) => e.noteId !== noteId));
  }, []);

  return { log, loaded, syncSection, syncNote, dropForNote };
}
