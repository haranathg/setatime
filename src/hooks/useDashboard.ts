import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  BasicIndicator,
  BasicLog,
  IndicatorMode,
  SpiralCadence,
  SpiralSchedule,
  SpiralOccurrenceException,
  TaskBlock,
} from '../types';
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
    iconKey: 'hydration',
    name: 'Hydration',
    icon: '💧',
    hint: '~8 cups · sip every few hours',
    mode: 'counter',
    enabled: true,
    cadence: 'daily',
    dailyTarget: 8,
    warnAfterMinutes: 180,
    urgentAfterMinutes: 300,
  },
  {
    id: 'preset-shower',
    preset: 'shower',
    iconKey: 'shower',
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
    iconKey: 'meals',
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
    iconKey: 'exercise',
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
    iconKey: 'destress',
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
    iconKey: 'sleep',
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

function cadenceOf(ind: BasicIndicator): SpiralCadence {
  return ind.cadence ?? 'daily';
}

function isPaused(ind: BasicIndicator, now: Date = new Date()): boolean {
  if (!ind.pausedUntil) return false;
  return new Date(ind.pausedUntil).getTime() > now.getTime();
}

// Does this spiral apply on the given date (per its cadence + days-of-week)?
// Pause does NOT affect this — pause is checked separately so the calendar
// can decide whether a virtual block should render.
export function isActiveOnDate(ind: BasicIndicator, date: Date = new Date()): boolean {
  const cad = cadenceOf(ind);
  if (cad === 'daily') return true;
  const dow = date.getDay();
  if (cad === 'weekdays') return dow >= 1 && dow <= 5;
  if (cad === 'specific') return (ind.daysOfWeek ?? []).includes(dow);
  return true;
}

const SCHEDULE_DEFAULT_DURATION = 30;

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
  const [exceptions, setExceptions] = useState<SpiralOccurrenceException[]>([]);
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
      const localExceptions = local.dashboard?.occurrenceExceptions || [];
      // First-run seeding: if no indicators have ever been saved, plant the defaults.
      setIndicators(localInds && localInds.length > 0 ? localInds : DEFAULT_INDICATORS);
      setLogs(localLogs);
      setExceptions(localExceptions);
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
          if (cloud.dashboard?.occurrenceExceptions) {
            const merged = new Map<string, SpiralOccurrenceException>();
            for (const x of cloud.dashboard.occurrenceExceptions) merged.set(x.id, x);
            for (const x of localExceptions) if (!merged.has(x.id)) merged.set(x.id, x);
            setExceptions(Array.from(merged.values()));
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
    const updated = {
      ...state,
      dashboard: { indicators, logs, occurrenceExceptions: exceptions },
    };
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
  }, [indicators, logs, exceptions, loaded]);

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

  // View list: only enabled, not-paused, and active-on-today indicators. Once
  // a spiral has a cadence (e.g., weekdays only) it stops cluttering the
  // dashboard on inactive days.
  const views = useMemo(() => {
    const now = new Date();
    return indicators
      .filter((i) => i.enabled)
      .filter((i) => !isPaused(i, now))
      .filter((i) => isActiveOnDate(i, now))
      .map((i) => computeIndicatorState(i, logs, now));
  }, [indicators, logs]);

  // ---------- Scheduling / cadence actions ----------

  const setCadence = useCallback(
    (id: string, cadence: SpiralCadence, daysOfWeek?: number[]) => {
      setIndicators((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                cadence,
                daysOfWeek: cadence === 'specific' ? daysOfWeek ?? [] : undefined,
              }
            : i
        )
      );
    },
    []
  );

  const setSchedule = useCallback((id: string, schedule: SpiralSchedule | null) => {
    setIndicators((prev) =>
      prev.map((i) => (i.id === id ? { ...i, schedule: schedule ?? undefined } : i))
    );
  }, []);

  // Pause until a date. Pass null to unpause; pass undefined to pause
  // indefinitely (until = year 9999).
  const setPause = useCallback((id: string, until: string | null | undefined) => {
    let value: string | undefined;
    if (until === null) value = undefined;
    else if (until === undefined) value = '9999-12-31T23:59:59.000Z';
    else value = until;
    setIndicators((prev) =>
      prev.map((i) => (i.id === id ? { ...i, pausedUntil: value } : i))
    );
  }, []);

  const skipOccurrence = useCallback((spiralId: string, dateKey: string) => {
    setExceptions((prev) => {
      if (prev.some((x) => x.spiralId === spiralId && x.dateKey === dateKey && x.kind === 'skipped')) {
        return prev;
      }
      return [
        ...prev,
        { id: uuidv4(), spiralId, dateKey, kind: 'skipped' },
      ];
    });
  }, []);

  const unskipOccurrence = useCallback((spiralId: string, dateKey: string) => {
    setExceptions((prev) =>
      prev.filter((x) => !(x.spiralId === spiralId && x.dateKey === dateKey && x.kind === 'skipped'))
    );
  }, []);

  // Toggle a North Star tag on a spiral. Attribution is opt-in and can carry
  // multiple stars per spiral (e.g., Meditation might feed both a metabolic
  // and a creative anchor).
  const toggleIndicatorStar = useCallback((indicatorId: string, starId: string) => {
    setIndicators((prev) =>
      prev.map((i) => {
        if (i.id !== indicatorId) return i;
        const current = i.northStarIds ?? [];
        const on = current.includes(starId);
        return {
          ...i,
          northStarIds: on ? current.filter((x) => x !== starId) : [...current, starId],
        };
      })
    );
  }, []);

  // Materialize virtual calendar blocks for any scheduled, enabled, not-paused,
  // active-on-date, not-skipped spirals on the given local date. Returns plain
  // TaskBlocks with `virtualSpiral` set so the calendar render path doesn't
  // need to know about spirals.
  const materializeForDate = useCallback(
    (date: Date): TaskBlock[] => {
      const dateKey = localDateKey(date);
      const skippedKeys = new Set(
        exceptions
          .filter((x) => x.kind === 'skipped' && x.dateKey === dateKey)
          .map((x) => x.spiralId)
      );
      const out: TaskBlock[] = [];
      for (const ind of indicators) {
        if (!ind.enabled) continue;
        if (!ind.schedule) continue;
        if (isPaused(ind, date)) continue;
        if (!isActiveOnDate(ind, date)) continue;
        if (skippedKeys.has(ind.id)) continue;
        out.push({
          id: `spiral::${ind.id}::${dateKey}`,
          date: dateKey,
          mainTask: ind.name,
          mainTime: ind.schedule.time,
          subTasks: [],
          color: 'sky',
          createdAt: new Date(0).toISOString(),
          durationMinutes: ind.schedule.durationMinutes ?? SCHEDULE_DEFAULT_DURATION,
          virtualSpiral: { spiralId: ind.id, dateKey },
        });
      }
      return out;
    },
    [indicators, exceptions]
  );

  return {
    indicators,
    logs,
    exceptions,
    views,
    loaded,
    logIndicator,
    undoLastLog,
    toggleEnabled,
    addCustomIndicator,
    updateIndicator,
    removeIndicator,
    setCadence,
    setSchedule,
    setPause,
    skipOccurrence,
    unskipOccurrence,
    toggleIndicatorStar,
    materializeForDate,
  };
}
