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
    // In SetATime, mainTime is the "be ready by" deadline. Sub-tasks are
    // prep steps BEFORE it. So the event spans from earliest sub-task to
    // mainTime (+ buffer). This matches how calendarLayout.ts renders blocks.
    let startDate = block.date;
    let startTime = block.mainTime;

    // Find the earliest sub-task (same-day only for start time)
    const sameDaySubs = block.subTasks.filter((s) => !s.date || s.date === block.date);
    for (const sub of sameDaySubs) {
      const [sh, sm] = sub.time.split(':').map(Number);
      const [mh, mm] = startTime.split(':').map(Number);
      if (sh * 60 + sm < mh * 60 + mm) {
        startTime = sub.time;
      }
    }

    // End time = mainTime + 15 min buffer (the deadline is when you need to
    // be done, so the event extends slightly past it)
    const { date: endDate, time: endTime } = addHours(block.date, block.mainTime, 0.25);

    // If no sub-tasks, make event 1 hour (start 1h before main time)
    if (block.subTasks.length === 0) {
      const { date: sd, time: st } = addHours(block.date, block.mainTime, -1);
      startDate = sd;
      startTime = st;
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
    lines.push(`DTSTART:${toICalDate(startDate, startTime)}`);
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
