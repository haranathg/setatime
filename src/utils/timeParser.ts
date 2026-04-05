import * as chrono from 'chrono-node';

export interface ParsedInput {
  time: string; // "HH:MM"
  label: string;
}

export interface ParsedDuration {
  minutes: number;
  label: string;
}

// Preprocess input to fix formats chrono struggles with, e.g. "655am" → "6:55am"
function preprocessTimeInput(input: string): string {
  // Match patterns like 655am, 1030pm, 730AM etc (3-4 digits followed by am/pm)
  return input.replace(/\b(\d{1,2})(\d{2})\s*(am|pm|AM|PM)\b/g, '$1:$2 $3');
}

// Try to parse a duration like "1 hour drive", "30 min shower", "45 minutes get ready"
export function parseDurationInput(input: string): ParsedDuration | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const durationRegex = /(\d+(?:\.\d+)?)\s*(?:hr|hrs|hour|hours|h)\b/i;
  const minuteRegex = /(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes|m)\b/i;

  let totalMinutes = 0;
  let matched = false;
  let matchedText = '';

  const hrMatch = trimmed.match(durationRegex);
  if (hrMatch) {
    totalMinutes += parseFloat(hrMatch[1]) * 60;
    matchedText = hrMatch[0];
    matched = true;
  }

  const minMatch = trimmed.match(minuteRegex);
  if (minMatch) {
    totalMinutes += parseFloat(minMatch[1]);
    matchedText = matched ? matchedText + '.*?' + minMatch[0] : minMatch[0];
    matched = true;
  }

  if (!matched || totalMinutes <= 0) return null;

  // Extract label by removing the duration part
  let label = trimmed;
  if (hrMatch) label = label.replace(hrMatch[0], '');
  if (minMatch) label = label.replace(minMatch[0], '');
  label = label.replace(/^\s*and\s*/i, '').trim() || 'Untitled task';

  return { minutes: Math.round(totalMinutes), label };
}

export function parseTaskInput(input: string, referenceDate: Date): ParsedInput | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const preprocessed = preprocessTimeInput(trimmed);

  const results = chrono.parse(preprocessed, referenceDate);
  if (results.length === 0) return null;

  const parsed = results[0];
  const date = parsed.start.date();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const time = `${hours}:${minutes}`;

  // Remove the matched time expression from input to get the label
  const before = preprocessed.slice(0, parsed.index).trim();
  const after = preprocessed.slice(parsed.index + parsed.text.length).trim();
  const label = [before, after].filter(Boolean).join(' ') || 'Untitled task';

  return { time, label };
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  // Handle wrapping around midnight
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
