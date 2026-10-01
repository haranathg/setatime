// Tidy-tree layout for mind maps.
//
// The whole point of the surface is that you never place anything, so the
// layout has to be deterministic and stable: the same tree must always
// produce the same picture, and adding a leaf must not reshuffle branches
// you were not touching.
//
// Classic tidy tree: depth sets x, and a node sits at the vertical centre of
// the block its descendants occupy. Leaves are stacked a fixed distance
// apart, so the drawing grows downward predictably rather than overlapping.

import type { MindMapNode } from '../types';

export interface LaidOutNode {
  node: MindMapNode;
  depth: number;
  x: number;
  y: number;
  w: number;
  h: number;
  childIds: string[];
  hiddenChildren: number; // >0 when collapsed, so the UI can say how many
}

export interface MapLayout {
  nodes: LaidOutNode[];
  byId: Map<string, LaidOutNode>;
  edges: { from: LaidOutNode; to: LaidOutNode }[];
  width: number;
  height: number;
}

export const ROW_H = 38;          // vertical pitch between leaves
export const COL_W = 210;         // horizontal pitch between depths
const PAD = 24;

/** The screen canvas and the print sheet want the same tidy tree at very
 *  different pitches — on paper each node needs a band of blank space beside
 *  it, which on screen would just be scrolling. Same algorithm, different
 *  numbers, rather than a second layout that can drift from this one. */
export interface LayoutOptions {
  rowH?: number;
  colW?: number;
  /** Lay out the subtree under this node instead of the whole map, used to
   *  give each top-level branch its own printed page, and to let the canvas
   *  focus on one node as a temporary root. */
  rootId?: string;
  /** Treat these as collapsed whatever the node says. The PDF uses it to
   *  stop a section's page at the next nested section, so a node appears on
   *  exactly one page instead of being drawn twice. */
  forceCollapsed?: Set<string>;
  /** Treat these as expanded whatever the node says. Search uses it to open
   *  the path to a match without writing collapsed:false all over the tree
   *  and leaving it that way once the search is cleared. */
  forceExpanded?: Set<string>;
  /** How tall a node's box is once its label has wrapped. The default
   *  estimates from character count, which is all the canvas needs; the PDF
   *  passes a version backed by real Helvetica metrics so the printed box
   *  is never a line short. */
  heightOf?: (node: MindMapNode, depth: number, w: number) => number;
  /** Widest a node box may grow. The screen caps this tightly because the
   *  canvas scrolls and a wide box pushes its siblings off-screen; a page
   *  sized to the map has no such constraint and can let a long label
   *  breathe sideways instead of wrapping four times. */
  maxBoxW?: number;
}

/** Labels wrap rather than truncate, but not without limit — one runaway
 *  node should not be allowed to push a whole branch down the page. */
export const MAX_NODE_LINES = 3;
const LINE_H = 16.5;
const BOX_PAD_Y = 12;
const SECTION_LABEL_H = 12;

/** Lines a label needs, estimated from character count. Deliberately rough:
 *  the canvas lets the box grow to fit its own text anyway, so this only has
 *  to be close enough that the tidy tree reserves the right amount of room
 *  and connectors meet boxes where they actually are. */
export function estimateLines(text: string, boxW: number, fontPx = 12): number {
  const avgChar = fontPx * 0.52;
  const perLine = Math.max(6, Math.floor((boxW - 16) / avgChar));
  return Math.min(MAX_NODE_LINES, Math.max(1, Math.ceil((text.length || 1) / perLine)));
}

/** What a node is tagged with. A hand-typed label wins over the lecture
 *  title a map inherited, so relabelling something never has to mean
 *  untangling it from the lecture it arrived with. */
export function tagOf(node: MindMapNode): string | undefined {
  return node.label || node.lectureTitle || undefined;
}

/** The small line above a section's label. A section whose text already IS
 *  its lecture title needs no tag repeating it back — the coloured border
 *  says it is a section on its own. */
export function sectionLabelOf(node: MindMapNode, depth: number): string | null {
  if (!node.section || depth === 0) return null;
  const tag = tagOf(node);
  return tag && tag !== node.text ? tag : null;
}

export function defaultHeightOf(node: MindMapNode, depth: number, w: number): number {
  const lines = estimateLines(node.text, w);
  const label = sectionLabelOf(node, depth) ? SECTION_LABEL_H : 0;
  return Math.round(BOX_PAD_Y + lines * LINE_H + label);
}

/** Node box width, grown a little for longer text so the label has room
 *  without wrapping into an unpredictable height. */
function boxWidth(text: string, depth: number, maxW = 190): number {
  const base = depth === 0 ? 150 : 120;
  return Math.min(maxW, base + Math.max(0, text.length - 14) * 5);
}

export function layoutMap(nodes: MindMapNode[], opts: LayoutOptions = {}): MapLayout {
  const rowH = opts.rowH ?? ROW_H;
  const colW = opts.colW ?? COL_W;
  const measure = opts.heightOf ?? defaultHeightOf;
  const root = opts.rootId
    ? nodes.find((n) => n.id === opts.rootId)
    : nodes.find((n) => n.parentId === null);
  if (!root) {
    return { nodes: [], byId: new Map(), edges: [], width: 0, height: 0 };
  }

  // Children in insertion order — the order the user typed them.
  const childrenOf = new Map<string, MindMapNode[]>();
  for (const n of nodes) {
    if (n.parentId === null) continue;
    const arr = childrenOf.get(n.parentId);
    if (arr) arr.push(n);
    else childrenOf.set(n.parentId, [n]);
  }

  const out: LaidOutNode[] = [];
  const byId = new Map<string, LaidOutNode>();
  let cursorY = 0;

  // Post-order walk: place the subtree, then centre the parent on it.
  const place = (node: MindMapNode, depth: number): LaidOutNode => {
    const w = boxWidth(node.text, depth, opts.maxBoxW);
    const h = measure(node, depth, w);
    const kids = childrenOf.get(node.id) ?? [];
    const forced = opts.forceCollapsed?.has(node.id)
      ? true
      : opts.forceExpanded?.has(node.id)
        ? false
        : !!node.collapsed;
    const collapsed = forced && kids.length > 0;
    const visibleKids = collapsed ? [] : kids;

    let y: number;
    if (visibleKids.length === 0) {
      y = cursorY;
      // Whichever is larger: the pitch, or what this node's own box needs.
      // A wrapped three-line label used to be drawn over its neighbour.
      cursorY += Math.max(rowH, h + 10);
    } else {
      const placed = visibleKids.map((k) => place(k, depth + 1));
      y = (placed[0].y + placed[placed.length - 1].y) / 2;
    }

    const laid: LaidOutNode = {
      node,
      depth,
      x: depth * colW,
      y,
      w,
      h,
      childIds: kids.map((k) => k.id),
      hiddenChildren: collapsed ? kids.length : 0,
    };
    out.push(laid);
    byId.set(node.id, laid);
    return laid;
  };

  place(root, 0);

  const edges: MapLayout['edges'] = [];
  for (const laid of out) {
    if (laid.hiddenChildren > 0) continue;
    for (const cid of laid.childIds) {
      const child = byId.get(cid);
      if (child) edges.push({ from: laid, to: child });
    }
  }

  const maxX = out.reduce((m, n) => Math.max(m, n.x + n.w), 0);
  const maxY = out.reduce((m, n) => Math.max(m, n.y + n.h), 0);
  return { nodes: out, byId, edges, width: maxX + PAD * 2, height: maxY + PAD * 2 };
}

/** Branch colour, assigned by which top-level child a node descends from.
 *  Colour carries the branch, which is the only grouping a mind map has. */
export const BRANCH_COLORS = [
  '#4f46e5', // indigo
  '#0d9488', // teal
  '#b45309', // amber
  '#be123c', // rose
  '#7c3aed', // violet
  '#0369a1', // sky
];

export function branchColorOf(
  nodeId: string,
  nodes: MindMapNode[],
  rootId: string
): string | null {
  const parentOf = new Map(nodes.map((n) => [n.id, n.parentId]));
  const topLevel = nodes.filter((n) => n.parentId === rootId).map((n) => n.id);
  let cur: string | null = nodeId;
  while (cur && cur !== rootId) {
    const i = topLevel.indexOf(cur);
    if (i !== -1) return BRANCH_COLORS[i % BRANCH_COLORS.length];
    cur = parentOf.get(cur) ?? null;
  }
  return null;
}

/** The map as a markdown outline — the format that pastes usefully into
 *  notes, and the cheapest possible export. */
export function toOutline(nodes: MindMapNode[]): string {
  const root = nodes.find((n) => n.parentId === null);
  if (!root) return '';
  const childrenOf = new Map<string, MindMapNode[]>();
  for (const n of nodes) {
    if (n.parentId === null) continue;
    const arr = childrenOf.get(n.parentId);
    if (arr) arr.push(n);
    else childrenOf.set(n.parentId, [n]);
  }
  const lines: string[] = [`# ${root.text}`];
  const walk = (id: string, depth: number) => {
    for (const k of childrenOf.get(id) ?? []) {
      lines.push(`${'  '.repeat(depth)}- ${k.text}${k.note ? ` — ${k.note}` : ''}`);
      walk(k.id, depth + 1);
    }
  };
  walk(root.id, 0);
  return lines.join('\n');
}

/** Every descendant of `id`, inclusive. The one graph walk that half a dozen
 *  operations need — reparenting, deleting, tagging, section boundaries —
 *  written once rather than inlined at each call site. */
export function subtreeIds(nodes: MindMapNode[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) {
      if (n.parentId && out.has(n.parentId) && !out.has(n.id)) {
        out.add(n.id);
        grew = true;
      }
    }
  }
  return out;
}

/** Depth of every node, root at 0. */
export function depthsOf(nodes: MindMapNode[]): Map<string, number> {
  const parentOf = new Map(nodes.map((n) => [n.id, n.parentId]));
  const depths = new Map<string, number>();
  const depthOf = (id: string): number => {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    const parent = parentOf.get(id) ?? null;
    const d = parent === null ? 0 : depthOf(parent) + 1;
    depths.set(id, d);
    return d;
  };
  for (const n of nodes) depthOf(n.id);
  return depths;
}

/** The chain from the root down to `id`, inclusive — the focus breadcrumb. */
export function pathToRoot(nodes: MindMapNode[], id: string): MindMapNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const chain: MindMapNode[] = [];
  let cur: string | null = id;
  while (cur) {
    const node = byId.get(cur);
    if (!node) break;
    chain.unshift(node);
    cur = node.parentId;
  }
  return chain;
}

/** The units a printed map breaks into.
 *
 *  Sections when the map has any, because once a tree holds a whole course
 *  "one page per top-level branch" means four enormous pages. A section's
 *  page stops at the next nested section, which gets its own — so nothing is
 *  drawn twice. Top-level branches containing no section anywhere still need
 *  a page, or their content would exist only on the overview.
 *
 *  Falls back to top-level branches when nothing is marked, which is what
 *  every map made before sections existed will hit. */
export type SplitMode = 'section' | 'branch' | 'label';

export function pageUnits(nodes: MindMapNode[], mode: SplitMode = 'section'): MindMapNode[] {
  const root = nodes.find((n) => n.parentId === null);
  if (!root) return [];
  const order = new Map(nodes.map((n, i) => [n.id, i]));
  const byOrder = (a: MindMapNode, b: MindMapNode) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  const hasChildren = (n: MindMapNode) => nodes.some((k) => k.parentId === n.id);

  /** A page of note lanes is only worth printing for something that has
   *  leaves to lane. A childless node would get a page holding one lane, so
   *  it stays on the overview instead — unless it was explicitly marked a
   *  section, which is an instruction rather than a guess. Focusing on a
   *  branch used to hit this hard: the branch became the root, no sections
   *  remained inside it, and the fallback handed every leaf its own page. */
  const worthAPage = (units: MindMapNode[]): MindMapNode[] => {
    const kept = units.filter((u) => u.section || hasChildren(u));
    if (kept.length > 0) return kept.sort(byOrder);
    return hasChildren(root) ? [root] : [];
  };

  if (mode === 'branch') {
    return worthAPage(nodes.filter((n) => n.parentId === root.id));
  }

  if (mode === 'label') {
    // The head of each label's run: a tagged node whose parent does not
    // carry the same tag. Usually one per label, but material that landed
    // in two places gets a page for each rather than being silently
    // reduced to one.
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const heads = nodes.filter((n) => {
      const tag = tagOf(n);
      if (!tag) return false;
      const parent = n.parentId ? byId.get(n.parentId) : null;
      return !parent || tagOf(parent) !== tag;
    });
    return worthAPage(heads);
  }

  return worthAPage(sectionUnits(nodes));
}

function sectionUnits(nodes: MindMapNode[]): MindMapNode[] {
  const root = nodes.find((n) => n.parentId === null);
  if (!root) return [];
  const topLevel = nodes.filter((n) => n.parentId === root.id);
  const sections = nodes.filter((n) => n.section && n.id !== root.id);
  if (sections.length === 0) return topLevel;

  const sectionIds = new Set(sections.map((n) => n.id));
  const units = [...sections];
  for (const branch of topLevel) {
    if (sectionIds.has(branch.id)) continue;
    const sub = subtreeIds(nodes, branch.id);
    let holdsSection = false;
    for (const id of sub) {
      if (sectionIds.has(id)) {
        holdsSection = true;
        break;
      }
    }
    if (!holdsSection) units.push(branch);
  }
  return units;
}

/** Sections nested strictly inside `unitId` — where its printed page stops. */
export function nestedSections(nodes: MindMapNode[], unitId: string): Set<string> {
  const sub = subtreeIds(nodes, unitId);
  const out = new Set<string>();
  for (const n of nodes) {
    if (n.id !== unitId && n.section && sub.has(n.id)) out.add(n.id);
  }
  return out;
}
