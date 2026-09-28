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

/** Node box width, grown a little for longer text so the label has room
 *  without wrapping into an unpredictable height. */
function boxWidth(text: string, depth: number): number {
  const base = depth === 0 ? 150 : 120;
  const grown = Math.min(190, base + Math.max(0, text.length - 14) * 5);
  return grown;
}

export function layoutMap(nodes: MindMapNode[]): MapLayout {
  const root = nodes.find((n) => n.parentId === null);
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
    const collapsed = !!node.collapsed && kids.length > 0;
    const visibleKids = collapsed ? [] : kids;

    let y: number;
    if (visibleKids.length === 0) {
      y = cursorY;
      cursorY += ROW_H;
    } else {
      const placed = visibleKids.map((k) => place(k, depth + 1));
      y = (placed[0].y + placed[placed.length - 1].y) / 2;
    }

    const w = boxWidth(node.text, depth);
    const laid: LaidOutNode = {
      node,
      depth,
      x: depth * COL_W,
      y,
      w,
      h: 28,
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
