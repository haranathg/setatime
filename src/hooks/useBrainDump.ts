import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { BrainDumpTask } from '../types';
import { getSecretKey, getAuthHashAsync, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

const AI_API_URL = import.meta.env.VITE_AI_API_URL || '/api/ai-breakdown';

export function useBrainDump() {
  const [unscheduledTasks, setUnscheduledTasks] = useState<BrainDumpTask[]>([]);
  const [schedulingTask, setSchedulingTask] = useState<BrainDumpTask | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load on mount
  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setUnscheduledTasks(local.brainDump?.unscheduledTasks || []);
      setLoaded(true);

      // Merge from cloud if connected
      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.brainDump?.unscheduledTasks) {
            const cloudMap = new Map(cloud.brainDump.unscheduledTasks.map((t) => [t.id, t]));
            const localTasks = local.brainDump?.unscheduledTasks || [];
            for (const t of localTasks) {
              if (!cloudMap.has(t.id)) cloudMap.set(t.id, t);
            }
            setUnscheduledTasks(Array.from(cloudMap.values()));
          }
        } catch {
          // Sync error handled elsewhere
        }
      }
    };
    init();
  }, []);

  // Save on change
  useEffect(() => {
    if (!loaded) return;
    const state = loadState();
    const updated = { ...state, brainDump: { unscheduledTasks } };
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
  }, [unscheduledTasks, loaded]);

  const extractTasks = useCallback(async (text: string): Promise<BrainDumpTask[]> => {
    setExtracting(true);
    try {
      const authHash = await getAuthHashAsync();
      const response = await fetch(AI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'brain-dump-extract', text, authHash }),
      });

      if (!response.ok) throw new Error('AI service unavailable');
      const data = await response.json();

      const tasks: BrainDumpTask[] = data.tasks.map((t: { label: string }) => ({
        id: uuidv4(),
        label: t.label,
        extractedAt: new Date().toISOString(),
      }));

      setUnscheduledTasks((prev) => [...prev, ...tasks]);
      return tasks;
    } finally {
      setExtracting(false);
    }
  }, []);

  const addManualTask = useCallback((label: string) => {
    const task: BrainDumpTask = {
      id: uuidv4(),
      label: label.trim(),
      extractedAt: new Date().toISOString(),
    };
    setUnscheduledTasks((prev) => [...prev, task]);
  }, []);

  const removeScheduledTask = useCallback((taskId: string) => {
    setUnscheduledTasks((prev) => prev.filter((t) => t.id !== taskId));
    setSchedulingTask(null);
  }, []);

  const startScheduling = useCallback((task: BrainDumpTask) => {
    setSchedulingTask(task);
  }, []);

  const cancelScheduling = useCallback(() => {
    setSchedulingTask(null);
  }, []);

  const deleteTask = useCallback((taskId: string) => {
    setUnscheduledTasks((prev) => prev.filter((t) => t.id !== taskId));
    setSchedulingTask((prev) => (prev?.id === taskId ? null : prev));
  }, []);

  return {
    unscheduledTasks,
    schedulingTask,
    extracting,
    extractTasks,
    addManualTask,
    removeScheduledTask,
    startScheduling,
    cancelScheduling,
    deleteTask,
  };
}
