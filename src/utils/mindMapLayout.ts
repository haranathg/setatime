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
}

/** Node box width, grown a little for longer text so the label has room
 *  without wrapping into an unpredictable height. */
function boxWidth(text: string, depth: number): number {
  const base = depth === 0 ? 150 : 120;
  const grown = Math.min(190, base + Math.max(0, text.length - 14) * 5);
  return grown;
}

export function layoutMap(nodes: MindMapNode[], opts: LayoutOptions = {}): MapLayout {
  const rowH = opts.rowH ?? ROW_H;
  const colW = opts.colW ?? COL_W;
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
      cursorY += rowH;
    } else {
      const placed = visibleKids.map((k) => place(k, depth + 1));
      y = (placed[0].y + placed[placed.length - 1].y) / 2;
    }

    const w = boxWidth(node.text, depth);
    const laid: LaidOutNode = {
      node,
      depth,
      x: depth * colW,
      y,
      w,
      // A section carries a label line above its text, so it needs the room
      // — otherwise its connector meets the box a third of the way down.
      h: node.section && depth > 0 ? 40 : 28,
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
export function pageUnits(nodes: MindMapNode[]): MindMapNode[] {
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
  // Document order, so the PDF reads in the order the tree does.
  const order = new Map(nodes.map((n, i) => [n.id, i]));
  return units.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
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
