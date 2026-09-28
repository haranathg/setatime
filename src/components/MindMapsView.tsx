import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { MindMap, MindMapNode } from '../types';
import { layoutMap, branchColorOf, toOutline } from '../utils/mindMapLayout';

// Mind maps for breaking a lecture down.
//
// Modelled on MindMup rather than Lucidchart: you never position anything.
// Tab makes a child, Enter makes a sibling, and the layout recomputes. That
// constraint is the feature — a map has to be takeable in the ten minutes
// after a lecture while the shape is still in your head, and dragging boxes
// is how that turns into an afternoon.

export default function MindMapsView({
  maps,
  onCreate,
  onDelete,
  onAddNode,
  onUpdateNode,
  onDeleteNode,
  onReparent,
  initialMapId,
  onConsumedInitialMap,
}: {
  maps: MindMap[];
  onCreate: (title: string) => MindMap;
  onDelete: (id: string) => void;
  onAddNode: (mapId: string, parentId: string, text?: string, afterSiblingId?: string) => string;
  onUpdateNode: (mapId: string, nodeId: string, patch: Partial<Omit<MindMapNode, 'id' | 'parentId'>>) => void;
  onDeleteNode: (mapId: string, nodeId: string) => void;
  onReparent: (mapId: string, nodeId: string, newParentId: string) => void;
  /** Set when a lecture row started a map — opens straight into it. */
  initialMapId?: string | null;
  onConsumedInitialMap?: () => void;
}) {
  // A map handed over by a lecture row is where this view opens, so it is
  // initial state rather than an effect that re-renders to get there. The
  // view only mounts on navigating to Maps, which is exactly when the
  // hand-off happens.
  const [openId, setOpenId] = useState<string | null>(() => initialMapId ?? null);
  const [newTitle, setNewTitle] = useState('');

  // Tell the parent it can forget the hand-off, so coming back to Maps later
  // lands on the list instead of re-opening this map.
  useEffect(() => {
    if (initialMapId) onConsumedInitialMap?.();
    // Mount only: the value is consumed once, by construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = maps.find((m) => m.id === openId) ?? null;

  if (open) {
    return (
      <MapEditor
        map={open}
        onBack={() => setOpenId(null)}
        onAddNode={onAddNode}
        onUpdateNode={onUpdateNode}
        onDeleteNode={onDeleteNode}
        onReparent={onReparent}
        onDelete={() => {
          if (confirm(`Delete "${open.title}"? This cannot be undone.`)) {
            onDelete(open.id);
            setOpenId(null);
          }
        }}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        <header>
          <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Maps
          </h2>
          <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
            Break a lecture into its shape. Tab adds a branch, Enter adds a sibling —
            you never place anything.
          </p>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = newTitle.trim();
            if (!t) return;
            const m = onCreate(t);
            setNewTitle('');
            setOpenId(m.id);
          }}
          className="flex items-center gap-2"
        >
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="What are you breaking down?"
            className="flex-1 min-w-0 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            type="submit"
            disabled={!newTitle.trim()}
            className="px-3 py-2 text-sm font-semibold rounded-xl transition-colors bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 dark:disabled:bg-gray-800 dark:disabled:text-gray-600"
          >
            New map
          </button>
        </form>

        {maps.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl px-4 py-8 text-center">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">No maps yet</p>
            <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-1.5 max-w-sm mx-auto leading-snug">
              Name a lecture above, or start one from any row on the Lectures page with
              “Map it”.
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {maps.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => setOpenId(m.id)}
                  className="w-full text-left bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-indigo-300 dark:hover:border-indigo-700 rounded-xl px-3 py-2.5 transition-colors"
                >
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">
                    {m.title}
                  </div>
                  <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                    {m.nodes.length - 1} branch{m.nodes.length - 1 === 1 ? '' : 'es'}
                    {m.course ? ` · ${m.course}` : ''} · edited{' '}
                    {new Date(m.updatedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------- The editor ----------

function MapEditor({
  map,
  onBack,
  onAddNode,
  onUpdateNode,
  onDeleteNode,
  onReparent,
  onDelete,
}: {
  map: MindMap;
  onBack: () => void;
  onAddNode: (mapId: string, parentId: string, text?: string, afterSiblingId?: string) => string;
  onUpdateNode: (mapId: string, nodeId: string, patch: Partial<Omit<MindMapNode, 'id' | 'parentId'>>) => void;
  onDeleteNode: (mapId: string, nodeId: string) => void;
  onReparent: (mapId: string, nodeId: string, newParentId: string) => void;
  onDelete: () => void;
}) {
  const rootId = map.nodes.find((n) => n.parentId === null)?.id ?? '';
  const [selectedRaw, setSelected] = useState<string>(rootId);
  // Derive rather than correct-after-the-fact: deleting a node used to leave
  // a dangling selection that an effect then fixed on a second render.
  const selected = map.nodes.some((n) => n.id === selectedRaw) ? selectedRaw : rootId;
  const [editing, setEditing] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => layoutMap(map.nodes), [map.nodes]);
  const parentOf = useMemo(
    () => new Map(map.nodes.map((n) => [n.id, n.parentId])),
    [map.nodes]
  );

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.select();
  }, [editing]);

  const addChild = useCallback(
    (parentId: string) => {
      const id = onAddNode(map.id, parentId, '');
      setSelected(id);
      setEditing(id);
      // A collapsed parent must open, or the node you just made is invisible.
      const p = map.nodes.find((n) => n.id === parentId);
      if (p?.collapsed) onUpdateNode(map.id, parentId, { collapsed: false });
    },
    [map.id, map.nodes, onAddNode, onUpdateNode]
  );

  const addSibling = useCallback(
    (nodeId: string) => {
      const pid = parentOf.get(nodeId) ?? null;
      if (!pid) {
        // Enter on the root means "first branch" — there is no sibling of a root.
        addChild(nodeId);
        return;
      }
      const id = onAddNode(map.id, pid, '', nodeId);
      setSelected(id);
      setEditing(id);
    },
    [map.id, onAddNode, parentOf, addChild]
  );

  /** Indent: become a child of the sibling above. Outdent: become a sibling
   *  of your parent. Between them you can restructure without dragging. */
  const indent = useCallback(
    (nodeId: string) => {
      const pid = parentOf.get(nodeId);
      if (!pid) return;
      const sibs = map.nodes.filter((n) => n.parentId === pid);
      const i = sibs.findIndex((n) => n.id === nodeId);
      if (i <= 0) return;
      onReparent(map.id, nodeId, sibs[i - 1].id);
    },
    [map.id, map.nodes, onReparent, parentOf]
  );

  const outdent = useCallback(
    (nodeId: string) => {
      const pid = parentOf.get(nodeId);
      if (!pid) return;
      const gp = parentOf.get(pid);
      if (!gp) return; // already a top-level branch
      onReparent(map.id, nodeId, gp);
    },
    [map.id, onReparent, parentOf]
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (!selected) return;
    const isEditing = editing !== null;
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) outdent(selected);
      else addChild(selected);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isEditing) {
        setEditing(null);
        addSibling(selected);
      } else {
        setEditing(selected);
      }
      return;
    }
    if (e.key === 'Escape' && isEditing) {
      e.preventDefault();
      setEditing(null);
      return;
    }
    if (isEditing) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (selected !== rootId) {
        const up = parentOf.get(selected) ?? rootId;
        onDeleteNode(map.id, selected);
        setSelected(up);
      }
      return;
    }
    if (e.key === '[') { e.preventDefault(); outdent(selected); return; }
    if (e.key === ']') { e.preventDefault(); indent(selected); return; }
  };

  const selectedNode = map.nodes.find((n) => n.id === selected) ?? null;
  const selectedLaid = selected ? layout.byId.get(selected) : undefined;
  const hasKids = (selectedLaid?.childIds.length ?? 0) > 0;

  return (
    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-950 min-h-0">
      <header className="flex-shrink-0 px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-[11px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 shrink-0"
        >
          ← Maps
        </button>
        <span className="flex-1 min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
          {map.title}
        </span>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(toOutline(map.nodes));
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              setCopied(false);
            }
          }}
          className="text-[11px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 shrink-0"
          title="Copy the map as a markdown outline"
        >
          {copied ? 'Copied' : 'Outline'}
        </button>
        <button
          onClick={onDelete}
          className="text-[11px] uppercase tracking-wider font-bold text-gray-300 dark:text-gray-600 hover:text-red-500 shrink-0"
        >
          Delete
        </button>
      </header>

      {/* The canvas. Scrolls in both directions; the tree grows right and
          down, so on a phone you pan rather than squint. */}
      <div
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={onKey}
        className="flex-1 overflow-auto outline-none"
        aria-label="Mind map canvas"
      >
        <div
          style={{
            width: layout.width * zoom,
            height: layout.height * zoom,
            minWidth: '100%',
            position: 'relative',
          }}
        >
          <svg
            width={layout.width * zoom}
            height={layout.height * zoom}
            viewBox={`-12 -20 ${layout.width} ${layout.height}`}
            className="absolute inset-0"
          >
            {layout.edges.map(({ from, to }) => {
              const x1 = from.x + from.w;
              const y1 = from.y + from.h / 2;
              const x2 = to.x;
              const y2 = to.y + to.h / 2;
              const mid = x1 + (x2 - x1) / 2;
              const color = branchColorOf(to.node.id, map.nodes, rootId) ?? '#9ca3af';
              return (
                <path
                  key={`${from.node.id}-${to.node.id}`}
                  d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={color}
                  strokeOpacity={0.45}
                  strokeWidth={2}
                />
              );
            })}
          </svg>

          <div
            className="absolute inset-0"
            style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}
          >
            {layout.nodes.map((l) => {
              const color = branchColorOf(l.node.id, map.nodes, rootId);
              const isRoot = l.depth === 0;
              const isSel = l.node.id === selected;
              return (
                <div
                  key={l.node.id}
                  style={{ left: l.x + 12, top: l.y + 20, width: l.w, minHeight: l.h }}
                  className="absolute"
                >
                  {/* The editor is a bare input, never nested inside the
                      button. A text field inside a <button> means Space
                      activates the button — which unmounted the field and
                      silently dropped every character after the first
                      space, i.e. most medical terms. */}
                  {editing === l.node.id ? (
                    <input
                      ref={inputRef}
                      value={l.node.text}
                      autoFocus
                      onChange={(e) => onUpdateNode(map.id, l.node.id, { text: e.target.value })}
                      onBlur={() => setEditing(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          setEditing(null);
                          addSibling(l.node.id);
                        } else if (e.key === 'Tab') {
                          e.preventDefault();
                          setEditing(null);
                          if (e.shiftKey) outdent(l.node.id);
                          else addChild(l.node.id);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditing(null);
                        }
                        // Everything else stays in the field rather than
                        // reaching the canvas' shortcut handler.
                        e.stopPropagation();
                      }}
                      className="w-full px-2.5 py-1.5 text-[12px] font-medium text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 rounded-lg border-2 border-indigo-500 shadow-sm focus:outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => {
                        setSelected(l.node.id);
                        setEditing(null);
                      }}
                      onDoubleClick={() => {
                        setSelected(l.node.id);
                        setEditing(l.node.id);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg border-2 transition-colors ${
                        isSel
                          ? 'border-indigo-500 bg-white dark:bg-gray-900'
                          : 'border-transparent bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700'
                      } shadow-sm`}
                      style={
                        !isSel && color
                          ? { borderLeftColor: color, borderLeftWidth: 3 }
                          : isRoot && !isSel
                          ? { borderColor: '#6b7280' }
                          : undefined
                      }
                    >
                      <span
                        className={`block text-[12px] leading-snug ${
                          isRoot
                            ? 'font-bold text-gray-900 dark:text-gray-100'
                            : 'font-medium text-gray-800 dark:text-gray-200'
                        } ${!l.node.text ? 'italic text-gray-300 dark:text-gray-600' : ''}`}
                      >
                        {l.node.text || 'untitled'}
                      </span>
                    </button>
                  )}

                  {l.hiddenChildren > 0 && (
                    <button
                      onClick={() => onUpdateNode(map.id, l.node.id, { collapsed: false })}
                      className="absolute -right-6 top-1.5 text-[10px] font-bold tabular-nums text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-800 rounded-full px-1.5 py-0.5"
                      title={`${l.hiddenChildren} hidden — tap to expand`}
                    >
                      {l.hiddenChildren}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Touch controls. The keyboard path is the fast one, but a phone has
          no Tab key, so every move has a button too. */}
      <footer className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 space-y-2">
        {selectedNode && (
          <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
            Selected: <span className="text-gray-700 dark:text-gray-300 font-medium">{selectedNode.text || 'untitled'}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Act onClick={() => selected && addChild(selected)} primary>+ Branch</Act>
          <Act onClick={() => selected && addSibling(selected)}>+ Sibling</Act>
          <Act onClick={() => selected && setEditing(selected)}>Rename</Act>
          <Act onClick={() => selected && outdent(selected)} disabled={!selectedNode?.parentId || !parentOf.get(selectedNode.parentId)}>←</Act>
          <Act onClick={() => selected && indent(selected)} disabled={!selectedNode?.parentId}>→</Act>
          {hasKids && (
            <Act onClick={() => selected && onUpdateNode(map.id, selected, { collapsed: !selectedNode?.collapsed })}>
              {selectedNode?.collapsed ? 'Expand' : 'Collapse'}
            </Act>
          )}
          <Act
            onClick={() => {
              if (!selected || selected === rootId) return;
              const up = parentOf.get(selected) ?? rootId;
              onDeleteNode(map.id, selected);
              setSelected(up);
            }}
            disabled={selected === rootId}
          >
            Delete
          </Act>
          <span className="ml-auto flex items-center gap-1">
            <Act onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}>−</Act>
            <span className="text-[10px] tabular-nums text-gray-400 dark:text-gray-500 w-9 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Act onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))}>+</Act>
          </span>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500">
          Tab = branch · Enter = sibling · Shift+Tab or [ = out · ] = in · Delete removes
        </p>
      </footer>
    </div>
  );
}

function Act({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        primary
          ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
          : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-indigo-400'
      }`}
    >
      {children}
    </button>
  );
}
