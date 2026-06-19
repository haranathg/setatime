import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Pin } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

// "YYYY-MM-DD" key in the user's local timezone — what "today" means for the
// daily-reset behavior. We deliberately use local date so a pin checked at 11pm
// resets at midnight local, not at UTC midnight.
function localDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isCheckedToday(pin: Pin, now: Date = new Date()): boolean {
  if (!pin.lastCheckedAt) return false;
  return localDateKey(pin.lastCheckedAt) === localDateKey(now.toISOString());
}

export function usePins() {
  const [pins, setPins] = useState<Pin[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setPins(local.pins?.pins || []);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.pins?.pins) {
            const merged = new Map<string, Pin>();
            for (const p of cloud.pins.pins) merged.set(p.id, p);
            for (const p of local.pins?.pins || []) {
              const existing = merged.get(p.id);
              const cloudCheck = existing?.lastCheckedAt ?? '';
              const localCheck = p.lastCheckedAt ?? '';
              if (!existing || cloudCheck < localCheck) merged.set(p.id, p);
            }
            setPins(Array.from(merged.values()));
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
    const updated = { ...state, pins: { pins } };
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
  }, [pins, loaded]);

  const addPin = useCallback((label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const pin: Pin = {
      id: uuidv4(),
      label: trimmed,
      createdAt: new Date().toISOString(),
    };
    setPins((prev) => [...prev, pin]);
  }, []);

  // Toggle today's check state. Uncheck = clear lastCheckedAt entirely so a
  // pin that was checked yesterday and not touched stays "unchecked today"
  // until explicitly checked. Check = stamp now.
  const togglePin = useCallback((id: string) => {
    setPins((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        if (isCheckedToday(p)) {
          const { lastCheckedAt, ...rest } = p;
          void lastCheckedAt;
          return rest;
        }
        return { ...p, lastCheckedAt: new Date().toISOString() };
      })
    );
  }, []);

  const editPin = useCallback((id: string, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setPins((prev) => prev.map((p) => (p.id === id ? { ...p, label: trimmed } : p)));
  }, []);

  const removePin = useCallback((id: string) => {
    setPins((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const reorderPins = useCallback((fromIdx: number, toIdx: number) => {
    setPins((prev) => {
      if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= prev.length || toIdx >= prev.length) {
        return prev;
      }
      const next = prev.slice();
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, []);

  return { pins, loaded, addPin, togglePin, editPin, removePin, reorderPins };
}
