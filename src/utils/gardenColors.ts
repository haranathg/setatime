import type { GardenDomain } from '../types';

// One color per domain, shared with the chips and the legend. `label` is a
// darker shade for text on light backgrounds; `dark` is a brighter shade for
// strokes and text on dark backgrounds.
export const DOMAIN_COLORS: Record<GardenDomain, { bg: string; dark: string; label: string }> = {
  'Health':                  { bg: '#16a34a', dark: '#4ade80', label: '#15803d' },
  'Career Exploration':      { bg: '#d97706', dark: '#fbbf24', label: '#b45309' },
  'School':                  { bg: '#4f46e5', dark: '#a5b4fc', label: '#4338ca' },
  'Relationships':           { bg: '#e11d48', dark: '#fb7185', label: '#be123c' },
  'Emotional Maturity':      { bg: '#7c3aed', dark: '#c4b5fd', label: '#6d28d9' },
  'Environment & Lifestyle': { bg: '#0d9488', dark: '#5eead4', label: '#0f766e' },
  'Purpose & Meaning':       { bg: '#0284c7', dark: '#7dd3fc', label: '#0369a1' },
  'Other':                   { bg: '#6b7280', dark: '#d1d5db', label: '#4b5563' },
};

export function colorForDomain(name: string): string {
  return (DOMAIN_COLORS as Record<string, { bg: string } | undefined>)[name]?.bg || '#6b7280';
}
