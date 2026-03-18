import { useMemo } from 'react';
import type { TaskBlock } from '../types';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';

export interface Stats {
  totalTasks: number;
  currentStreak: number;
  busiestDay: string;
  mostProductiveHour: string;
  totalSubTasks: number;
  completedSubTasks: number;
  completionRate: number;
  longestBlockMinutes: number;
  totalTimePlanned: number; // minutes
}

export function useStats(blocks: TaskBlock[]): Stats {
  return useMemo(() => {
    if (blocks.length === 0) {
      return {
        totalTasks: 0,
        currentStreak: 0,
        busiestDay: '-',
        mostProductiveHour: '-',
        totalSubTasks: 0,
        completedSubTasks: 0,
        completionRate: 0,
        longestBlockMinutes: 0,
        totalTimePlanned: 0,
      };
    }

    // Total tasks
    const totalTasks = blocks.length;

    // Current streak
    const uniqueDates = [...new Set(blocks.map((b) => b.date))].sort().reverse();
    let currentStreak = 0;
    const today = new Date();
    for (let i = 0; i < uniqueDates.length; i++) {
      const date = parseISO(uniqueDates[i]);
      const diff = differenceInCalendarDays(today, date);
      if (diff === currentStreak || diff === currentStreak + 1) {
        currentStreak = diff + 1;
      } else if (i === 0 && diff <= 1) {
        currentStreak = 1;
      } else {
        break;
      }
    }

    // Busiest day of week
    const dayCounts: Record<string, number> = {};
    blocks.forEach((b) => {
      const dayName = format(parseISO(b.date), 'EEEE');
      dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
    });
    const busiestDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

    // Most productive hour
    const hourCounts: Record<number, number> = {};
    blocks.forEach((b) => {
      const hour = parseInt(b.mainTime.split(':')[0]);
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    const topHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
    const h = topHour ? parseInt(topHour[0]) : 0;
    const mostProductiveHour = topHour
      ? `${h % 12 || 12}${h < 12 ? 'AM' : 'PM'}`
      : '-';

    // Sub-task stats
    let totalSubTasks = 0;
    let completedSubTasks = 0;
    blocks.forEach((b) => {
      totalSubTasks += b.subTasks.length;
      completedSubTasks += b.subTasks.filter((s) => s.completed).length;
    });
    const completionRate = totalSubTasks > 0 ? Math.round((completedSubTasks / totalSubTasks) * 100) : 0;

    // Longest block
    let longestBlockMinutes = 0;
    let totalTimePlanned = 0;
    blocks.forEach((b) => {
      const mainMin = parseInt(b.mainTime.split(':')[0]) * 60 + parseInt(b.mainTime.split(':')[1]);
      let earliest = mainMin;
      b.subTasks.forEach((s) => {
        const sMin = parseInt(s.time.split(':')[0]) * 60 + parseInt(s.time.split(':')[1]);
        if (sMin < earliest) earliest = sMin;
      });
      const duration = mainMin - earliest;
      if (duration > longestBlockMinutes) longestBlockMinutes = duration;
      totalTimePlanned += Math.max(duration, 30);
    });

    return {
      totalTasks,
      currentStreak,
      busiestDay,
      mostProductiveHour,
      totalSubTasks,
      completedSubTasks,
      completionRate,
      longestBlockMinutes,
      totalTimePlanned,
    };
  }, [blocks]);
}
