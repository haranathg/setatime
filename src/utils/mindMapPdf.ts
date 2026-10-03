// Turning a map into a sheet you can write on.
//
// A mind map on screen is deliberately tight — the tidy tree packs rows 38pt
// apart so the shape fits in a phone viewport. That is exactly wrong for
// paper: the reason to print a map is to annotate it in a lecture, and a
// tree with no white space around it has nowhere to put a pencil.
//
// So the print layouts are not screenshots of the canvas. They re-run the
// same tidy tree at a print pitch and pair it with a writing field, which is
// what "space around each node" actually has to mean once a pencil is
// involved: every leaf gets its own lane, ruled, running out to the margin.
//
// Three layouts, because how much you write varies and one compromise would
// serve neither end:
//
//   overview  — the whole map on one page with wide margins. The shape at a
//               glance, annotated in the white space around it.
//   roomy     — overview first, then one page per top-level branch with a
//               ruled lane beside every node. The default: you keep the
//               shape AND get real room.
//   worksheet — no picture; every node as a heading over a ruled block. Most
//               writing room per node, for a lecture you are rebuilding from
//               scratch rather than annotating.

import {
  layoutMap,
  branchColorOf,
  BRANCH_COLORS,
  pageUnits,
  nestedSections,
  pathToRoot,
  MAX_NODE_LINES,
  sectionLabelOf,
  subtreeIds,
  tagOf,
  labelSlotsOf,
} from './mindMapLayout';
import type { MapLayout, SplitMode } from './mindMapLayout';
import { PdfBuilder } from './pdf';
import type { RGB } from './pdf';
import type { MindMap, MindMapNode, MapColorMode } from '../types';

export type PdfLayoutKind = 'overview' | 'roomy' | 'worksheet';
export type PdfGuides = 'ruled' | 'dots' | 'blank';
export type PdfPaper = 'letter' | 'a4' | 'ipad' | 'fit';
export type PdfNodeStyle = 'outline' | 'map';

export interface MindMapPdfOptions {
  layout: PdfLayoutKind;
  paper: PdfPaper;
  landscape: boolean;
  guides: PdfGuides;
  /** How the writing pages render a unit.
   *
   *  'outline' is the default because it is the only one that cannot
   *  truncate: an indented list uses the page's full width, so text stays at
   *  full size however deep the branch goes. The tree drawn as a tree has to
   *  fit its whole width into the column beside the writing space, which at
   *  four levels meant rendering at about a third scale against a 6pt font
   *  floor — the point where labels stop fitting their boxes.
   *
   *  The map picture is still on the overview page, where it is a picture
   *  rather than something you write next to. */
  nodeStyle?: PdfNodeStyle;
  /** Where the page breaks fall. Sections is the default and the one that
   *  matches how a course tree is actually organised; branches is what maps
   *  did before sections existed; lectures gives a page per session. */
  splitBy?: SplitMode;
  /** Print one branch rather than the whole tree — the node you are focused
   *  on, re-rooted so it prints as a document in its own right. */
  rootId?: string;
  /** Print only the nodes carrying this label. The point of a course-sized
   *  map is that it holds everything; the point of printing is usually that
   *  you are about to sit through one session. */
  lectureId?: string;
}

export const DEFAULT_PDF_OPTIONS: MindMapPdfOptions = {
  layout: 'roomy',
  paper: 'letter',
  landscape: false,
  guides: 'ruled',
  splitBy: 'section',
  nodeStyle: 'outline',
};

/** Points, at 72/inch. The iPad size is 4:3 so it fills the screen in a
 *  notes app without letterboxing; it keeps Letter's width so the same file
 *  still prints sensibly. */
const PAPER: Record<PdfPaper, [number, number]> = {
  letter: [612, 792],
  a4: [595, 842],
  ipad: [612, 816],
  // Unused: a fit-to-map page is measured from the map itself.
  fit: [612, 792],
};

export const PAPER_LABELS: Record<PdfPaper, string> = {
  letter: 'Letter',
  a4: 'A4',
  ipad: 'iPad 4:3',
  fit: 'Fit to map',
};

const MARGIN = 42;
const HEADER_H = 30;
const FOOTER_H = 22;
const RULE_GAP = 26;      // handwriting line spacing
const PRINT_ROW_H = 84;   // one lane per leaf, tall enough for ~3 lines
const PRINT_COL_W = 208;  // wider than the widest node box, so columns never overlap
const MAX_LANE_H = 240;   // ~9 ruled lines; past this a lane is just empty paper

// Fit-to-map: one page, sized to the map rather than the map squeezed onto a
// page. Nothing is scaled down, so nothing can be truncated or shrunk below
// legibility — the page simply gets as big as it needs to be. Meant for a
// tablet, where you pinch and pan around a large sheet; a printer would have
// to tile it.
const FIT_ROW_H = 68;     // room to write between rows rather than a tight tree
const FIT_COL_W = 320;
const FIT_BOX_W = 280;    // a long label spreads sideways instead of wrapping
const FIT_MARGIN = 72;    // white space all round to annotate into
/** PDF's own ceiling on a page dimension: 14400 units, i.e. 200 inches. */
const PDF_MAX = 14400;

const INK: RGB = [0.13, 0.15, 0.19];
const MUTED: RGB = [0.55, 0.58, 0.63];
const FAINT: RGB = [0.85, 0.87, 0.89];
const GUIDE: RGB = [0.89, 0.91, 0.93];
const GUIDE_DOT: RGB = [0.78, 0.81, 0.84];  // a dot reads lighter than a rule at the same value

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

/** Mix toward white — branch colour at full strength is too heavy for a fill
 *  behind text you then write on top of. */
function tint(c: RGB, amount: number): RGB {
  return [
    c[0] + (1 - c[0]) * amount,
    c[1] + (1 - c[1]) * amount,
    c[2] + (1 - c[2]) * amount,
  ];
}

/** The tree cut down to one lecture's contribution, plus the ancestors that
 *  connect those nodes back to the root. Without the ancestors the result is
 *  a forest of orphans; with them it still reads as the same map, just
 *  emptier — which is exactly what "where does this lecture sit" looks
 *  like. */
function sliceToLecture(nodes: MindMapNode[], label: string): MindMapNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const keep = new Set<string>();
  for (const n of nodes) {
    if (tagOf(n) !== label) continue;
    let cur: string | null = n.id;
    while (cur && !keep.has(cur)) {
      keep.add(cur);
      cur = byId.get(cur)?.parentId ?? null;
    }
  }
  const root = nodes.find((n) => n.parentId === null);
  if (root) keep.add(root.id);
  return nodes.filter((n) => keep.has(n.id));
}

/** The nominal label size in LAYOUT units. Boxes and text scale together,
 *  so wrapping can be decided once here and stays correct at any scale. */
const NOMINAL_SIZE = 9.2;

/** Node heights backed by real Helvetica metrics rather than the canvas'
 *  character-count estimate, so a printed box is never a line short of the
 *  text it is about to hold. */
function pdfHeightOf(pdf: PdfBuilder) {
  return (node: MindMapNode, depth: number, w: number): number => {
    const lines = Math.min(
      MAX_NODE_LINES,
      Math.max(1, pdf.wrap(node.text || ' ', w - 10, NOMINAL_SIZE, depth === 0).length)
    );
    const label = sectionLabelOf(node, depth) ? 12 : 0;
    return Math.round(12 + lines * 16.5 + label);
  };
}

/** One branch as a standalone tree. The focus node becomes the root, so
 *  every downstream step — sections, colours, the contents page — treats it
 *  as a document rather than as a fragment of a bigger one. */
function sliceToSubtree(nodes: MindMapNode[], rootId: string): MindMapNode[] {
  const keep = subtreeIds(nodes, rootId);
  return nodes
    .filter((n) => keep.has(n.id))
    .map((n) => (n.id === rootId ? { ...n, parentId: null } : n));
}

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------- chrome

function drawHeader(pdf: PdfBuilder, title: string, crumb: string | null, frame: Frame): void {
  const maxW = frame.w - (crumb ? 0 : 0);
  pdf.text(pdf.fit(title, maxW, 13, true), frame.x, frame.y + 11, {
    size: 13,
    bold: true,
    color: INK,
  });
  if (crumb) {
    pdf.text(pdf.fit(crumb, maxW, 9), frame.x, frame.y + 24, { size: 9, color: MUTED });
  }
  pdf.line(frame.x, frame.y + HEADER_H, frame.x + frame.w, frame.y + HEADER_H, {
    color: FAINT,
    width: 0.75,
  });
}

function drawFooter(pdf: PdfBuilder, left: string, right: string, frame: Frame, pageH: number): void {
  const y = pageH - MARGIN + 12;
  pdf.text(pdf.fit(left, frame.w * 0.7, 8), frame.x, y, { size: 8, color: MUTED });
  pdf.text(right, frame.x + frame.w, y, { size: 8, color: MUTED, align: 'right' });
}

/** The writing field: ruled lines, a dot grid, or nothing but the lane
 *  separators. This is the part the pencil actually lands on. */
function drawGuides(pdf: PdfBuilder, area: Frame, guides: PdfGuides): void {
  if (guides === 'blank') return;
  if (guides === 'ruled') {
    for (let y = area.y + RULE_GAP; y < area.y + area.h - 2; y += RULE_GAP) {
      pdf.line(area.x, y, area.x + area.w, y, { color: GUIDE, width: 0.6 });
    }
    return;
  }
  const step = 20;
  const points: [number, number][] = [];
  for (let y = area.y + step; y < area.y + area.h - 2; y += step) {
    for (let x = area.x + step / 2; x < area.x + area.w - 2; x += step) {
      points.push([x, y]);
    }
  }
  pdf.dots(points, 0.65, GUIDE_DOT);
}

// ------------------------------------------------------------ the map art

/** Draw a laid-out tree into `frame`, scaled to fit, with `offsetY` of it
 *  already consumed by earlier pages. Returns nothing — pagination is the
 *  caller's business. */
function drawTree(
  pdf: PdfBuilder,
  layout: MapLayout,
  nodes: MindMapNode[],
  opts: {
    /** The map's real root. Branch colour is always resolved against THIS,
     *  never against whatever subtree happens to be on the page — otherwise
     *  every branch page recolours its own children from the top of the
     *  palette and the colours stop meaning anything across the document.
     *  For a focused export that means the ORIGINAL root and the ORIGINAL
     *  node list, even though the page is laid out from a re-rooted slice:
     *  a branch printed on its own should be the colour it is on screen. */
    colorRoot: string;
    colorNodes?: MindMapNode[];
    colorMode?: MapColorMode;
    /** Resolved against the WHOLE map, never the slice on the page, so a
     *  label keeps its colour in a focused export. */
    colorLabels?: Map<string, number | null>;
    /** The node drawn as the anchor box, if any. */
    anchorId: string | null;
    frame: Frame;
    scale: number;
    originX: number;
    originY: number;
    visible: Set<string>;
  }
): void {
  const { colorRoot, anchorId, frame, scale, originX, originY, visible } = opts;
  const palette = opts.colorNodes ?? nodes;
  const cmode = opts.colorMode ?? 'branch';
  const clabels = opts.colorLabels;
  const px = (x: number) => frame.x + (x - originX) * scale;
  const py = (y: number) => frame.y + (y - originY) * scale;

  for (const { from, to } of layout.edges) {
    if (!visible.has(from.node.id) || !visible.has(to.node.id)) continue;
    const x1 = px(from.x + from.w);
    const y1 = py(from.y + from.h / 2);
    const x2 = px(to.x);
    const y2 = py(to.y + to.h / 2);
    const mid = (x1 + x2) / 2;
    const color = hexToRgb(branchColorOf(to.node.id, palette, colorRoot, cmode, clabels) ?? '#94a3b8');
    pdf.curve(x1, y1, mid, y1, mid, y2, x2, y2, { color: tint(color, 0.45), width: 1.1 });
  }

  for (const l of layout.nodes) {
    if (!visible.has(l.node.id)) continue;
    const hex = branchColorOf(l.node.id, palette, colorRoot, cmode, clabels);
    const color = hex ? hexToRgb(hex) : INK;
    const x = px(l.x);
    const y = py(l.y);
    const w = l.w * scale;
    const h = l.h * scale;
    const size = Math.max(6.5, Math.min(10, 9.2 * scale));
    const isRoot = l.node.id === anchorId;

    const isSection = !!l.node.section && !isRoot;
    if (isRoot) {
      pdf.rect(x, y, w, h, { fill: tint(INK, 0.9), color: MUTED, width: 0.8, radius: 5 * scale });
    } else {
      pdf.rect(x, y, w, h, {
        fill: tint(color, 0.9),
        color: isSection ? color : tint(color, 0.35),
        width: isSection ? 1.4 : 0.9,
        radius: 5 * scale,
      });
    }
    const sectionLabel = sectionLabelOf(l.node, l.depth);
    if (sectionLabel) {
      pdf.text(pdf.fit(sectionLabel, w - 10 * scale, size * 0.72), x + 5 * scale, y + size * 0.95, {
        size: size * 0.72,
        bold: true,
        color,
      });
    }
    // Wrap rather than truncate. Medical labels are long — "Preserved vs
    // reduced ejection fraction" does not fit one line at any size a pencil
    // can annotate around — and a map whose labels end in "..." is not a
    // map of anything. Each line is still fitted individually, which is what
    // catches a single word longer than the whole box.
    const inner = w - 10 * scale;
    const wrapped = pdf.wrap(l.node.text || ' ', inner, size, isRoot);
    const lines = wrapped.slice(0, MAX_NODE_LINES);
    if (wrapped.length > MAX_NODE_LINES) {
      lines[MAX_NODE_LINES - 1] = `${lines[MAX_NODE_LINES - 1]} ${wrapped.slice(MAX_NODE_LINES).join(' ')}`;
    }
    const lineH = size * 1.22;
    // Section labels sit above the text, so the block centres below them.
    const labelDrop = sectionLabel ? size * 0.9 : 0;
    const top = y + labelDrop + (h - labelDrop - lines.length * lineH) / 2 + size * 0.82;
    lines.forEach((ln, i) => {
      pdf.text(pdf.fit(ln, inner, size, isRoot), x + 5 * scale, top + i * lineH, {
        size,
        bold: isRoot,
        color: isRoot ? INK : color,
      });
    });
    if (l.hiddenChildren > 0) {
      pdf.text(`+${l.hiddenChildren}`, x + w + 4 * scale, y + h / 2 + size * 0.34, {
        size: size * 0.85,
        color: MUTED,
      });
    }
  }
}

// ------------------------------------------------------------ the layouts

function overviewPage(
  pdf: PdfBuilder,
  map: MindMap,
  nodes: MindMapNode[],
  rootId: string,
  frame: Frame,
  headline: string | null,
  palette: ColorPalette,
  layoutOpts?: { rowH?: number; colW?: number; maxBoxW?: number }
): void {
  const layout = layoutMap(nodes, { ...layoutOpts, heightOf: pdfHeightOf(pdf) });
  const body: Frame = {
    x: frame.x,
    y: frame.y + HEADER_H + 18,
    w: frame.w,
    h: frame.h - HEADER_H - FOOTER_H - 18,
  };
  // Deliberately never scaled ABOVE 1: a six-node map blown up to fill the
  // sheet looks like a mistake, and the empty space is where you write.
  const scale = Math.min(body.w / Math.max(layout.width, 1), body.h / Math.max(layout.height, 1), 1);
  const drawn: Frame = {
    x: body.x + Math.max(0, (body.w - layout.width * scale) / 2),
    y: body.y,
    w: body.w,
    h: body.h,
  };
  const all = new Set(layout.nodes.map((n) => n.node.id));
  drawTree(pdf, layout, nodes, {
    colorRoot: palette.root,
    colorNodes: palette.nodes,
    colorMode: palette.mode,
    colorLabels: palette.labelSlots,
    anchorId: rootId,
    frame: drawn,
    scale,
    originX: 0,
    originY: 0,
    visible: all,
  });
  drawHeader(pdf, map.title, headline, frame);
}

/** One page per top-level branch: the branch drawn down the left, and a lane
 *  of ruled space beside every node in it.
 *
 *  The branch's own box is NOT drawn — the page header already says which
 *  branch this is, and dropping it reclaims a whole column of width. That
 *  matters more than it sounds: with the anchor box present a two-level
 *  branch is 400pt wide and has to be shrunk to ~0.6 to leave room to write,
 *  which puts the labels at 6pt. Without it the same branch fits at full
 *  size and the writing column gets the rest of the page. */
function branchPages(
  pdf: PdfBuilder,
  map: MindMap,
  nodes: MindMapNode[],
  branch: MindMapNode,
  opts: MindMapPdfOptions,
  frame: Frame,
  pageH: number,
  startNewPage: () => void,
  stamp: string,
  palette: ColorPalette,
  fallbackTrail: string | null,
  onFirstPage?: (page: number) => void
): void {
  const hex = branchColorOf(branch.id, palette.nodes, palette.root, palette.mode, palette.labelSlots);
  const color = hexToRgb(hex ?? BRANCH_COLORS[0]);
  // A unit's page stops at the next section inside it, which gets its own —
  // otherwise a nested section is drawn on both pages.
  const stopAt = nestedSections(nodes, branch.id);
  const bodyTop = frame.y + HEADER_H + 14;
  const bodyH = frame.h - HEADER_H - FOOTER_H - 14;

  const hasKids = nodes.some((n) => n.parentId === branch.id) && !branch.collapsed && !stopAt.has(branch.id);
  // Hiding the anchor shifts every remaining node one column to the left.
  const originX = hasKids ? PRINT_COL_W : 0;

  const isLeaf = (n: { childIds: string[]; hiddenChildren: number }) =>
    n.childIds.length === 0 || n.hiddenChildren > 0;

  // First pass sizes the tree; the second lays it out at the lane height that
  // actually fills the page, so a branch with three children gets three tall
  // lanes rather than three short ones and a lot of blank paper.
  const probe = layoutMap(nodes, {
    rowH: PRINT_ROW_H,
    colW: PRINT_COL_W,
    rootId: branch.id,
    forceCollapsed: stopAt,
    heightOf: pdfHeightOf(pdf),
  });
  const treeW = Math.max(probe.width - originX, 1);
  const treeMaxW = frame.w * 0.52;
  const scale = Math.min(treeMaxW / treeW, 1);

  const leaves0 = probe.nodes.filter(isLeaf);
  const leafCount = Math.max(leaves0.length, 1);
  // The tallest leaf sets the floor. Without it a two-line label needs more
  // than its lane, the layout gives it more, and the page no longer divides
  // into equal lanes — leaving one leaf stranded on a page of its own.
  const tallest = leaves0.reduce((m, n) => Math.max(m, n.h), 0);
  const shortest = leaves0.reduce((m, n) => Math.min(m, n.h), tallest);
  // A lane is centred on its node's BOX, and boxes now differ in height, so
  // the run of lanes spans half the tallest-to-shortest spread more than
  // leafCount * laneH. Without allowing for it, a page that should hold
  // exactly five lanes holds four and strands the fifth on a page of its
  // own.
  const spread = ((tallest - shortest) / 2) * scale;
  const laneH = Math.min(
    Math.max((bodyH - spread) / leafCount, PRINT_ROW_H * scale, (tallest + 14) * scale),
    MAX_LANE_H
  );

  const layout = layoutMap(nodes, {
    rowH: laneH / scale,
    colW: PRINT_COL_W,
    rootId: branch.id,
    forceCollapsed: stopAt,
    heightOf: pdfHeightOf(pdf),
  });
  const rowH = laneH / scale;

  const writeX = frame.x + Math.max(treeW * scale, treeMaxW * 0.55) + 18;
  const writeW = frame.x + frame.w - writeX;

  // Lanes are per leaf: a leaf is where the content actually is, and giving a
  // parent its own lane would just overlap its children's. A lane is centred
  // on the node BOX, not on its layout row — the box hangs below the row by
  // half its height, and centring on the row leaves every label sitting low
  // against the line below it.
  const leaves = layout.nodes.filter(isLeaf).sort((a, b) => a.y - b.y);
  const mid = (n: { y: number; h: number }) => n.y + n.h / 2;

  let cursor = 0;
  let part = 0;
  while (cursor < leaves.length) {
    if (part > 0) startNewPage();
    const originY = mid(leaves[cursor]) - rowH / 2;
    const fits: typeof leaves = [];
    while (cursor < leaves.length && (mid(leaves[cursor]) + rowH / 2 - originY) * scale <= bodyH) {
      fits.push(leaves[cursor]);
      cursor++;
    }
    if (fits.length === 0) {
      // A single lane taller than the page cannot happen at these numbers,
      // but refusing to advance would loop forever if it ever did.
      fits.push(leaves[cursor]);
      cursor++;
    }

    const at = (v: number) => bodyTop + (v - originY) * scale;

    for (const leaf of fits) {
      const top = at(mid(leaf) - rowH / 2);
      pdf.line(writeX, top, writeX + writeW, top, { color: FAINT, width: 0.7 });
      drawGuides(pdf, { x: writeX + 4, y: top, w: writeW - 4, h: laneH }, opts.guides);
      // A tick in the branch colour ties the lane to the node beside it.
      pdf.line(writeX, top, writeX + 10, top, { color: tint(color, 0.3), width: 1.4 });
    }
    const last = fits[fits.length - 1];
    pdf.line(writeX, at(mid(last) + rowH / 2), writeX + writeW, at(mid(last) + rowH / 2), {
      color: FAINT,
      width: 0.7,
    });

    // Only the nodes whose lanes are on this page, plus the ancestors that
    // carry the structure above them.
    const visible = new Set<string>();
    for (const leaf of fits) {
      let cur: string | null = leaf.node.id;
      while (cur && layout.byId.has(cur)) {
        if (visible.has(cur)) break;
        visible.add(cur);
        cur = layout.byId.get(cur)?.node.parentId ?? null;
      }
    }
    if (hasKids) visible.delete(branch.id);

    drawTree(pdf, layout, nodes, {
      colorRoot: palette.root,
      colorNodes: palette.nodes,
      colorMode: palette.mode,
      colorLabels: palette.labelSlots,
      anchorId: hasKids ? null : branch.id,
      frame: { x: frame.x, y: bodyTop, w: treeW * scale, h: bodyH },
      scale,
      originX,
      originY,
      visible,
    });

    // The path above this unit. Empty when the unit IS the page's root,
    // which a focused export hits — then the branch's place in the original
    // map is more use than its own name repeated back.
    const trail =
      pathToRoot(nodes, branch.id)
        .slice(0, -1)
        .map((n) => n.text)
        .join('  ›  ') || fallbackTrail || '';
    drawHeader(pdf, branch.text, part === 0 ? trail || null : `${trail || map.title} — continued`, frame);
    drawFooter(pdf, stamp, `Page ${pdf.pageCount}`, frame, pageH);
    if (part === 0) onFirstPage?.(pdf.pageCount);
    part++;
  }
}

/** Typographic weight by depth. A printed skeleton has to be scannable
 *  while somebody is talking, and depth is the hierarchy — so it is carried
 *  by size and weight rather than left for the reader to infer from
 *  indentation alone. */
function rowStyle(depth: number): { size: number; bold: boolean; space: number } {
  if (depth <= 1) return { size: 11.5, bold: true, space: 8 };
  if (depth === 2) return { size: 10, bold: true, space: 6 };
  return { size: 9.2, bold: false, space: 5 };
}

const INDENT = 15;
const RULED = 26;          // handwriting line spacing
const LEAF_LINES = 3;      // room under something with no children
const STAR_LINES = 5;      // a starred node is where the detail goes

interface OutlineRow {
  node: MindMapNode;
  depth: number;
  color: RGB;
  /** Ruled lines below this row. Headings get none: their children are
   *  their content, and lines under a heading are lines you never use. */
  lines: number;
  /** The label, already wrapped to the width it will be drawn at, so
   *  pagination measures the row that actually gets printed. */
  text: string[];
  /** The node's tag, but only when it differs from its parent's. */
  tag: string | null;
  /** The note, wrapped. Printed under the heading and ABOVE any children —
   *  which is the whole point of it. A general remark about a disease is a
   *  property of the disease, not a fourth type of it, and filing it as a
   *  sibling of the types is the mistake a tree makes easy to commit. */
  note: string[];
  noteH: number;
  textH: number;
  height: number;
}

/** Where the first rule sits below the label, and how much room to leave
 *  under the last one. Kept next to the drawing code because the reserved
 *  height and the drawn lines have to agree exactly — reserving three lines
 *  and drawing two is how a page ends up two thirds full. */
const RULE_TOP_GAP = 6;
const RULE_TAIL = 12;
const NOTE_SIZE = 8.4;
const NOTE_LEAD = 1.25;

function rowHeight(textH: number, noteH: number, lines: number, space: number): number {
  const head = textH + noteH;
  if (lines === 0) return head + space + 6;
  return head + RULE_TOP_GAP + (lines - 1) * RULED + RULE_TAIL;
}

function buildRows(
  pdf: PdfBuilder,
  nodes: MindMapNode[],
  unitId: string,
  stopAt: Set<string>,
  palette: ColorPalette,
  frame: Frame
): OutlineRow[] {
  const childrenOf = new Map<string, MindMapNode[]>();
  for (const n of nodes) {
    if (n.parentId === null) continue;
    const arr = childrenOf.get(n.parentId);
    if (arr) arr.push(n);
    else childrenOf.set(n.parentId, [n]);
  }
  const rows: OutlineRow[] = [];
  const walk = (id: string, depth: number) => {
    for (const kid of childrenOf.get(id) ?? []) {
      const hex = branchColorOf(kid.id, palette.nodes, palette.root, palette.mode, palette.labelSlots);
      const kids = stopAt.has(kid.id) || kid.collapsed ? [] : (childrenOf.get(kid.id) ?? []);
      const isLeaf = kids.length === 0;
      const lines = isLeaf ? (kid.star ? STAR_LINES : LEAF_LINES) : 0;
      const st = rowStyle(depth);
      const textX = frame.x + (depth - 1) * INDENT + 13;
      const wrapped = pdf.wrap(kid.text || ' ', frame.x + frame.w - textX, st.size, st.bold);
      // Reference text, not writing room: it is set narrower than the label
      // so it reads as a remark about the heading rather than another row.
      const noteLines = kid.note
        ? pdf.wrap(kid.note, frame.x + frame.w - textX - 8, NOTE_SIZE)
        : [];
      const noteH = noteLines.length ? 4 + noteLines.length * NOTE_SIZE * NOTE_LEAD : 0;
      // The tag is printed only where it CHANGES. Repeating "Lec 4" down
      // every row of a page that is entirely Lec 4 is noise; printing it
      // once, where the material starts, is the actual information.
      const parent = kid.parentId ? nodes.find((x) => x.id === kid.parentId) : undefined;
      const tag = tagOf(kid);
      const showTag = !!tag && tag !== kid.text && (!parent || tagOf(parent) !== tag);
      const textH = st.size * 0.85 + (wrapped.length - 1) * st.size * 1.2;
      rows.push({
        node: kid,
        depth,
        color: hex ? hexToRgb(hex) : INK,
        lines,
        text: wrapped,
        tag: showTag ? tag! : null,
        note: noteLines,
        noteH,
        textH,
        height: rowHeight(textH, noteH, lines, st.space),
      });
      walk(kid.id, depth + 1);
    }
  };
  walk(unitId, 1);
  return rows;
}

/** One unit as an indented outline with writing room under every leaf. */
function unitOutlinePages(
  pdf: PdfBuilder,
  map: MindMap,
  nodes: MindMapNode[],
  unit: MindMapNode,
  opts: MindMapPdfOptions,
  frame: Frame,
  pageH: number,
  startNewPage: () => void,
  stamp: string,
  palette: ColorPalette,
  fallbackTrail: string | null,
  onFirstPage?: (page: number) => void
): void {
  const stopAt = nestedSections(nodes, unit.id);
  const rows = buildRows(pdf, nodes, unit.id, stopAt, palette, frame);
  const unitColor = hexToRgb(branchColorOf(unit.id, palette.nodes, palette.root, palette.mode, palette.labelSlots) ?? BRANCH_COLORS[0]);

  const trail =
    pathToRoot(nodes, unit.id)
      .slice(0, -1)
      .map((n) => n.text)
      .join('  \u203a  ') || fallbackTrail || '';

  const bodyTop = frame.y + HEADER_H + 16;
  const bodyBottom = frame.y + frame.h - FOOTER_H;
  const Q_H = 30;

  let y = bodyTop;
  let part = 0;
  let index = 0;
  const openPage = () => {
    drawHeader(pdf, unit.text, part === 0 ? trail || null : `${trail || map.title} \u2014 continued`, frame);
    if (part === 0) onFirstPage?.(pdf.pageCount);
  };
  openPage();

  while (index < rows.length) {
    const row = rows[index];
    // Reserve the Q: line only on what will be the last page of the unit.
    const isLast = index === rows.length - 1;
    // A heading is never left alone at the foot of a page. It carries no
    // writing room of its own, so stranded there it is a line of text with
    // nothing to do and its content starts on the next sheet.
    const widow = row.lines === 0 && index + 1 < rows.length ? rows[index + 1].height : 0;
    const need = row.height + widow + (isLast ? Q_H : 0);
    if (y + need > bodyBottom && y > bodyTop) {
      drawFooter(pdf, stamp, `Page ${pdf.pageCount}`, frame, pageH);
      startNewPage();
      part++;
      y = bodyTop;
      openPage();
    }

    const st = rowStyle(row.depth);
    const x = frame.x + (row.depth - 1) * INDENT;
    const textX = x + 13;

    // A rule down the left of every level: the hierarchy you can see at a
    // glance without counting indents.
    pdf.line(x + 3, y - 2, x + 3, y + row.height - 4, { color: tint(row.color, 0.55), width: 1.6 });

    if (row.node.star) {
      // Filled dot rather than a glyph: the base-14 fonts have no star, and
      // a solid mark reads faster in a margin than any character would.
      pdf.dot(x + 3, y + st.size * 0.45, 3.1, row.color);
    }

    row.text.forEach((ln, i) => {
      pdf.text(ln, textX, y + st.size * 0.85 + i * st.size * 1.2, {
        size: st.size,
        bold: st.bold,
        color: row.depth <= 2 ? INK : [0.25, 0.27, 0.32],
      });
    });

    if (row.tag) {
      pdf.text(row.tag, frame.x + frame.w, y + st.size * 0.85, {
        size: 7.5,
        color: MUTED,
        align: 'right',
      });
    }

    if (row.note.length > 0) {
      const ny = y + row.textH + 4;
      row.note.forEach((ln, i) => {
        pdf.text(ln, textX + 8, ny + NOTE_SIZE * 0.85 + i * NOTE_SIZE * NOTE_LEAD, {
          size: NOTE_SIZE,
          color: MUTED,
        });
      });
    }

    if (row.lines > 0) {
      // drawGuides puts its first rule one gap below the band's top, so the
      // band starts a gap high and is a hair taller than the last rule — the
      // count then matches what rowHeight reserved.
      const top = y + row.textH + row.noteH + RULE_TOP_GAP;
      drawGuides(
        pdf,
        { x: textX, y: top - RULED, w: frame.x + frame.w - textX, h: row.lines * RULED + 4 },
        opts.guides
      );
    } else if (row.depth <= 2) {
      // A hairline under a heading, so a page of nested headings still has
      // visible structure.
      const hairY = y + row.textH + row.noteH + 4;
      pdf.line(textX, hairY, frame.x + frame.w, hairY, { color: FAINT, width: 0.6 });
    }

    y += row.height;
    index++;
  }

  // The question this material answers. Written in the room, it turns a page
  // of notes into something you can be tested by later instead of re-read.
  const qy = Math.min(y + 10, bodyBottom - Q_H + 10);
  pdf.text('Q:', frame.x, qy + 8, { size: 10, bold: true, color: tint(unitColor, 0.15) });
  pdf.line(frame.x + 18, qy + 10, frame.x + frame.w, qy + 10, { color: GUIDE, width: 0.8 });
  pdf.line(frame.x + 18, qy + 10 + RULED, frame.x + frame.w, qy + 10 + RULED, {
    color: GUIDE,
    width: 0.8,
  });

  drawFooter(pdf, stamp, `Page ${pdf.pageCount}`, frame, pageH);
}

/** No picture: every node as a heading over a block of ruled space. */
function worksheetPages(
  pdf: PdfBuilder,
  map: MindMap,
  nodes: MindMapNode[],
  rootId: string,
  opts: MindMapPdfOptions,
  frame: Frame,
  pageH: number,
  startNewPage: () => void,
  stamp: string
): void {
  const cmode: MapColorMode = map.colorBy ?? 'section';
  const clabels = labelSlotsOf(map.nodes);
  const childrenOf = new Map<string, MindMapNode[]>();
  for (const n of nodes) {
    if (n.parentId === null) continue;
    const arr = childrenOf.get(n.parentId);
    if (arr) arr.push(n);
    else childrenOf.set(n.parentId, [n]);
  }

  interface Row {
    node: MindMapNode;
    depth: number;
    color: RGB | null;
    space: number;
  }
  const rows: Row[] = [];
  const walk = (id: string, depth: number) => {
    for (const kid of childrenOf.get(id) ?? []) {
      const hex = branchColorOf(kid.id, nodes, rootId, cmode, clabels);
      const kids = childrenOf.get(kid.id) ?? [];
      // A heading with children is a signpost; a leaf is where the content
      // goes, so that is where the room goes too.
      const space = kids.length > 0 ? RULE_GAP : RULE_GAP * 3;
      rows.push({ node: kid, depth, color: hex ? hexToRgb(hex) : null, space });
      walk(kid.id, depth + 1);
    }
  };
  walk(rootId, 0);

  const bodyTop = frame.y + HEADER_H + 16;
  const bodyBottom = frame.y + frame.h - FOOTER_H;
  let y = bodyTop;
  let first = true;

  for (const row of rows) {
    const indent = Math.min(row.depth, 4) * 18;
    const headSize = row.depth === 0 ? 11.5 : row.depth === 1 ? 10 : 9;
    const blockH = row.space + 6;
    const needed = headSize + 6 + blockH;

    if (y + needed > bodyBottom) {
      drawFooter(pdf, stamp, `Page ${pdf.pageCount}`, frame, pageH);
      startNewPage();
      drawHeader(pdf, map.title, 'continued', frame);
      y = bodyTop;
      first = false;
    }
    if (first) {
      drawHeader(pdf, map.title, map.course ?? null, frame);
      first = false;
    }

    const x = frame.x + indent;
    if (row.color) pdf.dot(x + 3, y + headSize * 0.4, 2.6, row.color);
    pdf.text(
      pdf.fit(row.node.text, frame.w - indent - 16, headSize, row.depth <= 1),
      x + 11,
      y + headSize * 0.8,
      { size: headSize, bold: row.depth <= 1, color: row.color ?? INK }
    );
    y += headSize + 6;
    if (row.node.note) {
      for (const line of pdf.wrap(row.node.note, frame.w - indent - 16, 8.5)) {
        pdf.text(line, x + 11, y + 7, { size: 8.5, color: MUTED });
        y += 11;
      }
      y += 2;
    }
    drawGuides(pdf, { x: x + 11, y, w: frame.w - indent - 11, h: blockH }, opts.guides);
    y += blockH;
    pdf.line(frame.x, y - 4, frame.x + frame.w, y - 4, { color: FAINT, width: 0.5 });
  }
  if (first) drawHeader(pdf, map.title, map.course ?? null, frame);
  drawFooter(pdf, stamp, `Page ${pdf.pageCount}`, frame, pageH);
}

// ------------------------------------------------------------------ entry

export interface MindMapPdfResult {
  blob: Blob;
  pages: number;
  /** The page size in points, so the export sheet can say how big a
   *  fit-to-map sheet turned out before you commit to it. */
  pageW: number;
  pageH: number;
}

/** The contents page. Worth its own page once a tree holds a course: twenty
 *  sections with page numbers is the difference between a reference you can
 *  open at the right place and a forty-page stack you flip through. Page
 *  numbers come from a first pass, because you cannot know them until the
 *  document has been laid out once. */
function contentsPages(
  pdf: PdfBuilder,
  units: MindMapNode[],
  nodes: MindMapNode[],
  rootId: string,
  colorKey: { mode: MapColorMode; labelSlots: Map<string, number | null> },
  pageOf: Map<string, number>,
  offset: number,
  frame: Frame,
  pageH: number,
  startNewPage: () => void,
  stamp: string
): void {
  const bodyTop = frame.y + HEADER_H + 18;
  const bodyBottom = frame.y + frame.h - FOOTER_H;
  const ROW = 22;
  let y = bodyTop;
  let first = true;

  const depthOf = (id: string) => Math.max(0, pathToRoot(nodes, id).length - 2);

  for (const unit of units) {
    if (y + ROW > bodyBottom) {
      drawFooter(pdf, stamp, `Page ${pdf.pageCount}`, frame, pageH);
      startNewPage();
      drawHeader(pdf, 'Contents', 'continued', frame);
      y = bodyTop;
      first = false;
    }
    if (first) {
      drawHeader(pdf, 'Contents', null, frame);
      first = false;
    }
    const indent = Math.min(depthOf(unit.id), 3) * 16;
    const hex = branchColorOf(unit.id, nodes, rootId, colorKey.mode, colorKey.labelSlots);
    const color = hex ? hexToRgb(hex) : INK;
    const x = frame.x + indent;
    pdf.dot(x + 3, y + 4, 2.4, color);
    const page = (pageOf.get(unit.id) ?? 0) + offset;
    const label = pdf.fit(unit.text, frame.w - indent - 60, 10.5, indent === 0);
    pdf.text(label, x + 11, y + 8, { size: 10.5, bold: indent === 0, color: INK });
    pdf.text(String(page), frame.x + frame.w, y + 8, { size: 9.5, color: MUTED, align: 'right' });
    // A leader rule, so the eye gets from a short title to its page number.
    const from = x + 15 + pdf.widthOf(label, 10.5, indent === 0);
    pdf.line(from, y + 6, frame.x + frame.w - 18, y + 6, { color: FAINT, width: 0.6, dash: [1, 3] });
    y += ROW;
  }
  if (first) drawHeader(pdf, 'Contents', null, frame);
  drawFooter(pdf, stamp, `Page ${pdf.pageCount}`, frame, pageH);
}

export interface MindMapPdfResult {
  blob: Blob;
  pages: number;
  /** The page size in points, so the export sheet can say how big a
   *  fit-to-map sheet turned out before you commit to it. */
  pageW: number;
  pageH: number;
}

/** Everything the colour rules need, carried together so a branch printed on
 *  page 9 is the colour it is on screen and on page 1. */
interface ColorPalette {
  nodes: MindMapNode[];
  root: string;
  mode: MapColorMode;
  labelSlots: Map<string, number | null>;
}

export function buildMindMapPdf(map: MindMap, opts: MindMapPdfOptions): MindMapPdfResult {
  // Only ever the map's own timestamp — reading the clock here would make
  // building a PDF an impure render-time call for the export sheet's preview.
  const stamp = map.updatedAt
    ? new Date(map.updatedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '';

  const focusName = opts.rootId
    ? (map.nodes.find((n) => n.id === opts.rootId)?.text ?? null)
    : null;
  // Headers, the filename and the overview all read the title off the map,
  // so a focused export gets a map-shaped object carrying the branch's name.
  const doc: MindMap = focusName ? { ...map, title: focusName } : map;

  let nodes = opts.rootId ? sliceToSubtree(map.nodes, opts.rootId) : map.nodes;
  if (opts.lectureId) nodes = sliceToLecture(nodes, opts.lectureId);
  const root = nodes.find((n) => n.parentId === null);

  const fit = opts.paper === 'fit';
  // The map's own size decides the page. Measuring needs a builder only for
  // its font metrics, which do not depend on the page, so a throwaway one
  // breaks what would otherwise be a circular dependency.
  const fitLayout = fit
    ? layoutMap(nodes, {
        rowH: FIT_ROW_H,
        colW: FIT_COL_W,
        maxBoxW: FIT_BOX_W,
        heightOf: pdfHeightOf(new PdfBuilder(1, 1)),
      })
    : null;

  const margin = fit ? FIT_MARGIN : MARGIN;
  let pageW: number;
  let pageH: number;
  if (fitLayout) {
    pageW = Math.min(PDF_MAX, Math.max(360, fitLayout.width + margin * 2));
    pageH = Math.min(
      PDF_MAX,
      Math.max(360, fitLayout.height + margin * 2 + HEADER_H + FOOTER_H)
    );
  } else {
    const [pw, ph] = PAPER[opts.paper];
    pageW = opts.landscape ? ph : pw;
    pageH = opts.landscape ? pw : ph;
  }
  const frame: Frame = {
    x: margin,
    y: margin,
    w: pageW - margin * 2,
    h: pageH - margin * 2,
  };

  const render = (withContents: Map<string, number> | null, contentsOffset: number) => {
    const pdf = new PdfBuilder(pageW, pageH);
    if (!root) {
      drawHeader(pdf, doc.title, 'Empty map', frame);
      return { pdf, pageOf: new Map<string, number>(), units: [] as MindMapNode[] };
    }
    const startNewPage = () => pdf.addPage();
    const pageOf = new Map<string, number>();
    const palette: ColorPalette = {
      // Always the whole map and its real root, never the slice on the page:
      // a branch printed on its own should be the colour it is on screen, and
      // a label should mean the same colour in every export.
      nodes: map.nodes,
      root: map.nodes.find((n) => n.parentId === null)?.id ?? root.id,
      mode: map.colorBy ?? 'section',
      labelSlots: labelSlotsOf(map.nodes),
    };

    if (fit) {
      overviewPage(pdf, doc, nodes, root.id, frame, map.course ?? null, palette, {
        rowH: FIT_ROW_H,
        colW: FIT_COL_W,
        maxBoxW: FIT_BOX_W,
      });
      drawFooter(pdf, stamp, 'Whole map', frame, pageH);
      return { pdf, pageOf, units: [] as MindMapNode[] };
    }

    if (opts.layout === 'worksheet') {
      worksheetPages(pdf, doc, nodes, root.id, opts, frame, pageH, startNewPage, stamp);
      return { pdf, pageOf, units: [] as MindMapNode[] };
    }

    const units = opts.layout === 'roomy' ? pageUnits(nodes, opts.splitBy ?? 'section') : [];
    // A focused export names where the branch came from rather than
    // repeating the branch's own name back at it.
    const headline = focusName
      ? pathToRoot(map.nodes, opts.rootId!)
          .slice(0, -1)
          .map((n) => n.text)
          .join('  ›  ') || map.title
      : opts.lectureId
        ? (opts.lectureId ?? map.course ?? null)
        : (map.course ?? null);

    overviewPage(pdf, doc, nodes, root.id, frame, headline, palette);
    drawFooter(pdf, stamp, units.length ? 'Overview' : 'Page 1', frame, pageH);

    if (withContents && units.length >= 2) {
      startNewPage();
      contentsPages(pdf, units, nodes, root.id, palette, withContents, contentsOffset, frame, pageH, startNewPage, stamp);
    }

    for (const unit of units) {
      startNewPage();
      const render = (opts.nodeStyle ?? 'outline') === 'map' ? branchPages : unitOutlinePages;
      render(
        pdf, doc, nodes, unit, opts, frame, pageH, startNewPage, stamp,
        palette, headline, (page) => pageOf.set(unit.id, page)
      );
    }
    return { pdf, pageOf, units };
  };

  // Pass one learns where each unit lands; pass two can then print a
  // contents page whose numbers are right, shifted by however many pages
  // the contents itself takes.
  const first = render(null, 0);
  if (opts.layout !== 'roomy' || first.units.length < 2) {
    return { blob: first.pdf.blob(), pages: first.pdf.pageCount, pageW, pageH };
  }
  const contentsRows = Math.floor((frame.h - HEADER_H - FOOTER_H - 18) / 22);
  const contentsCount = Math.max(1, Math.ceil(first.units.length / Math.max(contentsRows, 1)));
  const second = render(first.pageOf, contentsCount);
  return { blob: second.pdf.blob(), pages: second.pdf.pageCount, pageW, pageH };
}

/** A filename that sorts and reads well in Files and GoodNotes. A sliced
 *  export says which lecture it is, or two prints of the same course tree
 *  overwrite each other in the notes app. */
export function pdfFileName(map: MindMap, slice?: string): string {
  const clean = (t: string) => t.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
  const base = clean(map.title).slice(0, 50) || 'mind-map';
  const tail = slice ? clean(slice).slice(0, 40) : '';
  return tail ? `${base}--${tail}.pdf` : `${base}.pdf`;
}
