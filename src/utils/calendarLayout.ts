import type { TaskBlock, RenderedBlock } from '../types';
import { HOUR_HEIGHT_PX, START_HOUR } from '../constants';
import { timeToMinutes } from './timeParser';

export function computeRenderedBlocks(blocks: TaskBlock[]): RenderedBlock[] {
  if (blocks.length === 0) return [];

  const rendered: RenderedBlock[] = blocks.map((block) => {
    const mainMinute = timeToMinutes(block.mainTime);
    let startMinute = mainMinute;

    for (const sub of block.subTasks) {
      const subMinute = timeToMinutes(sub.time);
      if (subMinute < startMinute) startMinute = subMinute;
    }

    // Ensure minimum 30 min span for visibility
    let endMinute = mainMinute;
    if (endMinute - startMinute < 30) {
      endMinute = startMinute + 30;
    }

    const startOffset = startMinute - START_HOUR * 60;
    const topPx = (startOffset / 60) * HOUR_HEIGHT_PX;
    const heightPx = ((endMinute - startMinute) / 60) * HOUR_HEIGHT_PX;

    return {
      block,
      startMinute,
      endMinute,
      topPx: Math.max(0, topPx),
      heightPx: Math.max(30, heightPx),
      left: '0%',
      width: '100%',
    };
  });

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
