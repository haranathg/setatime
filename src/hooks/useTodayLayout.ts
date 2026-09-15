import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { TodaySectionKey } from '../types';
import { DEFAULT_TODAY_TUCKED, resolveTodayOrder } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

export function useTodayLayout() {
  const [order, setOrder] = useState<TodaySectionKey[]>(() => resolveTodayOrder());
  const [tucked, setTucked] = useState<TodaySectionKey[]>(DEFAULT_TODAY_TUCKED);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      if (local.todayLayout?.order) setOrder(resolveTodayOrder(local.todayLayout.order));
      if (local.todayLayout?.tucked) setTucked(local.todayLayout.tucked);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          // Whole-list last-writer-wins. A union would resurrect a section
          // you deliberately tucked away on another device.
          if (cloud.todayLayout?.order) setOrder(resolveTodayOrder(cloud.todayLayout.order));
          if (cloud.todayLayout?.tucked) setTucked(cloud.todayLayout.tucked);
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
    const updated = { ...state, todayLayout: { order, tucked } };
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
  }, [order, tucked, loaded]);

  const move = useCallback((key: TodaySectionKey, delta: -1 | 1) => {
    setOrder((prev) => {
      const i = prev.indexOf(key);
      const j = i + delta;
      if (i === -1 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  /** Jump a section to the very top. Pinning is the one move that is worth a
   *  dedicated button — with arrows alone it costs a tap per position, which
   *  is exactly the friction you cannot afford on the day you need it. */
  const pinToTop = useCallback((key: TodaySectionKey) => {
    setOrder((prev) => {
      if (!prev.includes(key)) return prev;
      return [key, ...prev.filter((k) => k !== key)];
    });
    // A pinned section is a section you want to see, so un-tuck it too.
    setTucked((prev) => prev.filter((k) => k !== key));
  }, []);

  const toggleTucked = useCallback((key: TodaySectionKey) => {
    setTucked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);

  const resetLayout = useCallback(() => {
    setOrder(resolveTodayOrder());
    setTucked(DEFAULT_TODAY_TUCKED);
  }, []);

  const isTucked = useCallback((key: TodaySectionKey) => tucked.includes(key), [tucked]);

  const tuckedCount = useMemo(
    () => order.filter((k) => tucked.includes(k)).length,
    [order, tucked]
  );

  return { order, tucked, isTucked, tuckedCount, loaded, move, pinToTop, toggleTucked, resetLayout };
}
