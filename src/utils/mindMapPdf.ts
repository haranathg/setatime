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

import { layoutMap, branchColorOf, BRANCH_COLORS } from './mindMapLayout';
import type { MapLayout } from './mindMapLayout';
import { PdfBuilder } from './pdf';
import type { RGB } from './pdf';
import type { MindMap, MindMapNode } from '../types';

export type PdfLayoutKind = 'overview' | 'roomy' | 'worksheet';
export type PdfGuides = 'ruled' | 'dots' | 'blank';
export type PdfPaper = 'letter' | 'a4' | 'ipad';

export interface MindMapPdfOptions {
  layout: PdfLayoutKind;
  paper: PdfPaper;
  landscape: boolean;
  guides: PdfGuides;
}

export const DEFAULT_PDF_OPTIONS: MindMapPdfOptions = {
  layout: 'roomy',
  paper: 'letter',
  landscape: false,
  guides: 'ruled',
};

/** Points, at 72/inch. The iPad size is 4:3 so it fills the screen in a
 *  notes app without letterboxing; it keeps Letter's width so the same file
 *  still prints sensibly. */
const PAPER: Record<PdfPaper, [number, number]> = {
  letter: [612, 792],
  a4: [595, 842],
  ipad: [612, 816],
};

export const PAPER_LABELS: Record<PdfPaper, string> = {
  letter: 'Letter',
  a4: 'A4',
  ipad: 'iPad 4:3',
};

const MARGIN = 42;
const HEADER_H = 30;
const FOOTER_H = 22;
const RULE_GAP = 26;      // handwriting line spacing
const PRINT_ROW_H = 84;   // one lane per leaf, tall enough for ~3 lines
const PRINT_COL_W = 208;  // wider than the widest node box, so columns never overlap
const MAX_LANE_H = 240;   // ~9 ruled lines; past this a lane is just empty paper

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
     *  palette and the colours stop meaning anything across the document. */
    colorRoot: string;
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
  const px = (x: number) => frame.x + (x - originX) * scale;
  const py = (y: number) => frame.y + (y - originY) * scale;

  for (const { from, to } of layout.edges) {
    if (!visible.has(from.node.id) || !visible.has(to.node.id)) continue;
    const x1 = px(from.x + from.w);
    const y1 = py(from.y + from.h / 2);
    const x2 = px(to.x);
    const y2 = py(to.y + to.h / 2);
    const mid = (x1 + x2) / 2;
    const color = hexToRgb(branchColorOf(to.node.id, nodes, colorRoot) ?? '#94a3b8');
    pdf.curve(x1, y1, mid, y1, mid, y2, x2, y2, { color: tint(color, 0.45), width: 1.1 });
  }

  for (const l of layout.nodes) {
    if (!visible.has(l.node.id)) continue;
    const hex = branchColorOf(l.node.id, nodes, colorRoot);
    const color = hex ? hexToRgb(hex) : INK;
    const x = px(l.x);
    const y = py(l.y);
    const w = l.w * scale;
    const h = l.h * scale;
    const size = Math.max(6.5, Math.min(10, 9.2 * scale));
    const isRoot = l.node.id === anchorId;

    if (isRoot) {
      pdf.rect(x, y, w, h, { fill: tint(INK, 0.9), color: MUTED, width: 0.8, radius: 5 * scale });
    } else {
      pdf.rect(x, y, w, h, { fill: tint(color, 0.9), color: tint(color, 0.35), width: 0.9, radius: 5 * scale });
    }
    pdf.text(pdf.fit(l.node.text, w - 10 * scale, size, isRoot), x + 5 * scale, y + h / 2 + size * 0.36, {
      size,
      bold: isRoot,
      color: isRoot ? INK : color,
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
  rootId: string,
  frame: Frame,
  headline: string | null
): void {
  const layout = layoutMap(map.nodes);
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
  drawTree(pdf, layout, map.nodes, {
    colorRoot: rootId,
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
  rootId: string,
  branch: MindMapNode,
  branchIndex: number,
  opts: MindMapPdfOptions,
  frame: Frame,
  pageH: number,
  startNewPage: () => void,
  stamp: string
): void {
  const color = hexToRgb(BRANCH_COLORS[branchIndex % BRANCH_COLORS.length]);
  const bodyTop = frame.y + HEADER_H + 14;
  const bodyH = frame.h - HEADER_H - FOOTER_H - 14;

  const hasKids = map.nodes.some((n) => n.parentId === branch.id) && !branch.collapsed;
  // Hiding the anchor shifts every remaining node one column to the left.
  const originX = hasKids ? PRINT_COL_W : 0;

  const isLeaf = (n: { childIds: string[]; hiddenChildren: number }) =>
    n.childIds.length === 0 || n.hiddenChildren > 0;

  // First pass sizes the tree; the second lays it out at the lane height that
  // actually fills the page, so a branch with three children gets three tall
  // lanes rather than three short ones and a lot of blank paper.
  const probe = layoutMap(map.nodes, {
    rowH: PRINT_ROW_H,
    colW: PRINT_COL_W,
    rootId: branch.id,
  });
  const treeW = Math.max(probe.width - originX, 1);
  const treeMaxW = frame.w * 0.52;
  const scale = Math.min(treeMaxW / treeW, 1);

  const leafCount = Math.max(probe.nodes.filter(isLeaf).length, 1);
  const laneH = Math.min(Math.max(bodyH / leafCount, PRINT_ROW_H * scale), MAX_LANE_H);

  const layout = layoutMap(map.nodes, {
    rowH: laneH / scale,
    colW: PRINT_COL_W,
    rootId: branch.id,
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

    drawTree(pdf, layout, map.nodes, {
      colorRoot: rootId,
      anchorId: hasKids ? null : branch.id,
      frame: { x: frame.x, y: bodyTop, w: treeW * scale, h: bodyH },
      scale,
      originX,
      originY,
      visible,
    });

    drawHeader(pdf, branch.text, part === 0 ? map.title : `${map.title} — continued`, frame);
    drawFooter(pdf, stamp, `Page ${pdf.pageCount}`, frame, pageH);
    part++;
  }
}

/** No picture: every node as a heading over a block of ruled space. */
function worksheetPages(
  pdf: PdfBuilder,
  map: MindMap,
  rootId: string,
  opts: MindMapPdfOptions,
  frame: Frame,
  pageH: number,
  startNewPage: () => void,
  stamp: string
): void {
  const childrenOf = new Map<string, MindMapNode[]>();
  for (const n of map.nodes) {
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
      const hex = branchColorOf(kid.id, map.nodes, rootId);
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
}

export function buildMindMapPdf(map: MindMap, opts: MindMapPdfOptions): MindMapPdfResult {
  const [pw, ph] = PAPER[opts.paper];
  const pageW = opts.landscape ? ph : pw;
  const pageH = opts.landscape ? pw : ph;
  const pdf = new PdfBuilder(pageW, pageH);
  const frame: Frame = {
    x: MARGIN,
    y: MARGIN,
    w: pageW - MARGIN * 2,
    h: pageH - MARGIN * 2,
  };
  // Only ever the map's own timestamp — reading the clock here would make
  // building a PDF an impure render-time call for the export sheet's preview.
  const stamp = map.updatedAt
    ? new Date(map.updatedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '';

  const root = map.nodes.find((n) => n.parentId === null);
  if (!root) {
    drawHeader(pdf, map.title, 'Empty map', frame);
    return { blob: pdf.blob(), pages: pdf.pageCount };
  }
  const branches = map.nodes.filter((n) => n.parentId === root.id);
  const startNewPage = () => pdf.addPage();

  if (opts.layout === 'worksheet') {
    worksheetPages(pdf, map, root.id, opts, frame, pageH, startNewPage, stamp);
    return { blob: pdf.blob(), pages: pdf.pageCount };
  }

  overviewPage(pdf, map, root.id, frame, map.course ?? null);
  drawFooter(pdf, stamp, branches.length ? 'Overview' : 'Page 1', frame, pageH);

  if (opts.layout === 'roomy') {
    branches.forEach((branch, i) => {
      startNewPage();
      branchPages(pdf, map, root.id, branch, i, opts, frame, pageH, startNewPage, stamp);
    });
  }
  return { blob: pdf.blob(), pages: pdf.pageCount };
}

/** A filename that sorts and reads well in Files and GoodNotes. */
export function pdfFileName(map: MindMap): string {
  const safe = map.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60);
  return `${safe || 'mind-map'}.pdf`;
}
