// Dragging a node to a new place in the tree.
//
// Two things make this harder than a list reorder, and both shape the design.
//
// The canvas scrolls in BOTH directions, so on touch an immediate drag is
// indistinguishable from a pan. A long press is the disambiguator: hold, then
// move. A mouse has no such conflict — there is a separate scrollbar and no
// ambiguity — so it drags after a few pixels of travel with no wait, because
// making a desktop user hold still for 350ms would be gratuitous.
//
// And a drop has three meanings, not one. Dropping ON something should be
// able to mean "become its child" or "go above it" or "go below it", which is
// what actually lets one gesture both reparent and reorder. The vertical
// third of the box you release over decides, which is the model outliners
// have converged on and costs one hit test rather than a second set of
// invisible gap targets between every pair of rows.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DropPosition } from '../types';

/** How long a touch must be held before it becomes a drag rather than a pan. */
const HOLD_MS = 320;
/** Movement past this before the hold fires means the user is scrolling. */
const HOLD_SLOP = 10;
/** Mouse travel before a press becomes a drag, so a click stays a click. */
const MOUSE_SLOP = 5;
/** Distance from the canvas edge at which it starts scrolling itself. */
const EDGE = 48;
const EDGE_SPEED = 14;

export interface DropHint {
  id: string;
  position: DropPosition;
}

export interface NodeDrag {
  dragId: string | null;
  drop: DropHint | null;
  /** Attach to each node. `onPointerDown(e, nodeId)`. */
  start: (e: React.PointerEvent, nodeId: string) => void;
}

export function useNodeDrag({
  scrollRef,
  canDrop,
  onDrop,
  enabled = true,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Cycle and root rules live with the data, not here. */
  canDrop: (dragId: string, targetId: string, position: DropPosition) => boolean;
  onDrop: (dragId: string, targetId: string, position: DropPosition) => void;
  enabled?: boolean;
}): NodeDrag {
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropHint | null>(null);

  // Everything the move/up handlers need, off the render path — a ref rather
  // than state so a pointermove never costs a re-render it does not need.
  const live = useRef<{
    id: string | null;
    armed: boolean;
    startX: number;
    startY: number;
    timer: ReturnType<typeof setTimeout> | null;
    touch: boolean;
    edge: number | null;
  }>({ id: null, armed: false, startX: 0, startY: 0, timer: null, touch: false, edge: null });

  const latest = useRef({ canDrop, onDrop });
  useEffect(() => {
    latest.current = { canDrop, onDrop };
  }, [canDrop, onDrop]);

  const stopEdgeScroll = useCallback(() => {
    if (live.current.edge !== null) {
      cancelAnimationFrame(live.current.edge);
      live.current.edge = null;
    }
  }, []);

  const reset = useCallback(() => {
    if (live.current.timer) clearTimeout(live.current.timer);
    live.current = {
      id: null, armed: false, startX: 0, startY: 0, timer: null, touch: false, edge: live.current.edge,
    };
    stopEdgeScroll();
    setDragId(null);
    setDrop(null);
  }, [stopEdgeScroll]);

  /** Pointer position → the node under it, and which third of it.
   *
   *  Deliberately measured off the DOM rather than computed from the layout.
   *  A node's laid-out height is an ESTIMATE of how its label will wrap, and
   *  the browser's real box is often taller — so hit testing against the
   *  layout left the bottom of every wrapped node untestable, which is
   *  exactly the strip that means "drop below this". */
  const hitTest = useCallback((clientX: number, clientY: number): DropHint | null => {
    const el = document.elementFromPoint(clientX, clientY);
    const node = el?.closest?.('[data-node-id]') as HTMLElement | null;
    const id = node?.dataset.nodeId;
    if (!node || !id) return null;
    const rect = node.getBoundingClientRect();
    if (rect.height <= 0) return null;
    const frac = (clientY - rect.top) / rect.height;
    const position: DropPosition = frac < 0.3 ? 'before' : frac > 0.7 ? 'after' : 'child';
    return { id, position };
  }, []);

  /** Pan the canvas when the pointer is held near an edge, so a node can be
   *  dragged somewhere that is not currently on screen. */
  const edgeScroll = useCallback(
    (clientX: number, clientY: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let dx = 0;
      let dy = 0;
      if (clientX - rect.left < EDGE) dx = -EDGE_SPEED;
      else if (rect.right - clientX < EDGE) dx = EDGE_SPEED;
      if (clientY - rect.top < EDGE) dy = -EDGE_SPEED;
      else if (rect.bottom - clientY < EDGE) dy = EDGE_SPEED;

      stopEdgeScroll();
      if (dx === 0 && dy === 0) return;
      const step = () => {
        el.scrollBy(dx, dy);
        live.current.edge = requestAnimationFrame(step);
      };
      live.current.edge = requestAnimationFrame(step);
    },
    [scrollRef, stopEdgeScroll]
  );

  const start = useCallback(
    (e: React.PointerEvent, nodeId: string) => {
      if (!enabled || e.button !== 0) return;
      const touch = e.pointerType !== 'mouse';
      live.current.id = nodeId;
      live.current.armed = false;
      live.current.startX = e.clientX;
      live.current.startY = e.clientY;
      live.current.touch = touch;
      if (live.current.timer) clearTimeout(live.current.timer);

      const target = e.currentTarget as HTMLElement;
      if (touch) {
        live.current.timer = setTimeout(() => {
          if (live.current.id !== nodeId) return;
          live.current.armed = true;
          setDragId(nodeId);
          // Capture only once the drag is real, so a tap that turns into a
          // scroll is never stolen from the scroll container.
          try {
            target.setPointerCapture(e.pointerId);
          } catch {
            // Capture is best-effort; the window listeners still see the move.
          }
          if (navigator.vibrate) navigator.vibrate(8);
        }, HOLD_MS);
      }
    },
    [enabled]
  );

  useEffect(() => {
    if (!enabled) return;

    const onMove = (e: PointerEvent) => {
      const st = live.current;
      if (!st.id) return;
      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;

      if (!st.armed) {
        const dist = Math.hypot(dx, dy);
        if (st.touch) {
          // Moved before the hold fired: this is a pan, not a drag.
          if (dist > HOLD_SLOP) {
            if (st.timer) clearTimeout(st.timer);
            st.id = null;
          }
          return;
        }
        if (dist < MOUSE_SLOP) return;
        st.armed = true;
        setDragId(st.id);
      }

      e.preventDefault();
      setDrop(hitTest(e.clientX, e.clientY));
      edgeScroll(e.clientX, e.clientY);
    };

    const onUp = (e: PointerEvent) => {
      const st = live.current;
      const id = st.id;
      const armed = st.armed;
      if (!id || !armed) {
        reset();
        return;
      }
      const hit = hitTest(e.clientX, e.clientY);
      reset();
      if (!hit || hit.id === id) return;
      const { canDrop: allowed, onDrop: commit } = latest.current;
      if (!allowed(id, hit.id, hit.position)) return;
      commit(id, hit.id, hit.position);
    };

    const onCancel = () => reset();

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [enabled, hitTest, edgeScroll, reset]);

  useEffect(() => stopEdgeScroll, [stopEdgeScroll]);

  return { dragId, drop, start };
}
