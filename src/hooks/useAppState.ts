import { useState, useEffect, useCallback } from 'react';
import type { TaskBlock, AppState } from '../types';
import { loadState, saveState } from '../utils/storage';
import { getWeekStart, formatDateKey } from '../utils/dateHelpers';

export function useAppState() {
  const [blocks, setBlocks] = useState<TaskBlock[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const state = loadState();
    setBlocks(state.blocks);
    setLoaded(true);
  }, []);

  // Save to localStorage on every change
  useEffect(() => {
    if (!loaded) return;
    const state: AppState = { blocks };
    saveState(state);
  }, [blocks, loaded]);

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
      return blocks.filter((b) => b.date === key);
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
  };
}
