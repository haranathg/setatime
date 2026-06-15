import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { BlockTemplate, SubTaskTemplate, SubTask } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';
import { timeToMinutes } from '../utils/timeParser';

// Convert a concrete set of sub-tasks (absolute "HH:MM" times, optional cross-midnight `date`)
// into offset-from-main minutes so the same template can be applied later at a different
// main-task time.
function subTaskToOffset(sub: SubTask, mainTime: string, mainDateKey: string): SubTaskTemplate {
  const mainMinutes = timeToMinutes(mainTime);
  const subMinutes = timeToMinutes(sub.time);
  const isPrevDay = !!sub.date && sub.date !== mainDateKey;
  const absoluteSubMinutes = isPrevDay ? subMinutes - 1440 : subMinutes;
  return {
    id: uuidv4(),
    label: sub.label,
    offsetMinutes: absoluteSubMinutes - mainMinutes,
  };
}

export function useBlockTemplates() {
  const [templates, setTemplates] = useState<BlockTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      setTemplates(local.templates?.blockTemplates || []);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.templates?.blockTemplates) {
            const merged = new Map<string, BlockTemplate>();
            for (const t of cloud.templates.blockTemplates) merged.set(t.id, t);
            for (const t of local.templates?.blockTemplates || []) {
              if (!merged.has(t.id)) merged.set(t.id, t);
            }
            setTemplates(Array.from(merged.values()));
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
    const updated = { ...state, templates: { blockTemplates: templates } };
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
  }, [templates, loaded]);

  const saveTemplate = useCallback(
    (input: {
      name: string;
      mainTaskLabel: string;
      color?: string;
      subTasks: SubTask[];
      mainTime: string;
      mainDateKey: string;
    }): BlockTemplate => {
      const tpl: BlockTemplate = {
        id: uuidv4(),
        name: input.name.trim(),
        mainTaskLabel: input.mainTaskLabel,
        color: input.color,
        subTasks: input.subTasks.map((s) => subTaskToOffset(s, input.mainTime, input.mainDateKey)),
        createdAt: new Date().toISOString(),
      };
      setTemplates((prev) => [...prev, tpl]);
      return tpl;
    },
    []
  );

  const deleteTemplate = useCallback((id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { templates, loaded, saveTemplate, deleteTemplate };
}
