import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { GARDEN_DOMAINS, type GardenDomain } from '../types';

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

// ---------- Geometry ----------
//
// Sized so the SVG renders close to 1:1 in the Garden card on desktop, which
// keeps label text at its intended pixel size. Each domain owns a 20° wedge
// of the canopy; its sub-branches stay inside that wedge so neighbors never
// cross. Labels sit on a fixed outer ring, one per wedge, so they can't
// collide no matter how long or short each branch grows.

const VIEW_W = 640;
const VIEW_H = 420;
const FORK_X = VIEW_W / 2;
const FORK_Y = 335;
const GROUND_Y = 406;
const LABEL_RING = 250;

const ANGLES: Record<GardenDomain, number> = {
  'Health':                  -70,
  'Career Exploration':      -50,
  'School':                  -30,
  'Relationships':           -10,
  'Emotional Maturity':       10,
  'Environment & Lifestyle':  30,
  'Purpose & Meaning':        50,
  'Other':                    70,
};

const LABEL_LINES: Record<GardenDomain, string[]> = {
  'Health':                  ['Health'],
  'Career Exploration':      ['Career', 'Exploration'],
  'School':                  ['School'],
  'Relationships':           ['Relationships'],
  'Emotional Maturity':      ['Emotional', 'Maturity'],
  'Environment & Lifestyle': ['Environment &', 'Lifestyle'],
  'Purpose & Meaning':       ['Purpose &', 'Meaning'],
  'Other':                   ['Other'],
};

const EMPTY_LEN = 64;
const MIN_LEN = 105;
const MAX_LEN = 172;
const MIN_W = 4;
const MAX_W = 13;
const MIN_SUB_LEN = 18;
const MAX_SUB_LEN = 46;
const SUB_SPREAD_DEG = 18;
const LEAF_R = 5;
const LEAF_MIN_R = 3;
const LEAF_PACK_AFTER = 14;

type Pt = { x: number; y: number };

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function quad(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

// A filled outline around a sampled centerline whose width shrinks from w0
// to w1 — SVG strokes can't taper, and a tapered branch is most of what
// makes this read as a tree rather than a chart.
function taperedPath(pts: Pt[], w0: number, w1: number): string {
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const w = (w0 + (w1 - w0) * (i / (pts.length - 1))) / 2;
    left.push({ x: pts[i].x + nx * w, y: pts[i].y + ny * w });
    right.push({ x: pts[i].x - nx * w, y: pts[i].y - ny * w });
  }
  const fmt = (p: Pt) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  const r = w1 / 2;
  // The arc rounds off the tip so the branch ends soft rather than flat.
  return (
    `M ${left.map(fmt).join(' L ')} ` +
    `A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${fmt(right[right.length - 1])} ` +
    `L ${right.slice().reverse().map(fmt).join(' L ')} Z`
  );
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function seededRand(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function lerpBySqrt(count: number, max: number, lo: number, hi: number): number {
  return lo + (hi - lo) * Math.min(1, Math.sqrt(count / Math.max(1, max)));
}

const leafShape = (r: number) =>
  `M 0 0 C ${r * 0.6} ${-r * 0.75} ${r * 1.5} ${-r * 0.6} ${r * 2.1} 0 C ${r * 1.5} ${r * 0.6} ${r * 0.6} ${r * 0.75} 0 0 Z`;

interface TreeViewProps {
  domainTotals: Map<GardenDomain, number>;
  subCountsByDomain: Map<GardenDomain, Map<string, number>>;
  selectedPrimary: string | null;
  selectedSub: string | null;
  onSelectPrimary: (p: GardenDomain | null) => void;
  onSelectSub: (p: GardenDomain, s: string) => void;
}

export default function TreeView({
  domainTotals,
  subCountsByDomain,
  selectedPrimary,
  selectedSub,
  onSelectPrimary,
  onSelectSub,
}: TreeViewProps) {
  const gradId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(VIEW_W);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width || VIEW_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Text is sized in viewBox units, so divide by the render scale to keep it
  // at a constant on-screen size. On a phone the ring is too tight for names,
  // so labels collapse to count badges and the legend below carries names.
  const scale = Math.max(0.3, width / VIEW_W);
  const compact = width < 500;
  const fs = 12 / scale;

  const layout = useMemo(() => {
    const maxDomain = Math.max(6, ...GARDEN_DOMAINS.map((d) => domainTotals.get(d) || 0));

    return GARDEN_DOMAINS.map((domain) => {
      const a = (ANGLES[domain] * Math.PI) / 180;
      const dir = { x: Math.sin(a), y: -Math.cos(a) };
      const count = domainTotals.get(domain) || 0;
      const empty = count === 0;
      const len = empty ? EMPTY_LEN : lerpBySqrt(count, maxDomain, MIN_LEN, MAX_LEN);
      const w0 = empty ? 2.5 : lerpBySqrt(count, maxDomain, MIN_W, MAX_W);

      // Leave the trunk heading straight up, then bend out toward the
      // wedge — the shared upward start is what reads as one tree.
      const p0 = { x: FORK_X + (ANGLES[domain] / 70) * 11, y: FORK_Y };
      const tip = { x: FORK_X + dir.x * len, y: FORK_Y + dir.y * len };
      const p1 = { x: p0.x, y: p0.y - len * 0.26 };
      const p2 = { x: tip.x - dir.x * len * 0.32, y: tip.y - dir.y * len * 0.32 };
      const centerline = Array.from({ length: 20 }, (_, i) => cubic(p0, p1, p2, tip, i / 19));

      const subMap = subCountsByDomain.get(domain) || new Map<string, number>();
      const subs = Array.from(subMap.entries()).sort((x, y) => y[1] - x[1]);
      const maxSub = Math.max(4, ...subs.map(([, n]) => n));

      const subLayouts = subs.map(([name, n], i) => {
        // Spread forks along the outer half of the branch, alternating sides.
        const t = subs.length === 1 ? 0.78 : 0.5 + (i / (subs.length - 1)) * 0.45;
        const f = cubic(p0, p1, p2, tip, t);
        const g = cubic(p0, p1, p2, tip, Math.min(1, t + 0.02));
        const tl = Math.hypot(g.x - f.x, g.y - f.y) || 1;
        const tan = { x: (g.x - f.x) / tl, y: (g.y - f.y) / tl };
        const side = i % 2 === 0 ? 1 : -1;
        const rot = (side * SUB_SPREAD_DEG * Math.PI) / 180;
        const sdir = {
          x: tan.x * Math.cos(rot) - tan.y * Math.sin(rot),
          y: tan.x * Math.sin(rot) + tan.y * Math.cos(rot),
        };
        const sl = lerpBySqrt(n, maxSub, MIN_SUB_LEN, MAX_SUB_LEN);
        const stip = { x: f.x + sdir.x * sl, y: f.y + sdir.y * sl };
        const ctrl = { x: f.x + tan.x * sl * 0.5, y: f.y + tan.y * sl * 0.5 };
        const spts = Array.from({ length: 10 }, (_, k) => quad(f, ctrl, stip, k / 9));
        const sw0 = Math.max(1.6, Math.min(w0 * 0.55, 1.4 + Math.sqrt(n) * 0.8));

        // Golden-angle spiral around the tip; each leaf points away from it.
        const rand = seededRand(hashString(`${domain}|${name}`));
        const r = n <= LEAF_PACK_AFTER ? LEAF_R : Math.max(LEAF_MIN_R, LEAF_R - 0.07 * (n - LEAF_PACK_AFTER));
        const spread = Math.sqrt(n) * r * 1.15;
        const outward = Math.atan2(sdir.y, sdir.x);
        const leaves = Array.from({ length: n }, (_, k) => {
          const ang = k * 2.39996 + rand() * 0.5;
          const rr = spread * Math.sqrt((k + 0.5) / n);
          const cx = stip.x + Math.cos(ang) * rr;
          const cy = stip.y + Math.sin(ang) * rr;
          const away = rr > 0.5 ? Math.atan2(cy - stip.y, cx - stip.x) : outward;
          return {
            cx,
            cy,
            r,
            rot: ((away * 0.7 + outward * 0.3) * 180) / Math.PI + (rand() - 0.5) * 30,
            opacity: 0.72 + rand() * 0.28,
          };
        });

        return {
          name,
          count: n,
          path: taperedPath(spts, sw0, Math.max(1, sw0 * 0.45)),
          hit: `M ${f.x} ${f.y} Q ${ctrl.x} ${ctrl.y} ${stip.x} ${stip.y}`,
          tip: stip,
          spread,
          labelY: stip.y - spread - 6,
          leaves,
        };
      });

      // Dotted guide from the outermost leaf to the label ring, so a short
      // branch still visibly belongs to its label.
      const extent = Math.max(
        len,
        ...subLayouts.map((s) => Math.hypot(s.tip.x - FORK_X, s.tip.y - FORK_Y) + s.spread),
      );
      const leadFrom = extent + 8;
      const leadTo = LABEL_RING - 24;
      const leader = !empty && leadTo - leadFrom > 8
        ? {
            x1: FORK_X + dir.x * leadFrom,
            y1: FORK_Y + dir.y * leadFrom,
            x2: FORK_X + dir.x * leadTo,
            y2: FORK_Y + dir.y * leadTo,
          }
        : null;

      const ring = { x: FORK_X + dir.x * LABEL_RING, y: FORK_Y + dir.y * LABEL_RING };
      const anchor: 'start' | 'middle' | 'end' =
        ANGLES[domain] <= -45 ? 'end' : ANGLES[domain] >= 45 ? 'start' : 'middle';

      return {
        domain,
        count,
        empty,
        path: taperedPath(centerline, w0, Math.max(1.4, w0 * 0.35)),
        hit: `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${tip.x} ${tip.y}`,
        tip,
        ring,
        anchor,
        leader,
        subs: subLayouts,
      };
    });
  }, [domainTotals, subCountsByDomain]);

  const anySelected = selectedPrimary !== null;
  const haloClass = 'stroke-white dark:stroke-gray-900';

  return (
    <div ref={wrapRef} className="w-full">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full h-auto select-none"
        role="img"
        aria-label="Garden tree with one branch per life domain"
      >
        <defs>
          <radialGradient id={`${gradId}-glow`} cx="50%" cy="55%" r="50%">
            <stop offset="0%" className="[stop-color:#dcfce7] dark:[stop-color:#14532d]" stopOpacity={0.55} />
            <stop offset="100%" className="[stop-color:#dcfce7] dark:[stop-color:#14532d]" stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`${gradId}-bark`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" className="[stop-color:#6b4a2e] dark:[stop-color:#5a3e27]" />
            <stop offset="55%" className="[stop-color:#8b6542] dark:[stop-color:#7a5636]" />
            <stop offset="100%" className="[stop-color:#6b4a2e] dark:[stop-color:#5a3e27]" />
          </linearGradient>
        </defs>

        <ellipse cx={FORK_X} cy={FORK_Y - 90} rx={300} ry={230} fill={`url(#${gradId}-glow)`} />
        <ellipse cx={FORK_X} cy={GROUND_Y + 2} rx={130} ry={8} className="fill-green-200/70 dark:fill-green-900/50" />

        {/* Trunk with a slight root flare at the base */}
        <path
          d={`M ${FORK_X - 13} ${FORK_Y + 6}
              C ${FORK_X - 14} ${FORK_Y + 40} ${FORK_X - 15} ${GROUND_Y - 22} ${FORK_X - 27} ${GROUND_Y + 2}
              L ${FORK_X + 27} ${GROUND_Y + 2}
              C ${FORK_X + 15} ${GROUND_Y - 22} ${FORK_X + 14} ${FORK_Y + 40} ${FORK_X + 13} ${FORK_Y + 6}
              Q ${FORK_X} ${FORK_Y - 6} ${FORK_X - 13} ${FORK_Y + 6} Z`}
          fill={`url(#${gradId}-bark)`}
        />

        {layout.map((b) => {
          const c = DOMAIN_COLORS[b.domain];
          const isSel = selectedPrimary === b.domain;
          const vars = { '--c': c.bg, '--cd': c.dark, '--cl': c.label } as CSSProperties;
          const toggle = () => onSelectPrimary(isSel ? null : b.domain);

          return (
            <g
              key={b.domain}
              style={{ ...vars, opacity: anySelected && !isSel ? 0.22 : 1, transition: 'opacity 150ms' }}
            >
              {b.empty ? (
                <>
                  <path
                    d={b.hit}
                    fill="none"
                    strokeWidth={2}
                    strokeLinecap="round"
                    className="stroke-gray-300 dark:stroke-gray-600"
                  />
                  <circle
                    cx={b.tip.x}
                    cy={b.tip.y}
                    r={3.5}
                    strokeWidth={1.5}
                    className="fill-white stroke-gray-300 dark:fill-gray-900 dark:stroke-gray-600"
                  />
                </>
              ) : (
                <path d={b.path} className="fill-[var(--c)] dark:fill-[var(--cd)]" />
              )}
              <path
                d={b.hit}
                fill="none"
                stroke="transparent"
                strokeWidth={16}
                className="cursor-pointer"
                onClick={toggle}
              >
                <title>{`${b.domain}: ${b.count} ${b.count === 1 ? 'entry' : 'entries'}`}</title>
              </path>

              {b.subs.map((s) => {
                const subSel = isSel && selectedSub === s.name;
                return (
                  <g key={s.name} className="group">
                    <path d={s.path} className="fill-[var(--c)] dark:fill-[var(--cd)]" />
                    {s.leaves.map((l, i) => (
                      <path
                        key={i}
                        d={leafShape(l.r)}
                        transform={`translate(${l.cx.toFixed(1)} ${l.cy.toFixed(1)}) rotate(${l.rot.toFixed(0)})`}
                        opacity={l.opacity}
                        className="fill-[var(--c)] dark:fill-[var(--cd)] pointer-events-none"
                      />
                    ))}
                    <path
                      d={s.hit}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSub(b.domain, s.name);
                      }}
                    >
                      <title>{`${b.domain} · ${s.name}: ${s.count}`}</title>
                    </path>
                    <circle
                      cx={s.tip.x}
                      cy={s.tip.y}
                      r={Math.max(10, Math.sqrt(s.count) * 6)}
                      fill="transparent"
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSub(b.domain, s.name);
                      }}
                    />
                    {!compact && (
                      <text
                        x={s.tip.x}
                        y={s.labelY}
                        textAnchor="middle"
                        fontSize={fs * 0.92}
                        fontWeight={600}
                        strokeWidth={fs * 0.35}
                        strokeLinejoin="round"
                        paintOrder="stroke"
                        className={`${haloClass} fill-gray-800 dark:fill-gray-100 pointer-events-none transition-opacity ${
                          subSel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        {s.name} · {s.count}
                      </text>
                    )}
                  </g>
                );
              })}

              {b.leader && (
                <line
                  {...b.leader}
                  strokeWidth={1.5}
                  strokeDasharray="0.5 5"
                  strokeLinecap="round"
                  className={`pointer-events-none ${
                    b.empty ? 'stroke-gray-300 dark:stroke-gray-600' : 'stroke-[var(--c)] dark:stroke-[var(--cd)] opacity-50'
                  }`}
                />
              )}

              {compact ? (
                <g className="cursor-pointer" onClick={toggle}>
                  <circle
                    cx={b.ring.x}
                    cy={b.ring.y}
                    r={fs * 1.05}
                    className={b.empty ? 'fill-gray-200 dark:fill-gray-700' : 'fill-[var(--c)] dark:fill-[var(--cd)]'}
                  />
                  <text
                    x={b.ring.x}
                    y={b.ring.y + fs * 0.36}
                    textAnchor="middle"
                    fontSize={fs}
                    fontWeight={700}
                    className={b.empty ? 'fill-gray-500 dark:fill-gray-300' : 'fill-white dark:fill-gray-900'}
                  >
                    {b.count}
                  </text>
                </g>
              ) : (
                <text
                  textAnchor={b.anchor}
                  fontSize={fs}
                  strokeWidth={fs * 0.35}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                  className={`${haloClass} cursor-pointer`}
                  onClick={toggle}
                >
                  {(() => {
                    const lines = LABEL_LINES[b.domain];
                    const lh = fs * 1.2;
                    const top = b.ring.y - (lines.length * lh) / 2 + fs * 0.35;
                    return (
                      <>
                        {lines.map((ln, i) => (
                          <tspan
                            key={ln}
                            x={b.ring.x}
                            y={top + i * lh}
                            fontWeight={isSel ? 800 : 650}
                            className={b.empty ? 'fill-gray-400 dark:fill-gray-500' : 'fill-gray-800 dark:fill-gray-100'}
                          >
                            {ln}
                            {i === lines.length - 1 && (
                              <tspan
                                dx={fs * 0.35}
                                fontWeight={700}
                                className={
                                  b.empty
                                    ? 'fill-gray-400 dark:fill-gray-500'
                                    : 'fill-[var(--cl)] dark:fill-[var(--cd)]'
                                }
                              >
                                {b.count}
                              </tspan>
                            )}
                          </tspan>
                        ))}
                      </>
                    );
                  })()}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
