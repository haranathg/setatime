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
            // Preserve brainDump from whichever source has it (cloud wins if present).
            // Without this we'd strip brainDump from localStorage here.
            saveState({
              ...local,
              blocks: mergedBlocks,
              brainDump: cloud.brainDump ?? local.brainDump,
            });
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

  // Save to localStorage on every change, debounce cloud sync.
  // IMPORTANT: we must preserve brainDump (and any other slices owned by other
  // hooks) when writing. This hook only owns `blocks`; reading the current
  // persisted state and spreading it keeps brainDump intact on both local and
  // cloud. Without this, every block edit would clobber brainDump in S3 and
  // no other device would ever see the user's brain dump tasks.
  useEffect(() => {
    if (!loaded) return;
    const current = loadState();
    const state: AppState = { ...current, blocks };
    saveState(state);

    // Debounce cloud save
    const key = getSecretKey();
    if (key) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        // Re-read at flush time so we include any brainDump edits that
        // landed in localStorage after this effect scheduled the timer.
        const latest = loadState();
        try {
          await syncSave(key, { ...latest, blocks });
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
        // Preserve brainDump from cloud if present, else keep local brainDump.
        const current = loadState();
        saveState({
          ...current,
          blocks: cloud.blocks,
          brainDump: cloud.brainDump ?? current.brainDump,
        });
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
