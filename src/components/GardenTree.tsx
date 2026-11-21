import { useMemo } from 'react';
import { GARDEN_DOMAINS, type GardenDomain } from '../types';

// ---------- Domain palette ----------
//
// One color per domain. Shared with GardenView / GardenStrip so a chip
// and a branch read as the same thing. Pre-defined (not hash-derived)
// because the top-level taxonomy is fixed — colors can be hand-tuned to
// be distinct and readable in both light and dark mode.
export const DOMAIN_COLORS: Record<GardenDomain, { bg: string; dark: string; label: string }> = {
  'Health':                  { bg: '#16a34a', dark: '#22c55e', label: '#166534' },
  'Career Exploration':      { bg: '#d97706', dark: '#f59e0b', label: '#92400e' },
  'School':                  { bg: '#4f46e5', dark: '#818cf8', label: '#3730a3' },
  'Relationships':           { bg: '#e11d48', dark: '#fb7185', label: '#9f1239' },
  'Emotional Maturity':      { bg: '#7c3aed', dark: '#a78bfa', label: '#5b21b6' },
  'Environment & Lifestyle': { bg: '#0d9488', dark: '#2dd4bf', label: '#115e59' },
  'Purpose & Meaning':       { bg: '#0284c7', dark: '#38bdf8', label: '#075985' },
  'Other':                   { bg: '#6b7280', dark: '#9ca3af', label: '#374151' },
};

export function colorForDomain(name: string): string {
  return (DOMAIN_COLORS as Record<string, { bg: string } | undefined>)[name]?.bg || '#6b7280';
}

// ---------- Tree geometry ----------
//
// Fixed candelabra layout. Trunk rises from the base. Eight main branches
// fork from the top of the trunk at hand-picked angles that spread evenly
// across a ~140° fan — outermost branches stay above horizontal so labels
// can sit at their tips without clipping.
//
// Lengths and thicknesses scale with sqrt(count + 1) so a zero-count
// branch is a thin visible twig (the imbalance signal the user asked
// for), and the most-watered branch doesn't eat the canvas.

const VIEW_W = 640;
const VIEW_H = 560;
const GROUND_Y = 520;
const TRUNK_BASE_X = VIEW_W / 2;
const TRUNK_TOP_Y = 360;
const TRUNK_WIDTH = 18;

// Degrees measured CLOCKWISE from straight-up (so -70 is upper-left, +70
// upper-right). Eight branches evenly spread across the fan.
const BRANCH_ANGLES_DEG: Record<GardenDomain, number> = {
  'Health':                  -70,
  'Career Exploration':      -50,
  'School':                  -30,
  'Relationships':           -10,
  'Emotional Maturity':       10,
  'Environment & Lifestyle':  30,
  'Purpose & Meaning':        50,
  'Other':                    70,
};

const MIN_BRANCH_LEN = 70;
const MAX_BRANCH_LEN = 180;
const MIN_BRANCH_THICK = 3;
const MAX_BRANCH_THICK = 14;

const MIN_SUB_LEN = 28;
const MAX_SUB_LEN = 70;
const MIN_SUB_THICK = 2;
const MAX_SUB_THICK = 6;

// Leaf-cluster packing at a sub-branch tip. One leaf per entry up to the
// threshold; beyond that, leaves shrink and tighten so the tree stops
// exploding at high counts while a new log still adds a visible mark.
const LEAF_BASE_R = 4.5;
const LEAF_MIN_R = 2;
const LEAF_PACK_THRESHOLD = 18;

interface TreeViewProps {
  // Flat canonical counts: Map<domain, total>. Includes zero entries.
  domainTotals: Map<GardenDomain, number>;
  // Nested counts: Map<domain, Map<sub, count>>.
  subCountsByDomain: Map<GardenDomain, Map<string, number>>;
  selectedPrimary: string | null;
  selectedSub: string | null;
  onSelectPrimary: (p: GardenDomain | null) => void;
  onSelectSub: (p: GardenDomain, s: string) => void;
}

// Deterministic PRNG so leaf jitter and branch curves stay stable across
// renders (otherwise the tree would wobble on every state change).
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function seededRand(seed: number): () => number {
  // Mulberry32 — small, fast, good enough for cosmetic jitter.
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Map a count to a value in [min, max] via sqrt scaling and a per-metric
// cap so no branch overwhelms the canvas regardless of how many entries
// a user has in one domain.
function scale(count: number, max: number, min: number, limit: number): number {
  const k = Math.sqrt(Math.max(0, count));
  const t = Math.min(1, k / Math.sqrt(limit));
  return min + (max - min) * t;
}

export default function TreeView({
  domainTotals,
  subCountsByDomain,
  selectedPrimary,
  selectedSub,
  onSelectPrimary,
  onSelectSub,
}: TreeViewProps) {
  // Layout each branch and its sub-branches once per data change. The
  // layout result is pure geometry — click handlers are wired in the
  // JSX below, not baked into the shapes.
  const layout = useMemo(() => {
    // Branch-scaling caps come from the data so a user's first few
    // entries actually visibly grow each branch rather than all
    // sitting at the minimum. Floor the cap so a very quiet garden
    // still has usable ranges.
    const totals = GARDEN_DOMAINS.map((d) => domainTotals.get(d) || 0);
    const maxDomain = Math.max(8, ...totals);

    const branches = GARDEN_DOMAINS.map((domain) => {
      const angleDeg = BRANCH_ANGLES_DEG[domain];
      const theta = (angleDeg - 90) * (Math.PI / 180); // SVG: 0rad = +x, -90° shifts to "straight up"
      const count = domainTotals.get(domain) || 0;
      const length = scale(count, MAX_BRANCH_LEN, MIN_BRANCH_LEN, maxDomain);
      const thick = scale(count, MAX_BRANCH_THICK, MIN_BRANCH_THICK, maxDomain);

      // Curve the branch slightly away from vertical for a natural look
      // — control point offset perpendicular to the main direction,
      // sign following the x component so left branches arc left.
      const dx = Math.cos(theta);
      const dy = Math.sin(theta);
      const tipX = TRUNK_BASE_X + dx * length;
      const tipY = TRUNK_TOP_Y + dy * length;
      const midX = TRUNK_BASE_X + dx * length * 0.55;
      const midY = TRUNK_TOP_Y + dy * length * 0.55;
      const perpX = -dy;
      const perpY = dx;
      const curveMag = length * 0.12 * (dx === 0 ? 0 : Math.sign(dx));
      const ctrlX = midX + perpX * curveMag;
      const ctrlY = midY + perpY * curveMag;

      const subMap = subCountsByDomain.get(domain) || new Map<string, number>();
      // Sort subs by count desc so the heavier ones get the lower fork
      // points (closer to the trunk — easier to read).
      const subEntries = Array.from(subMap.entries()).sort((a, b) => b[1] - a[1]);
      const maxSub = Math.max(4, ...subEntries.map(([, n]) => n), 1);

      const subs = subEntries.map(([subName, subCount], idx) => {
        // Alternate sides so a branch with many subs feathers out
        // instead of stacking on one side.
        const side = idx % 2 === 0 ? 1 : -1;
        // Fork between 30%-85% along the main branch so subs don't
        // crowd the trunk or collide at the tip.
        const t = subEntries.length <= 1
          ? 0.6
          : 0.3 + (idx / (subEntries.length - 1)) * 0.55;
        const forkX = TRUNK_BASE_X + dx * length * t;
        const forkY = TRUNK_TOP_Y + dy * length * t;
        const subAngle = theta + side * (25 * Math.PI / 180);
        const subDx = Math.cos(subAngle);
        const subDy = Math.sin(subAngle);
        const subLen = scale(subCount, MAX_SUB_LEN, MIN_SUB_LEN, maxSub);
        const subThick = scale(subCount, MAX_SUB_THICK, MIN_SUB_THICK, maxSub);
        const subTipX = forkX + subDx * subLen;
        const subTipY = forkY + subDy * subLen;

        // Leaf positions around the sub-branch tip. Deterministic so a
        // re-render doesn't scramble them. One leaf per entry until the
        // threshold; beyond that, leaves shrink.
        const rand = seededRand(hashString(domain + '|' + subName));
        const leafR = subCount <= LEAF_PACK_THRESHOLD
          ? LEAF_BASE_R
          : Math.max(LEAF_MIN_R, LEAF_BASE_R - 0.08 * (subCount - LEAF_PACK_THRESHOLD));
        const clusterR = Math.sqrt(subCount) * (leafR + 1.2);
        const leaves = Array.from({ length: subCount }, (_, i) => {
          // Spiral-pack: evenly distribute angle, sqrt-spread radius,
          // a touch of jitter so it doesn't look mechanical.
          const angle = i * 2.399963 + rand() * 0.6; // golden-angle-ish
          const r = clusterR * Math.sqrt((i + 0.5) / Math.max(1, subCount));
          return {
            cx: subTipX + Math.cos(angle) * r,
            cy: subTipY + Math.sin(angle) * r,
            r: leafR,
          };
        });

        return {
          name: subName,
          count: subCount,
          forkX, forkY, subTipX, subTipY, subThick,
          leaves,
        };
      });

      // Branch label position: just beyond the tip, offset outward.
      const labelX = tipX + dx * 12;
      const labelY = tipY + dy * 12;
      // Nudge the label a bit so it sits on the correct side depending
      // on the branch direction, keeping it inside the viewBox.
      const labelAnchor: 'start' | 'middle' | 'end' =
        dx > 0.3 ? 'start' : dx < -0.3 ? 'end' : 'middle';

      return {
        domain,
        count,
        length, thick,
        path: `M ${TRUNK_BASE_X} ${TRUNK_TOP_Y} Q ${ctrlX} ${ctrlY} ${tipX} ${tipY}`,
        tipX, tipY,
        labelX, labelY, labelAnchor,
        subs,
      };
    });

    return { branches };
  }, [domainTotals, subCountsByDomain]);

  const anySelected = selectedPrimary !== null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full h-auto"
        role="img"
        aria-label="Garden tree, with eight main branches showing one life domain each"
      >
        {/* Soft ground shadow — a visual anchor so the tree reads as
            planted rather than floating. */}
        <ellipse
          cx={TRUNK_BASE_X}
          cy={GROUND_Y + 4}
          rx={110}
          ry={10}
          fill="rgba(22,163,74,0.12)"
        />

        {/* Trunk */}
        <path
          d={`M ${TRUNK_BASE_X - TRUNK_WIDTH / 2} ${GROUND_Y}
              C ${TRUNK_BASE_X - TRUNK_WIDTH / 2 - 2} ${(GROUND_Y + TRUNK_TOP_Y) / 2}
                ${TRUNK_BASE_X - 6} ${TRUNK_TOP_Y + 20}
                ${TRUNK_BASE_X - 5} ${TRUNK_TOP_Y}
              L ${TRUNK_BASE_X + 5} ${TRUNK_TOP_Y}
              C ${TRUNK_BASE_X + 6} ${TRUNK_TOP_Y + 20}
                ${TRUNK_BASE_X + TRUNK_WIDTH / 2 + 2} ${(GROUND_Y + TRUNK_TOP_Y) / 2}
                ${TRUNK_BASE_X + TRUNK_WIDTH / 2} ${GROUND_Y} Z`}
          fill="#7c5a3a"
          className="dark:fill-[#5c4028]"
        />

        {/* Main branches + their subs */}
        {layout.branches.map((b) => {
          const color = DOMAIN_COLORS[b.domain];
          const isSelected = selectedPrimary === b.domain;
          const dimmed = anySelected && !isSelected;
          const emptyBranch = b.count === 0;
          // Empty branches get a muted gray stroke so they read as twigs
          // rather than claiming the domain's color before any data is in.
          const branchStroke = emptyBranch ? '#94a3b8' : color.bg;
          const branchOpacity = dimmed ? 0.3 : 1;

          return (
            <g key={b.domain} style={{ opacity: branchOpacity, transition: 'opacity 150ms' }}>
              {/* Main branch stroke — fat at the trunk, tapers via
                  stroke-linecap. SVG strokes don't taper natively, so an
                  overlaid thinner second stroke near the tip gives a
                  subtle taper effect without another path. */}
              <path
                d={b.path}
                stroke={branchStroke}
                strokeWidth={b.thick}
                strokeLinecap="round"
                fill="none"
                className="cursor-pointer"
                onClick={() => onSelectPrimary(isSelected ? null : b.domain)}
              >
                <title>{`${b.domain}: ${b.count} ${b.count === 1 ? 'entry' : 'entries'}`}</title>
              </path>

              {/* Sub-branches */}
              {b.subs.map((s) => {
                const isSubSelected = isSelected && selectedSub === s.name;
                return (
                  <g key={s.name}>
                    <line
                      x1={s.forkX}
                      y1={s.forkY}
                      x2={s.subTipX}
                      y2={s.subTipY}
                      stroke={color.bg}
                      strokeWidth={s.subThick}
                      strokeLinecap="round"
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSub(b.domain, s.name);
                      }}
                    >
                      <title>{`${b.domain} · ${s.name}: ${s.count} ${s.count === 1 ? 'entry' : 'entries'}`}</title>
                    </line>
                    {/* Leaves */}
                    {s.leaves.map((leaf, i) => (
                      <circle
                        key={i}
                        cx={leaf.cx}
                        cy={leaf.cy}
                        r={leaf.r}
                        fill={color.bg}
                        opacity={0.85}
                        className="pointer-events-none"
                      />
                    ))}
                    {/* Sub label — only the selected sub shows text so
                        the tree stays readable. */}
                    {isSubSelected && (
                      <text
                        x={s.subTipX}
                        y={s.subTipY - (s.leaves.length > 0 ? Math.sqrt(s.leaves.length) * 5 + 6 : 6)}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight={700}
                        fill={color.label}
                        className="pointer-events-none select-none"
                      >
                        {s.name} · {s.count}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Domain label at tip */}
              <text
                x={b.labelX}
                y={b.labelY}
                textAnchor={b.labelAnchor}
                fontSize={12}
                fontWeight={isSelected ? 700 : 600}
                fill={emptyBranch ? '#94a3b8' : color.label}
                className="cursor-pointer select-none"
                onClick={() => onSelectPrimary(isSelected ? null : b.domain)}
              >
                {b.domain}
                <tspan fontWeight={400} opacity={0.75}> · {b.count}</tspan>
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
