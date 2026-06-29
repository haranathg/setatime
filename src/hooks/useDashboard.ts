import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { BasicIndicator, BasicLog, IndicatorMode } from '../types';
import { getSecretKey, syncLoad, syncSave } from '../services/syncService';
import { loadState, saveState } from '../utils/storage';

// Seed indicators. M·E·D·S anchors come from the South Asian Heart Center's
// lifestyle-medicine framework: Meals (plant-forward), Exercise (~30 min/day),
// Destress (meditation/breath), Sleep (7-8 hr). Hydration and Shower come
// from the user's original ask. Thresholds default conservative — wrong
// thresholds mean a constant red and the user tunes it out.
export const DEFAULT_INDICATORS: BasicIndicator[] = [
  {
    id: 'preset-hydration',
    preset: 'hydration',
    name: 'Hydration',
    icon: '💧',
    hint: '~8 cups · sip every few hours',
    mode: 'counter',
    enabled: true,
    dailyTarget: 8,
    warnAfterMinutes: 180,
    urgentAfterMinutes: 300,
  },
  {
    id: 'preset-shower',
    preset: 'shower',
    name: 'Shower',
    icon: '🚿',
    hint: 'Once a day',
    mode: 'daily',
    enabled: true,
    warnAfterHourOfDay: 20,
    urgentAfterHourOfDay: 23,
  },
  {
    id: 'preset-meals',
    preset: 'meals',
    name: 'Meals',
    icon: '🍽',
    hint: 'MEDS · plant-forward, lower refined carbs',
    mode: 'counter',
    enabled: true,
    dailyTarget: 3,
    warnAfterMinutes: 300,
    urgentAfterMinutes: 420,
  },
  {
    id: 'preset-exercise',
    preset: 'exercise',
    name: 'Exercise',
    icon: '🏃',
    hint: 'MEDS · ~30 min movement',
    mode: 'daily',
    enabled: true,
    warnAfterHourOfDay: 18,
    urgentAfterHourOfDay: 22,
  },
  {
    id: 'preset-destress',
    preset: 'destress',
    name: 'Destress',
    icon: '🧘',
    hint: 'MEDS · meditation, breath, walk',
    mode: 'daily',
    enabled: true,
    warnAfterHourOfDay: 21,
    urgentAfterHourOfDay: 23,
  },
  {
    id: 'preset-sleep',
    preset: 'sleep',
    name: 'Sleep',
    icon: '🛏',
    hint: 'MEDS · 7-8 hr · log when you turn in',
    mode: 'daily',
    enabled: true,
    warnAfterHourOfDay: 23,
    urgentAfterHourOfDay: 25, // past midnight — never matches, but kept for clarity
  },
];

export type IndicatorState = 'cold' | 'green' | 'amber' | 'red';

export interface IndicatorView {
  indicator: BasicIndicator;
  state: IndicatorState;
  todayCount: number;
  lastLoggedAt: string | null;
  minutesSinceLast: number | null;
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfTodayAt(hour: number): Date {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
}

// Pure: compute one indicator's state given its config + the user's full log.
// Exported for testability and because the view component pings it directly.
export function computeIndicatorState(
  ind: BasicIndicator,
  logs: BasicLog[],
  now: Date = new Date()
): IndicatorView {
  const todayKey = localDateKey(now);
  const own = logs.filter((l) => l.indicatorId === ind.id);
  const todays = own.filter((l) => localDateKey(new Date(l.loggedAt)) === todayKey);
  const lastLog = todays.length > 0 ? todays[todays.length - 1] : null;
  const lastLoggedAt = lastLog ? lastLog.loggedAt : null;
  const minutesSinceLast = lastLoggedAt
    ? Math.max(0, Math.round((now.getTime() - new Date(lastLoggedAt).getTime()) / 60000))
    : null;

  let state: IndicatorState;
  if (ind.mode === 'daily') {
    if (todays.length > 0) {
      state = 'green';
    } else {
      const hour = now.getHours();
      if (ind.urgentAfterHourOfDay !== undefined && hour >= ind.urgentAfterHourOfDay) state = 'red';
      else if (ind.warnAfterHourOfDay !== undefined && hour >= ind.warnAfterHourOfDay) state = 'amber';
      else state = 'cold';
    }
  } else {
    // counter mode
    const referenceTime = lastLog
      ? new Date(lastLog.loggedAt).getTime()
      : startOfTodayAt(7).getTime();
    const minsSinceRef = (now.getTime() - referenceTime) / 60000;
    if (minsSinceRef < 0) {
      state = 'cold';
    } else if (ind.urgentAfterMinutes !== undefined && minsSinceRef >= ind.urgentAfterMinutes) {
      state = 'red';
    } else if (ind.warnAfterMinutes !== undefined && minsSinceRef >= ind.warnAfterMinutes) {
      state = 'amber';
    } else {
      state = lastLog ? 'green' : 'cold';
    }
  }

  return {
    indicator: ind,
    state,
    todayCount: todays.length,
    lastLoggedAt,
    minutesSinceLast,
  };
}

export function useDashboard() {
  const [indicators, setIndicators] = useState<BasicIndicator[]>([]);
  const [logs, setLogs] = useState<BasicLog[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-render on a 1-minute tick so stale-time amber/red transitions are
  // accurate without each consumer wiring its own clock.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const init = async () => {
      const local = loadState();
      const localInds = local.dashboard?.indicators;
      const localLogs = local.dashboard?.logs || [];
      // First-run seeding: if no indicators have ever been saved, plant the defaults.
      setIndicators(localInds && localInds.length > 0 ? localInds : DEFAULT_INDICATORS);
      setLogs(localLogs);
      setLoaded(true);

      const key = getSecretKey();
      if (key) {
        try {
          const cloud = await syncLoad(key);
          if (cloud.dashboard?.indicators) {
            // Indicators: cloud wins for indicators since they're config.
            setIndicators(cloud.dashboard.indicators);
          }
          if (cloud.dashboard?.logs) {
            // Logs: union by id, like other slices.
            const merged = new Map<string, BasicLog>();
            for (const l of cloud.dashboard.logs) merged.set(l.id, l);
            for (const l of localLogs) if (!merged.has(l.id)) merged.set(l.id, l);
            setLogs(Array.from(merged.values()));
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
    const updated = { ...state, dashboard: { indicators, logs } };
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
  }, [indicators, logs, loaded]);

  const logIndicator = useCallback((indicatorId: string) => {
    const entry: BasicLog = {
      id: uuidv4(),
      indicatorId,
      loggedAt: new Date().toISOString(),
    };
    setLogs((prev) => [...prev, entry]);
  }, []);

  // Undo the most recent log for an indicator today — for fat-fingers.
  const undoLastLog = useCallback((indicatorId: string) => {
    setLogs((prev) => {
      const todayKey = localDateKey(new Date());
      const matching = prev
        .filter((l) => l.indicatorId === indicatorId && localDateKey(new Date(l.loggedAt)) === todayKey)
        .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
      if (matching.length === 0) return prev;
      const lastId = matching[0].id;
      return prev.filter((l) => l.id !== lastId);
    });
  }, []);

  const toggleEnabled = useCallback((indicatorId: string) => {
    setIndicators((prev) =>
      prev.map((i) => (i.id === indicatorId ? { ...i, enabled: !i.enabled } : i))
    );
  }, []);

  const addCustomIndicator = useCallback(
    (input: {
      name: string;
      icon: string;
      mode: IndicatorMode;
      hint?: string;
      dailyTarget?: number;
      warnAfterMinutes?: number;
      urgentAfterMinutes?: number;
      warnAfterHourOfDay?: number;
      urgentAfterHourOfDay?: number;
    }) => {
      const ind: BasicIndicator = {
        id: uuidv4(),
        name: input.name.trim(),
        icon: input.icon.trim() || '⚪',
        hint: input.hint,
        mode: input.mode,
        enabled: true,
        dailyTarget: input.dailyTarget,
        warnAfterMinutes: input.warnAfterMinutes,
        urgentAfterMinutes: input.urgentAfterMinutes,
        warnAfterHourOfDay: input.warnAfterHourOfDay,
        urgentAfterHourOfDay: input.urgentAfterHourOfDay,
      };
      setIndicators((prev) => [...prev, ind]);
      return ind;
    },
    []
  );

  const updateIndicator = useCallback(
    (id: string, patch: Partial<Omit<BasicIndicator, 'id' | 'preset'>>) => {
      setIndicators((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    },
    []
  );

  // Remove a non-preset indicator. Presets keep their seed and can only be
  // toggled off (avoids re-seeding loop next session).
  const removeIndicator = useCallback((id: string) => {
    setIndicators((prev) => {
      const target = prev.find((i) => i.id === id);
      if (!target || target.preset) return prev;
      return prev.filter((i) => i.id !== id);
    });
    setLogs((prev) => prev.filter((l) => l.indicatorId !== id));
  }, []);

  const views = useMemo(() => {
    const now = new Date();
    return indicators
      .filter((i) => i.enabled)
      .map((i) => computeIndicatorState(i, logs, now));
  }, [indicators, logs]);

  return {
    indicators,
    logs,
    views,
    loaded,
    logIndicator,
    undoLastLog,
    toggleEnabled,
    addCustomIndicator,
    updateIndicator,
    removeIndicator,
  };
}
