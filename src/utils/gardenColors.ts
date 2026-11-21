// Branch colors, keyed by a palette name so a branch keeps its color when
// renamed. `label` is a darker shade for text on light backgrounds; `dark` is
// a brighter shade for strokes and text on dark backgrounds.
export interface BranchColors {
  bg: string;
  dark: string;
  label: string;
}

export const PALETTE: Record<string, BranchColors> = {
  green:   { bg: '#16a34a', dark: '#4ade80', label: '#15803d' },
  amber:   { bg: '#d97706', dark: '#fbbf24', label: '#b45309' },
  indigo:  { bg: '#4f46e5', dark: '#a5b4fc', label: '#4338ca' },
  rose:    { bg: '#e11d48', dark: '#fb7185', label: '#be123c' },
  violet:  { bg: '#7c3aed', dark: '#c4b5fd', label: '#6d28d9' },
  teal:    { bg: '#0d9488', dark: '#5eead4', label: '#0f766e' },
  sky:     { bg: '#0284c7', dark: '#7dd3fc', label: '#0369a1' },
  lime:    { bg: '#65a30d', dark: '#bef264', label: '#4d7c0f' },
  pink:    { bg: '#db2777', dark: '#f9a8d4', label: '#be185d' },
  orange:  { bg: '#ea580c', dark: '#fdba74', label: '#c2410c' },
  cyan:    { bg: '#0891b2', dark: '#67e8f9', label: '#0e7490' },
  fuchsia: { bg: '#c026d3', dark: '#f0abfc', label: '#a21caf' },
  slate:   { bg: '#6b7280', dark: '#d1d5db', label: '#4b5563' },
};

// Order new branches draw colors from; slate is reserved for Other.
export const PALETTE_ORDER = [
  'green', 'amber', 'indigo', 'rose', 'violet', 'teal', 'sky',
  'lime', 'pink', 'orange', 'cyan', 'fuchsia',
];

export const OTHER_COLORS = PALETTE.slate;

// Shown for a primary that isn't a branch (an entry still being re-sorted).
export const UNKNOWN_COLOR = '#94a3b8';
