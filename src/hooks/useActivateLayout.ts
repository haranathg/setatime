import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ActivateKey } from '../types';
import { resolveActivateOrder, resolveActivateTucked } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

/** The Activate now menu's order and which strategies sit behind "+ more".
 *  Deliberately the same shape as useTodayLayout — two lists that travel
 *  together, last-writer-wins across devices. A union would resurrect a
 *  strategy you tucked away somewhere else. */
export function useActivateLayout() {
  const [order, setOrder] = useState<ActivateKey[]>(() => resolveActivateOrder());
  const [tucked, setTucked] = useState<ActivateKey[]>(() => resolveActivateTucked());
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      if (local.activateLayout?.order) setOrder(resolveActivateOrder(local.activateLayout.order));
      if (local.activateLayout?.tucked) setTucked(resolveActivateTucked(local.activateLayout.tucked));
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.activateLayout?.order) setOrder(resolveActivateOrder(cloud.activateLayout.order));
          if (cloud.activateLayout?.tucked) setTucked(resolveActivateTucked(cloud.activateLayout.tucked));
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
    const updated = { ...state, activateLayout: { order, tucked } };
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

  const move = useCallback((key: ActivateKey, delta: -1 | 1) => {
    setOrder((prev) => {
      const i = prev.indexOf(key);
      const j = i + delta;
      if (i === -1 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  const pinToTop = useCallback((key: ActivateKey) => {
    setOrder((prev) => {
      if (!prev.includes(key)) return prev;
      return [key, ...prev.filter((k) => k !== key)];
    });
    setTucked((prev) => prev.filter((k) => k !== key));
  }, []);

  const toggleTucked = useCallback((key: ActivateKey) => {
    setTucked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);

  const resetLayout = useCallback(() => {
    setOrder(resolveActivateOrder());
    setTucked(resolveActivateTucked());
  }, []);

  const isTucked = useCallback((key: ActivateKey) => tucked.includes(key), [tucked]);

  const tuckedCount = useMemo(
    () => order.filter((k) => tucked.includes(k)).length,
    [order, tucked]
  );

  return { order, tucked, isTucked, tuckedCount, loaded, move, pinToTop, toggleTucked, resetLayout };
}
