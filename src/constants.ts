export const HOUR_HEIGHT_PX = 60;
export const START_HOUR = 0;
export const END_HOUR = 23;
export const DEFAULT_SCROLL_HOUR = 7;
export const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => i + START_HOUR);

export const BLOCK_COLORS = [
  { bg: 'bg-indigo-100', border: 'border-l-indigo-500', text: 'text-indigo-900', sub: 'text-indigo-500' },
  { bg: 'bg-emerald-100', border: 'border-l-emerald-500', text: 'text-emerald-900', sub: 'text-emerald-500' },
  { bg: 'bg-amber-100', border: 'border-l-amber-500', text: 'text-amber-900', sub: 'text-amber-500' },
  { bg: 'bg-rose-100', border: 'border-l-rose-500', text: 'text-rose-900', sub: 'text-rose-500' },
  { bg: 'bg-sky-100', border: 'border-l-sky-500', text: 'text-sky-900', sub: 'text-sky-500' },
  { bg: 'bg-violet-100', border: 'border-l-violet-500', text: 'text-violet-900', sub: 'text-violet-500' },
  { bg: 'bg-teal-100', border: 'border-l-teal-500', text: 'text-teal-900', sub: 'text-teal-500' },
  { bg: 'bg-orange-100', border: 'border-l-orange-500', text: 'text-orange-900', sub: 'text-orange-500' },
];

export const BLOCK_COLORS_RAW = [
  '#e0e7ff', '#d1fae5', '#fef3c7', '#ffe4e6', '#e0f2fe', '#ede9fe', '#ccfbf1', '#ffedd5',
];
