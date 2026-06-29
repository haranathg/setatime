// Car-dashboard-style indicator glyphs. Stroke-based, currentColor so they
// follow the tile's state color (cold → green → amber → red+pulse). Designed
// to look like dashboard warning lights — clean geometry, round line caps,
// minimal fill. No emoji.

import type { ReactElement } from 'react';
import type { BasicIndicator } from '../types';

type GlyphProps = { size?: number };
type GlyphComponent = (props: GlyphProps) => ReactElement;

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

// Hydration — a water-drop glyph. Classic teardrop silhouette.
const HydrationGlyph: GlyphComponent = ({ size = 28 }) => (
  <svg {...svgProps(size)}>
    <path d="M12 3 C 12 3, 5.5 10.5, 5.5 15 a 6.5 6.5 0 0 0 13 0 C 18.5 10.5, 12 3, 12 3 Z" />
    <path d="M9 15 a 3 3 0 0 0 3 3" />
  </svg>
);

// Shower — head with droplets, like a windshield-washer dashboard light.
const ShowerGlyph: GlyphComponent = ({ size = 28 }) => (
  <svg {...svgProps(size)}>
    <path d="M4.5 9 h 15" />
    <path d="M12 4 v 5" />
    <path d="M7 13.5 l -0.5 1.5" />
    <path d="M10 14.5 l -0.5 1.5" />
    <path d="M13.5 13.5 l -0.5 1.5" />
    <path d="M17 14.5 l -0.5 1.5" />
    <path d="M10.5 18 l -0.5 1.5" />
    <path d="M13.5 18 l -0.5 1.5" />
  </svg>
);

// Meals — plate with three steam wisps. Reads as "fuel" but food-shaped.
const MealsGlyph: GlyphComponent = ({ size = 28 }) => (
  <svg {...svgProps(size)}>
    <path d="M8 3 c 0 2.5 -1.5 3 -1.5 5" />
    <path d="M12 3 c 0 2.5 -1.5 3 -1.5 5" />
    <path d="M16 3 c 0 2.5 -1.5 3 -1.5 5" />
    <path d="M3 15 h 18" />
    <path d="M3.5 15 a 8.5 4.5 0 0 0 17 0" />
    <path d="M2 19.5 h 20" />
  </svg>
);

// Exercise — EKG/pulse line through a heart silhouette. Performance light.
const ExerciseGlyph: GlyphComponent = ({ size = 28 }) => (
  <svg {...svgProps(size)}>
    <path d="M20.5 9.5 a 4.5 4.5 0 0 0 -8.5 -2 a 4.5 4.5 0 0 0 -8.5 2 c 0 1 0.2 1.9 0.6 2.7 h 3.4 l 1.6 -2.5 l 2.9 5 l 1.4 -2.5 h 6.2 c 0.6 -0.8 0.9 -1.7 0.9 -2.7 z" />
  </svg>
);

// Destress — three concentric breath rings. Reads as a stability/balance light.
const DestressGlyph: GlyphComponent = ({ size = 28 }) => (
  <svg {...svgProps(size)}>
    <circle cx="12" cy="12" r="3" />
    <circle cx="12" cy="12" r="6.25" strokeDasharray="1.5 2.5" opacity="0.85" />
    <circle cx="12" cy="12" r="9.5" strokeDasharray="1 3.5" opacity="0.55" />
  </svg>
);

// Sleep — crescent moon. Headlight-off vibe.
const SleepGlyph: GlyphComponent = ({ size = 28 }) => (
  <svg {...svgProps(size)}>
    <path d="M19.5 14.5 A 9 9 0 1 1 9.5 4.5 a 7 7 0 0 0 10 10 z" />
  </svg>
);

// Sunlight — sun with rays. Useful generic add for users adding "Sunlight" custom.
const SunGlyph: GlyphComponent = ({ size = 28 }) => (
  <svg {...svgProps(size)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5 v 2" />
    <path d="M12 19.5 v 2" />
    <path d="M2.5 12 h 2" />
    <path d="M19.5 12 h 2" />
    <path d="M5 5 l 1.5 1.5" />
    <path d="M17.5 17.5 l 1.5 1.5" />
    <path d="M5 19 l 1.5 -1.5" />
    <path d="M17.5 6.5 l 1.5 -1.5" />
  </svg>
);

// Meds — a pill capsule. Half-filled split.
const MedsGlyph: GlyphComponent = ({ size = 28 }) => (
  <svg {...svgProps(size)}>
    <path d="M7.5 4 h 9 a 4 4 0 0 1 0 8 h -9 a 4 4 0 0 1 0 -8 z" />
    <path d="M12 4 v 8" />
  </svg>
);

const REGISTRY: Record<string, GlyphComponent> = {
  hydration: HydrationGlyph,
  shower: ShowerGlyph,
  meals: MealsGlyph,
  exercise: ExerciseGlyph,
  destress: DestressGlyph,
  sleep: SleepGlyph,
  sun: SunGlyph,
  meds: MedsGlyph,
};

// Render the best icon we have. Prefer iconKey, then preset (so old data
// seeded before iconKey existed auto-upgrades to the SVG glyph), and finally
// fall back to the indicator's emoji string for custom indicators that
// haven't been assigned a glyph yet.
export function IndicatorIcon({
  indicator,
  size = 28,
}: {
  indicator: BasicIndicator;
  size?: number;
}) {
  const key = indicator.iconKey || indicator.preset;
  const Glyph = key ? REGISTRY[key] : undefined;
  if (Glyph) return <Glyph size={size} />;
  return (
    <span
      style={{ fontSize: `${Math.round(size * 0.85)}px`, lineHeight: 1 }}
      aria-hidden="true"
    >
      {indicator.icon}
    </span>
  );
}

// Keys exposed so the dashboard / settings UI can list available glyphs.
export const GLYPH_KEYS: string[] = Object.keys(REGISTRY);
