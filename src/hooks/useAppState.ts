import { useState, useEffect, useCallback, useRef } from 'react';
import type { TaskBlock, AppState } from '../types';
import { loadState, saveState } from '../utils/storage';
import { getWeekStart, formatDateKey } from '../utils/dateHelpers';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';

export function useAppState() {
  const [blocks, setBlocks] = useState<TaskBlock[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from localStorage (and optionally cloud) on mount
  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setBlocks(local.blocks);
      setLoaded(true);

      // If secret key is set, try to load from cloud
      const key = getSecretKey();
      if (key) {
        try {
          setSyncing(true);
          const cloud = await syncLoad(key);
          if (cloud.blocks && cloud.blocks.length > 0) {
            // Merge: cloud wins for conflicts (by id), keep unique local ones
            const cloudMap = new Map(cloud.blocks.map((b) => [b.id, b]));
            const localMap = new Map(local.blocks.map((b) => [b.id, b]));
            // Start with all cloud blocks
            const merged = new Map(cloudMap);
            // Add local-only blocks
            for (const [id, block] of localMap) {
              if (!merged.has(id)) {
                merged.set(id, block);
              }
            }
            const mergedBlocks = Array.from(merged.values());
            setBlocks(mergedBlocks);
            saveState({ blocks: mergedBlocks });
          }
          setSyncError(null);
        } catch {
          setSyncError('Could not load from cloud');
        } finally {
          setSyncing(false);
        }
      }
    };
    init();
  }, []);

  // Save to localStorage on every change, debounce cloud sync
  useEffect(() => {
    if (!loaded) return;
    const state: AppState = { blocks };
    saveState(state);

    // Debounce cloud save
    const key = getSecretKey();
    if (key) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          await syncSave(key, state);
          setSyncError(null);
        } catch {
          setSyncError('Could not save to cloud');
        }
      }, 1500);
    }
  }, [blocks, loaded]);

  const refreshFromCloud = useCallback(async () => {
    const key = getSecretKey();
    if (!key) return;
    try {
      setSyncing(true);
      const cloud = await syncLoad(key);
      if (cloud.blocks) {
        setBlocks(cloud.blocks);
        saveState({ blocks: cloud.blocks });
      }
      setSyncError(null);
    } catch {
      setSyncError('Could not load from cloud');
    } finally {
      setSyncing(false);
    }
  }, []);

  const addBlock = useCallback((block: TaskBlock) => {
    setBlocks((prev) => [...prev, block]);
  }, []);

  const updateBlock = useCallback((updated: TaskBlock) => {
    setBlocks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  }, []);

  const deleteBlock = useCallback((id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const toggleSubTask = useCallback((blockId: string, subTaskId: string) => {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        return {
          ...b,
          subTasks: b.subTasks.map((s) =>
            s.id === subTaskId ? { ...s, completed: !s.completed } : s
          ),
        };
      })
    );
  }, []);

  const navigateWeek = useCallback((direction: -1 | 1) => {
    setCurrentWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + direction * 7);
      return d;
    });
  }, []);

  const goToToday = useCallback(() => {
    setCurrentWeekStart(getWeekStart(new Date()));
  }, []);

  const getBlocksForDate = useCallback(
    (date: Date): TaskBlock[] => {
      const key = formatDateKey(date);
      // Include blocks for this date + blocks from other dates that have cross-day sub-tasks on this date
      const directBlocks = blocks.filter((b) => b.date === key);
      const crossDayBlocks = blocks.filter(
        (b) => b.date !== key && b.subTasks.some((s) => s.date === key)
      );
      return [...directBlocks, ...crossDayBlocks];
    },
    [blocks]
  );

  return {
    blocks,
    currentWeekStart,
    addBlock,
    updateBlock,
    deleteBlock,
    toggleSubTask,
    navigateWeek,
    goToToday,
    getBlocksForDate,
    syncing,
    syncError,
    refreshFromCloud,
  };
}
