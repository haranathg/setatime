import type { TaskBlock } from '../types';

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function toICalDate(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split('-');
  const [h, min] = timeStr.split(':');
  return `${y}${m}${d}T${h}${min}00`;
}

function escapeICalText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function addHours(dateStr: string, timeStr: string, hours: number): { date: string; time: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  const dt = new Date(y, m - 1, d, h + hours, min);
  const rd = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  const rt = `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
  return { date: rd, time: rt };
}

export function blocksToICS(blocks: TaskBlock[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SetATime//SetATime Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:SetATime',
  ];

  for (const block of blocks) {
    // Compute end time: use the latest sub-task time, or default to +1 hour
    let endDate = block.date;
    let endTime = block.mainTime;

    if (block.subTasks.length > 0) {
      let latestMinutes = 0;
      for (const sub of block.subTasks) {
        const [sh, sm] = sub.time.split(':').map(Number);
        const mins = sh * 60 + sm;
        if (mins > latestMinutes) {
          latestMinutes = mins;
          endDate = sub.date || block.date;
          endTime = sub.time;
        }
      }
      // Add 15 min after the latest sub-task as buffer
      const { date: ed, time: et } = addHours(endDate, endTime, 0.25);
      endDate = ed;
      endTime = et;
    } else {
      const { date: ed, time: et } = addHours(block.date, block.mainTime, 1);
      endDate = ed;
      endTime = et;
    }

    // Build description from sub-tasks
    const descParts: string[] = [];
    for (const sub of block.subTasks) {
      const check = sub.completed ? '[x]' : '[ ]';
      descParts.push(`${check} ${sub.time} ${sub.label}`);
    }
    const description = descParts.length > 0 ? escapeICalText(descParts.join('\n')) : '';

    const now = new Date();
    const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}T${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${block.id}@setatime`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${toICalDate(block.date, block.mainTime)}`);
    lines.push(`DTEND:${toICalDate(endDate, endTime)}`);
    lines.push(`SUMMARY:${escapeICalText(block.mainTask)}`);
    if (description) {
      lines.push(`DESCRIPTION:${description}`);
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICS(blocks: TaskBlock[]): void {
  const ics = blocksToICS(blocks);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'setatime.ics';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
