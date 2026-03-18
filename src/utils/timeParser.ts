import * as chrono from 'chrono-node';

export interface ParsedInput {
  time: string; // "HH:MM"
  label: string;
}

export function parseTaskInput(input: string, referenceDate: Date): ParsedInput | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const results = chrono.parse(trimmed, referenceDate);
  if (results.length === 0) return null;

  const parsed = results[0];
  const date = parsed.start.date();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const time = `${hours}:${minutes}`;

  // Remove the matched time expression from input to get the label
  const before = trimmed.slice(0, parsed.index).trim();
  const after = trimmed.slice(parsed.index + parsed.text.length).trim();
  const label = [before, after].filter(Boolean).join(' ') || 'Untitled task';

  return { time, label };
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
