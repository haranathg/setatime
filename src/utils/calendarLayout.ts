import type { TaskBlock, RenderedBlock } from '../types';
import { HOUR_HEIGHT_PX, START_HOUR } from '../constants';
import { timeToMinutes } from './timeParser';

/**
 * Compute rendered blocks for a specific date.
 * `dateKey` is the "YYYY-MM-DD" of the column being rendered.
 * Blocks may be direct (block.date === dateKey) or cross-day
 * (block.date !== dateKey, but has sub-tasks with date === dateKey).
 */
export function computeRenderedBlocks(blocks: TaskBlock[], dateKey?: string): RenderedBlock[] {
  if (blocks.length === 0) return [];

  const rendered: RenderedBlock[] = [];

  for (const block of blocks) {
    const isCrossDay = dateKey && block.date !== dateKey;

    if (isCrossDay) {
      // This block belongs to another day but has sub-tasks on this day.
      // Show only the cross-day sub-tasks, spanning from earliest sub-task to 23:59.
      const crossDaySubs = block.subTasks.filter((s) => s.date === dateKey);
      if (crossDaySubs.length === 0) continue;

      const startMinute = Math.min(...crossDaySubs.map((s) => timeToMinutes(s.time)));
      const endMinute = 24 * 60 - 1; // 23:59

      const startOffset = startMinute - START_HOUR * 60;
      const topPx = (startOffset / 60) * HOUR_HEIGHT_PX;
      const heightPx = ((endMinute - startMinute) / 60) * HOUR_HEIGHT_PX;

      rendered.push({
        block: {
          ...block,
          // Override to show only cross-day sub-tasks in the card
          subTasks: crossDaySubs,
          // Mark as continuation so the card can style differently
          mainTask: `${block.mainTask} (continues next day)`,
        },
        startMinute,
        endMinute,
        topPx: Math.max(0, topPx),
        heightPx: Math.max(30, heightPx),
        left: '0%',
        width: '100%',
        isCrossDay: true,
      });
    } else {
      // Normal block on its own day — only include same-day sub-tasks for time calc
      const sameDaySubs = block.subTasks.filter((s) => !s.date || s.date === block.date);
      const mainMinute = timeToMinutes(block.mainTime);
      let startMinute = mainMinute;

      for (const sub of sameDaySubs) {
        const subMinute = timeToMinutes(sub.time);
        if (subMinute < startMinute) startMinute = subMinute;
      }

      // If block has cross-day sub-tasks on previous day, start from midnight
      const hasPrevDaySubs = block.subTasks.some((s) => s.date && s.date !== block.date);
      if (hasPrevDaySubs) {
        startMinute = Math.min(startMinute, 0); // Extend to midnight
      }

      let endMinute = mainMinute;
      if (endMinute - startMinute < 30) {
        endMinute = startMinute + 30;
      }

      const startOffset = startMinute - START_HOUR * 60;
      const topPx = (startOffset / 60) * HOUR_HEIGHT_PX;
      const heightPx = ((endMinute - startMinute) / 60) * HOUR_HEIGHT_PX;

      rendered.push({
        block: {
          ...block,
          // Only show same-day sub-tasks in the card
          subTasks: sameDaySubs,
        },
        startMinute,
        endMinute,
        topPx: Math.max(0, topPx),
        heightPx: Math.max(30, heightPx),
        left: '0%',
        width: '100%',
      });
    }
  }

  // Sort by start time
  rendered.sort((a, b) => a.startMinute - b.startMinute);

  // Handle overlaps
  const columns: RenderedBlock[][] = [];
  for (const rb of rendered) {
    let placed = false;
    for (const col of columns) {
      const last = col[col.length - 1];
      if (last.endMinute <= rb.startMinute) {
        col.push(rb);
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([rb]);
    }
  }

  const totalCols = columns.length;
  columns.forEach((col, colIndex) => {
    for (const rb of col) {
      rb.left = `${(colIndex / totalCols) * 100}%`;
      rb.width = `${(1 / totalCols) * 100}%`;
    }
  });

  return rendered;
}
