import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { MindMap, MindMapNode, DropPosition } from '../types';
import {
  layoutMap,
  branchColorOf,
  toOutline,
  pathToRoot,
  depthsOf,
  subtreeIds,
  pageUnits,
  tagOf,
} from '../utils/mindMapLayout';
import { snapshotsFor, orphanedSnapshots } from '../utils/mapSnapshots';
import { useNodeDrag } from '../hooks/useNodeDrag';
import type { MapSnapshot } from '../utils/mapSnapshots';
import {
  buildMindMapPdf,
  pdfFileName,
  DEFAULT_PDF_OPTIONS,
  PAPER_LABELS,
} from '../utils/mindMapPdf';
import type {
  MindMapPdfOptions,
  PdfGuides,
  PdfLayoutKind,
  PdfPaper,
} from '../utils/mindMapPdf';
import type { SplitMode } from '../utils/mindMapLayout';
import type { PdfNodeStyle } from '../utils/mindMapPdf';

// Mind maps for breaking a lecture down.
//
// Modelled on MindMup rather than Lucidchart: you never position anything.
// Tab makes a child, Enter makes a sibling, and the layout recomputes. That
// constraint is the feature — a map has to be takeable in the ten minutes
// after a lecture while the shape is still in your head, and dragging boxes
// is how that turns into an afternoon.

/** The slice of a lecture this view needs. Kept minimal so Maps does not
 *  depend on the shape of the lecture model. */
export interface LectureRef {
  id: string;
  title: string;
  course?: string;
}

export default function MindMapsView({
  maps,
  lectures,
  onCreate,
  onDelete,
  onAddNode,
  onUpdateNode,
  onDeleteNode,
  onReparent,
  onMoveNode,
  onMoveNodeTo,
  onTagSubtree,
  onSetWorkingLabel,
  onCollapseToDepth,
  onInsertTemplate,
  onGraftMap,
  onUndo,
  onRedo,
  undoDepth,
  redoDepth,
  onRestore,
  onDiscardHistory,
  initialMapId,
  initialFocusId,
  onConsumedInitialMap,
}: {
  maps: MindMap[];
  lectures: LectureRef[];
  onCreate: (title: string) => MindMap;
  onDelete: (id: string) => void;
  onAddNode: (mapId: string, parentId: string, text?: string, afterSiblingId?: string) => string;
  onUpdateNode: (mapId: string, nodeId: string, patch: Partial<Omit<MindMapNode, 'id' | 'parentId'>>) => void;
  onDeleteNode: (mapId: string, nodeId: string) => void;
  onReparent: (mapId: string, nodeId: string, newParentId: string) => void;
  onMoveNode: (mapId: string, nodeId: string, delta: -1 | 1) => void;
  onMoveNodeTo: (mapId: string, nodeId: string, targetId: string, position: DropPosition) => void;
  onTagSubtree: (mapId: string, nodeId: string, label?: string) => void;
  onSetWorkingLabel: (mapId: string, label?: string, lectureId?: string) => void;
  onCollapseToDepth: (mapId: string, depth: number) => void;
  onInsertTemplate: (mapId: string, parentId: string, labels: string[]) => void;
  onGraftMap: (sourceId: string, targetId: string, parentId: string) => void;
  onUndo: (mapId: string) => void;
  onRedo: (mapId: string) => void;
  undoDepth: (mapId: string) => number;
  redoDepth: (mapId: string) => number;
  onRestore: (mapId: string, nodes: MindMapNode[], title: string) => void;
  onDiscardHistory: (mapId: string) => void;
  /** Set when a lecture row started a map — opens straight into it. */
  initialMapId?: string | null;
  /** The node within that map to focus on arrival, when the hand-off came
   *  from a lecture that already has a place in a course tree. */
  initialFocusId?: string | null;
  onConsumedInitialMap?: () => void;
}) {
  // A map handed over by a lecture row is where this view opens, so it is
  // initial state rather than an effect that re-renders to get there. The
  // view only mounts on navigating to Maps, which is exactly when the
  // hand-off happens.
  const [openId, setOpenId] = useState<string | null>(() => initialMapId ?? null);
  const [newTitle, setNewTitle] = useState('');
  // Which map the hand-off was for, so a focus id meant for that arrival is
  // not reapplied when you later open some other map by hand.
  const [openedFrom] = useState<string | null>(() => initialMapId ?? null);
  const [grafting, setGrafting] = useState<MindMap | null>(null);

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
        lectures={lectures}
        initialFocusId={openedFrom === open.id ? (initialFocusId ?? null) : null}
        onBack={() => setOpenId(null)}
        onAddNode={onAddNode}
        onUpdateNode={onUpdateNode}
        onDeleteNode={onDeleteNode}
        onReparent={onReparent}
        onMoveNode={onMoveNode}
        onMoveNodeTo={onMoveNodeTo}
        onTagSubtree={onTagSubtree}
        onSetWorkingLabel={onSetWorkingLabel}
        onCollapseToDepth={onCollapseToDepth}
        onInsertTemplate={onInsertTemplate}
        onUndo={onUndo}
        onRedo={onRedo}
        undoDepth={undoDepth}
        redoDepth={redoDepth}
        onRestore={onRestore}
        onDelete={() => {
          if (
            confirm(
              `Delete "${open.title}"?\n\nA restore point is kept on this device, so you can ` +
                `bring it back from the Maps list afterwards.`
            )
          ) {
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

        <RecoverableMaps
          liveIds={new Set(maps.map((m) => m.id))}
          onRestore={(mapId, snap) => {
            onRestore(mapId, snap.nodes, snap.title);
            setOpenId(mapId);
          }}
          onDiscard={onDiscardHistory}
        />

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
                    {sectionCount(m) > 0 ? ` · ${sectionCount(m)} section${sectionCount(m) === 1 ? '' : 's'}` : ''}
                    {m.course ? ` · ${m.course}` : ''} · edited{' '}
                    {new Date(m.updatedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                </button>
                {/* A map made before course trees existed can be folded into
                    one without retyping it. Offered only where it applies:
                    a map that came from a lecture row, when some other map
                    could hold it. */}
                {maps.length > 1 && (
                  <button
                    onClick={() => setGrafting(m)}
                    className="mt-1 ml-3 text-[10px] uppercase tracking-wider font-bold text-gray-300 dark:text-gray-600 hover:text-indigo-600 dark:hover:text-indigo-400"
                  >
                    Move into another map
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {grafting && (
          <GraftSheet
            source={grafting}
            maps={maps.filter((m) => m.id !== grafting.id)}
            onClose={() => setGrafting(null)}
            onGraft={(targetId, parentId) => {
              onGraftMap(grafting.id, targetId, parentId);
              setGrafting(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

// ---------- The editor ----------

function MapEditor({
  map,
  lectures,
  onBack,
  onAddNode,
  onUpdateNode,
  onDeleteNode,
  onReparent,
  onMoveNode,
  onMoveNodeTo,
  onTagSubtree,
  onSetWorkingLabel,
  onCollapseToDepth,
  onInsertTemplate,
  onUndo,
  onRedo,
  undoDepth,
  redoDepth,
  onRestore,
  onDelete,
  initialFocusId,
}: {
  map: MindMap;
  lectures: LectureRef[];
  onBack: () => void;
  onAddNode: (mapId: string, parentId: string, text?: string, afterSiblingId?: string) => string;
  onUpdateNode: (mapId: string, nodeId: string, patch: Partial<Omit<MindMapNode, 'id' | 'parentId'>>) => void;
  onDeleteNode: (mapId: string, nodeId: string) => void;
  onReparent: (mapId: string, nodeId: string, newParentId: string) => void;
  onMoveNode: (mapId: string, nodeId: string, delta: -1 | 1) => void;
  onMoveNodeTo: (mapId: string, nodeId: string, targetId: string, position: DropPosition) => void;
  onTagSubtree: (mapId: string, nodeId: string, label?: string) => void;
  onSetWorkingLabel: (mapId: string, label?: string, lectureId?: string) => void;
  onCollapseToDepth: (mapId: string, depth: number) => void;
  onInsertTemplate: (mapId: string, parentId: string, labels: string[]) => void;
  onUndo: (mapId: string) => void;
  onRedo: (mapId: string) => void;
  undoDepth: (mapId: string) => number;
  redoDepth: (mapId: string) => number;
  onRestore: (mapId: string, nodes: MindMapNode[], title: string) => void;
  onDelete: () => void;
  initialFocusId?: string | null;
}) {
  const rootId = map.nodes.find((n) => n.parentId === null)?.id ?? '';
  const [selectedRaw, setSelected] = useState<string>(() => initialFocusId ?? rootId);
  const [editing, setEditing] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [exporting, setExporting] = useState(false);
  // Focus treats a node as a temporary root. Once one tree holds a course,
  // this is the only way to work on a lecture without the other nine on
  // screen — and it is why a lecture's details can be "spliced out".
  const [focusRaw, setFocus] = useState<string | null>(() => initialFocusId ?? null);
  const [query, setQuery] = useState('');
  const [lectureFilter, setLectureFilter] = useState<string | null>(null);
  const [menu, setMenu] = useState<null | 'label' | 'template' | 'note'>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const focusId = focusRaw && map.nodes.some((n) => n.id === focusRaw) ? focusRaw : null;
  const viewRootId = focusId ?? rootId;

  const parentOf = useMemo(
    () => new Map(map.nodes.map((n) => [n.id, n.parentId])),
    [map.nodes]
  );

  // Search opens the path to every match without writing collapsed:false
  // across the tree — clearing the box puts the shape straight back.
  const { matches, openForSearch } = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { matches: null as Set<string> | null, openForSearch: undefined };
    const hit = new Set<string>();
    const open = new Set<string>();
    for (const n of map.nodes) {
      if (!n.text.toLowerCase().includes(q)) continue;
      hit.add(n.id);
      let cur = n.parentId;
      while (cur) {
        open.add(cur);
        cur = parentOf.get(cur) ?? null;
      }
    }
    return { matches: hit, openForSearch: open };
  }, [query, map.nodes, parentOf]);

  const layout = useMemo(
    () => layoutMap(map.nodes, { rootId: viewRootId, forceExpanded: openForSearch }),
    [map.nodes, viewRootId, openForSearch]
  );

  // Derive rather than correct-after-the-fact: deleting a node, or focusing
  // somewhere that does not contain it, used to leave a dangling selection
  // that an effect then fixed on a second render.
  const selected = layout.byId.has(selectedRaw) ? selectedRaw : viewRootId;

  /** Nodes belonging to the lecture being filtered on, plus nothing else.
   *  Everything outside dims rather than disappearing, so you keep the shape
   *  of the tree while seeing only one session's contribution to it. */
  const inFilter = useMemo(() => {
    if (!lectureFilter) return null;
    const keep = new Set<string>();
    for (const n of map.nodes) {
      if (tagOf(n) !== lectureFilter) continue;
      keep.add(n.id);
      let cur = n.parentId;
      while (cur) {
        keep.add(cur);
        cur = parentOf.get(cur) ?? null;
      }
    }
    return keep;
  }, [lectureFilter, map.nodes, parentOf]);

  /** Lectures already present in this tree, for the filter menu. A map that
   *  was never tagged shows no lecture controls at all. */
  const usedLabels = useMemo(() => {
    const seen = new Set<string>();
    for (const n of map.nodes) {
      const t = tagOf(n);
      if (t) seen.add(t);
    }
    return Array.from(seen).sort();
  }, [map.nodes]);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.select();
  }, [editing]);

  // Focusing re-roots the tree at 0,0. Keeping the old scroll offset leaves
  // you looking at empty canvas beside the node you just focused.
  useEffect(() => {
    scrollRef.current?.scrollTo({ left: 0, top: 0 });
  }, [focusId]);

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
      deleteSelected();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) onRedo(map.id);
      else onUndo(map.id);
      return;
    }
    if (e.key === '[') { e.preventDefault(); outdent(selected); return; }
    if (e.key === ']') { e.preventDefault(); indent(selected); return; }
    // Alt rather than a bare arrow: plain arrows should stay free for moving
    // the selection around, which is the next thing this canvas wants.
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      onMoveNode(map.id, selected, e.key === 'ArrowUp' ? -1 : 1);
      return;
    }
  };

  /** The course's lectures, plus anything already tagged in this tree even
   *  if it is no longer in the schedule — a map must not lose the ability to
   *  name a tag just because a re-import changed the lecture list. */
  /** Labels already used in this tree, plus this course's lecture titles as
   *  ready-made suggestions. You can always just type something else. */
  const labelSuggestions = useMemo(() => {
    const seen = new Set<string>(usedLabels);
    for (const l of lectures) {
      if (map.course && l.course && l.course !== map.course) continue;
      seen.add(l.title);
    }
    return Array.from(seen).slice(0, 12);
  }, [lectures, map.course, usedLabels]);

  /** Drag to rearrange. The rules live here rather than in the interaction
   *  so the hook stays about pointers: you cannot drop a node on itself, on
   *  one of its own descendants, or beside the root (which has no siblings). */
  const canDrop = useCallback(
    (id: string, targetId: string, position: DropPosition) => {
      if (id === targetId) return false;
      if (subtreeIds(map.nodes, id).has(targetId)) return false;
      if (position !== 'child' && targetId === rootId) return false;
      return true;
    },
    [map.nodes, rootId]
  );

  const { dragId, drop, start: startDrag } = useNodeDrag({
    scrollRef,
    canDrop,
    onDrop: (id, targetId, position) => {
      onMoveNodeTo(map.id, id, targetId, position);
      setSelected(id);
    },
    // Dragging while renaming would fight the text field for the pointer.
    enabled: editing === null,
  });

  /** The only way a node is deleted. Delete takes the whole subtree with it,
   *  so anything with children asks first and says how much is going — the
   *  keystroke that caused this is the same one people press to correct a
   *  typo. */
  const deleteSelected = useCallback(() => {
    if (!selected || selected === rootId) return;
    const node = map.nodes.find((n) => n.id === selected);
    if (!node) return;
    const count = subtreeIds(map.nodes, selected).size;
    if (count > 1) {
      const label = node.text || 'this node';
      const ok = confirm(
        `Delete “${label}” and the ${count - 1} node${count - 1 === 1 ? '' : 's'} under it?\n\n` +
          `You can undo this, and a restore point is saved either way.`
      );
      if (!ok) return;
    }
    const up = parentOf.get(selected) ?? rootId;
    onDeleteNode(map.id, selected);
    setSelected(up);
  }, [selected, rootId, map.nodes, map.id, parentOf, onDeleteNode]);

  const selectedNode = map.nodes.find((n) => n.id === selected) ?? null;
  const siblingsOfSelected = useMemo(
    () => (selectedNode?.parentId ? map.nodes.filter((n) => n.parentId === selectedNode.parentId) : []),
    [map.nodes, selectedNode]
  );
  const siblingIndex = siblingsOfSelected.findIndex((n) => n.id === selected);
  const canMoveUp = siblingIndex > 0;
  const canMoveDown = siblingIndex !== -1 && siblingIndex < siblingsOfSelected.length - 1;
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
          onClick={() => setShowHistory(true)}
          className="text-[11px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 shrink-0"
          title="Restore an earlier version of this map"
        >
          History
        </button>
        <button
          onClick={() => setExporting(true)}
          className="text-[11px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 shrink-0"
          title="Save as a PDF to annotate, or copy as an outline"
        >
          Export
        </button>
        <button
          onClick={onDelete}
          className="text-[11px] uppercase tracking-wider font-bold text-gray-300 dark:text-gray-600 hover:text-red-500 shrink-0"
        >
          Delete
        </button>
      </header>

      {exporting && (
        <ExportSheet
          map={map}
          lectureFilter={lectureFilter}
          focusId={focusId}
          focusTitle={focusId ? (map.nodes.find((n) => n.id === focusId)?.text ?? null) : null}
          onClose={() => setExporting(false)}
        />
      )}

      {showHistory && (
        <HistorySheet
          mapId={map.id}
          currentCount={map.nodes.length}
          onClose={() => setShowHistory(false)}
          onRestore={(snap) => {
            onRestore(map.id, snap.nodes, snap.title);
            setShowHistory(false);
          }}
        />
      )}

      {/* Navigation strip. A map that holds one lecture never needs this; a
          map that holds a course is unusable without it. */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find in map"
          className="flex-1 min-w-0 px-2.5 py-1 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="text-[11px] font-semibold text-gray-400 hover:text-indigo-600 shrink-0"
          >
            {matches?.size ?? 0} found · clear
          </button>
        )}
        <span className="flex items-center gap-0.5 shrink-0">
          {([1, 2, 3] as const).map((d) => (
            <button
              key={d}
              onClick={() => onCollapseToDepth(map.id, d)}
              title={`Show ${d} level${d === 1 ? '' : 's'}`}
              className="w-6 h-6 text-[11px] font-bold rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => onCollapseToDepth(map.id, Number.POSITIVE_INFINITY)}
            title="Expand everything"
            className="w-6 h-6 text-[11px] font-bold rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400"
          >
            ∞
          </button>
        </span>
      </div>

      {/* Focus breadcrumb. Only present while focused, because the way out
          has to be as obvious as the way in. */}
      {focusId && (
        <div className="flex-shrink-0 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 border-b border-indigo-100 dark:border-indigo-900 flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setFocus(null)}
            className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 shrink-0"
          >
            Exit focus
          </button>
          <span className="text-[11px] text-indigo-300 dark:text-indigo-700">·</span>
          {pathToRoot(map.nodes, focusId).map((n, i, arr) => (
            <span key={n.id} className="flex items-center gap-1.5 shrink-0">
              {i > 0 && <span className="text-[10px] text-indigo-300 dark:text-indigo-700">›</span>}
              <button
                onClick={() => setFocus(i === 0 ? null : n.id)}
                className={`text-[11px] truncate max-w-[9rem] ${
                  i === arr.length - 1
                    ? 'font-semibold text-indigo-800 dark:text-indigo-200'
                    : 'text-indigo-500 dark:text-indigo-400 hover:underline'
                }`}
              >
                {n.text || 'untitled'}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Lecture strip. Absent entirely until a map actually holds tagged
          material, so a single-lecture map stays as plain as it was. */}
      {usedLabels.length > 0 && (
        <div className="flex-shrink-0 px-3 py-1.5 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 flex items-center gap-1.5 overflow-x-auto">
          <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 shrink-0">
            Label
          </span>
          <button
            onClick={() => setLectureFilter(null)}
            className={`px-2 py-0.5 text-[11px] rounded-full border shrink-0 ${
              lectureFilter === null
                ? 'bg-gray-700 dark:bg-gray-200 border-gray-700 dark:border-gray-200 text-white dark:text-gray-900 font-semibold'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
            }`}
          >
            All
          </button>
          {usedLabels.map((l) => (
            <button
              key={l}
              onClick={() => setLectureFilter(lectureFilter === l ? null : l)}
              className={`px-2 py-0.5 text-[11px] rounded-full border shrink-0 max-w-[11rem] truncate ${
                lectureFilter === l
                  ? 'bg-indigo-600 border-indigo-600 text-white font-semibold'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      )}

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
              const isSection = !!l.node.section && !isRoot;
              // Dimming rather than hiding: a filtered lecture should read as
              // "here is my part of this tree", which needs the rest of the
              // tree still visible around it.
              const dimmed =
                (inFilter !== null && !inFilter.has(l.node.id)) ||
                (matches !== null && matches.size > 0 && !matches.has(l.node.id));
              const isMatch = matches !== null && matches.has(l.node.id);
              const isDragging = dragId === l.node.id;
              const hint = drop && drop.id === l.node.id && dragId
                ? (canDrop(dragId, l.node.id, drop.position) ? drop.position : null)
                : null;
              return (
                <div
                  key={l.node.id}
                  data-node-id={l.node.id}
                  style={{ left: l.x + 12, top: l.y + 20, width: l.w, minHeight: l.h }}
                  className={`absolute transition-opacity ${dimmed ? 'opacity-25' : ''} ${
                    isDragging ? 'opacity-40' : ''
                  }`}
                >
                  {/* Where it will land. A rule above or below means "become
                      a sibling on that side"; a ring around the whole box
                      means "become a child of this". */}
                  {hint === 'before' && (
                    <span className="absolute -top-1 left-0 right-0 h-0.5 bg-indigo-500 rounded-full pointer-events-none" />
                  )}
                  {hint === 'after' && (
                    <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-indigo-500 rounded-full pointer-events-none" />
                  )}
                  {hint === 'child' && (
                    <span className="absolute -inset-1 rounded-xl ring-2 ring-indigo-500 ring-offset-0 pointer-events-none" />
                  )}
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
                      onPointerDown={(e) => startDrag(e, l.node.id)}
                      // A drag must not also fire the click that selects, or
                      // every rearrange would change the selection twice and
                      // the second one would win.
                      onClick={() => {
                        if (dragId) return;
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
                      } ${isMatch ? 'ring-2 ring-amber-400' : ''} ${
                        isSection ? 'shadow-md' : 'shadow-sm'
                      }`}
                      style={{
                        // The canvas pans on touch, so the browser must keep
                        // the pan gesture until the long press decides that
                        // this is a drag instead.
                        touchAction: 'pan-x pan-y',
                        // A section is the map's own structure, so it wears
                        // the branch colour on every edge rather than the
                        // single left rule an ordinary node gets.
                        ...(isSection && !isSel && color
                          ? { borderColor: color }
                          : !isSel && color
                            ? { borderLeftColor: color, borderLeftWidth: 3 }
                            : isRoot && !isSel
                              ? { borderColor: '#6b7280' }
                              : {}),
                      }}
                    >
                      {isSection && (
                        <span
                          className="block text-[9px] uppercase tracking-wider font-bold leading-none mb-0.5 truncate"
                          style={{ color: color ?? undefined }}
                        >
                          {tagOf(l.node) && tagOf(l.node) !== l.node.text
                            ? tagOf(l.node)
                            : 'Section'}
                        </span>
                      )}
                      {l.node.note && (
                        <span
                          className="float-right ml-1 text-[10px] leading-none text-gray-400 dark:text-gray-500"
                          title={l.node.note}
                        >
                          ≡
                        </span>
                      )}
                      {l.node.star && (
                        <span
                          className="float-right ml-1 text-[11px] leading-none"
                          style={{ color: color ?? undefined }}
                          title="High yield"
                        >
                          ★
                        </span>
                      )}
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
          <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate flex items-center gap-1.5">
            <span className="truncate">
              Selected: <span className="text-gray-700 dark:text-gray-300 font-medium">{selectedNode.text || 'untitled'}</span>
            </span>
            {tagOf(selectedNode) && (
              <span className="shrink-0 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 max-w-[10rem] truncate">
                {tagOf(selectedNode)}
              </span>
            )}
          </div>
        )}

        {/* Working lecture. Everything typed from here inherits this tag,
            which is the whole mechanism that lets one tree hold a course
            and still be filtered back down to one session. */}
        {menu === 'label' && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-2 space-y-2">
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
              Label new nodes
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSetWorkingLabel(map.id, labelDraft.trim() || undefined);
                setMenu(null);
              }}
              className="flex items-center gap-1.5"
            >
              <input
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                placeholder="Lec 4, Week 2, Exam 1…"
                autoFocus
                className="flex-1 min-w-0 px-2.5 py-1.5 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Set
              </button>
              {map.workingLabel && (
                <button
                  type="button"
                  onClick={() => {
                    setLabelDraft('');
                    onSetWorkingLabel(map.id, undefined);
                    setMenu(null);
                  }}
                  className="px-2 py-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  Clear
                </button>
              )}
            </form>

            {labelSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {labelSuggestions.map((l) => (
                  <button
                    key={l}
                    onClick={() => {
                      setLabelDraft(l);
                      onSetWorkingLabel(map.id, l);
                      setMenu(null);
                    }}
                    className="px-2 py-0.5 text-[11px] rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400 max-w-[11rem] truncate"
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}

            {selectedNode && selectedNode.id !== rootId && (
              <button
                onClick={() => {
                  onTagSubtree(map.id, selected, labelDraft.trim() || undefined);
                  setMenu(null);
                }}
                className="block w-full text-left px-2 py-1 text-[12px] rounded text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 border-t border-gray-100 dark:border-gray-800 pt-1.5"
              >
                {labelDraft.trim()
                  ? `Apply “${labelDraft.trim()}” to “${selectedNode.text || 'untitled'}” and everything under it`
                  : `Clear the label on “${selectedNode.text || 'untitled'}” and everything under it`}
              </button>
            )}
          </div>
        )}

        {menu === 'note' && selectedNode && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-2 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
              Note on “{selectedNode.text || 'untitled'}”
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">
              Something true of this heading as a whole. It prints under the heading and above
              its children — which is where a remark about all the types belongs, rather than
              beside them as if it were another one.
            </p>
            <textarea
              value={selectedNode.note ?? ''}
              onChange={(e) => onUpdateNode(map.id, selected, { note: e.target.value })}
              onKeyDown={(e) => e.stopPropagation()}
              rows={3}
              autoFocus
              placeholder="All types share…"
              className="w-full px-2.5 py-1.5 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMenu(null)}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Done
              </button>
              {selectedNode.note && (
                <button
                  onClick={() => onUpdateNode(map.id, selected, { note: undefined })}
                  className="px-2 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        {menu === 'template' && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-2 space-y-1">
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
              Add a scaffold under “{selectedNode?.text || 'untitled'}”
            </div>
            {TEMPLATES.map((t) => (
              <button
                key={t.name}
                onClick={() => {
                  if (selected) onInsertTemplate(map.id, selected, t.labels);
                  setMenu(null);
                }}
                className="block w-full text-left px-2 py-1 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <span className="block text-[12px] font-medium">{t.name}</span>
                <span className="block text-[10px] text-gray-400 dark:text-gray-500 truncate">
                  {t.labels.join(' · ')}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          <Act onClick={() => selected && addChild(selected)} primary>+ Branch</Act>
          <Act onClick={() => selected && addSibling(selected)}>+ Sibling</Act>
          <Act onClick={() => selected && setEditing(selected)}>Rename</Act>
          <Act onClick={() => selected && outdent(selected)} disabled={!selectedNode?.parentId || !parentOf.get(selectedNode.parentId)}>←</Act>
          <Act onClick={() => selected && indent(selected)} disabled={!selectedNode?.parentId}>→</Act>
          <Act onClick={() => selected && onMoveNode(map.id, selected, -1)} disabled={!canMoveUp} title="Move up among siblings">↑</Act>
          <Act onClick={() => selected && onMoveNode(map.id, selected, 1)} disabled={!canMoveDown} title="Move down among siblings">↓</Act>
          <Act
            onClick={() => selected && onUpdateNode(map.id, selected, { section: !selectedNode?.section })}
            disabled={selected === rootId}
            active={!!selectedNode?.section}
          >
            {selectedNode?.section ? 'Section ✓' : 'Section'}
          </Act>
          <Act
            onClick={() => selected && onUpdateNode(map.id, selected, { star: !selectedNode?.star })}
            disabled={selected === rootId}
            active={!!selectedNode?.star}
            title="High yield — printed with a marker and extra writing room"
          >
            {selectedNode?.star ? '★ High yield' : '☆ High yield'}
          </Act>
          <Act
            onClick={() => {
              if (!selected || selected === rootId) return;
              setFocus(selected);
              setQuery('');
            }}
            disabled={selected === rootId || !hasKids}
          >
            Focus
          </Act>
          <Act
            onClick={() => setMenu(menu === 'note' ? null : 'note')}
            active={menu === 'note' || !!selectedNode?.note}
            title="A remark about this heading as a whole"
          >
            {selectedNode?.note ? '≡ Note' : 'Note'}
          </Act>
          <Act onClick={() => setMenu(menu === 'template' ? null : 'template')} active={menu === 'template'}>
            Scaffold
          </Act>
          <Act
            onClick={() => {
              setLabelDraft(map.workingLabel ?? '');
              setMenu(menu === 'label' ? null : 'label');
            }}
            active={menu === 'label'}
          >
            {map.workingLabel ? `⌁ ${map.workingLabel}` : 'Label'}
          </Act>
          {hasKids && (
            <Act onClick={() => selected && onUpdateNode(map.id, selected, { collapsed: !selectedNode?.collapsed })}>
              {selectedNode?.collapsed ? 'Expand' : 'Collapse'}
            </Act>
          )}
          <Act onClick={deleteSelected} disabled={selected === rootId}>
            Delete
          </Act>
          <Act onClick={() => onUndo(map.id)} disabled={undoDepth(map.id) === 0} title="Undo (Cmd/Ctrl+Z)">
            ↶ Undo
          </Act>
          <Act onClick={() => onRedo(map.id)} disabled={redoDepth(map.id) === 0} title="Redo (Cmd/Ctrl+Shift+Z)">
            ↷
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
          Tab = branch · Enter = sibling · [ / ] = out / in · Alt+↑ / Alt+↓ = reorder ·
          Cmd/Ctrl+Z = undo · Delete removes the node and everything under it.
          Drag a node onto another to re-file it — hold first on a touchscreen; drop on the
          middle to make it a child, or near the top or bottom edge to place it above or below.
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
  active,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors disabled:opacity-30 disabled:cursor-not-allowed max-w-[11rem] truncate ${
        primary
          ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
          : active
          ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-400 text-indigo-700 dark:text-indigo-300'
          : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-indigo-400'
      }`}
    >
      {children}
    </button>
  );
}

/** Scaffolds. Most topics in medicine take one of a few shapes, and typing
 *  the same four headings for every disease is the friction that stops a map
 *  being made at all. */
const TEMPLATES: { name: string; labels: string[] }[] = [
  { name: 'Disease', labels: ['Pathophysiology', 'Clinical features', 'Investigations', 'Management', 'Complications'] },
  { name: 'Drug class', labels: ['Mechanism', 'Indications', 'Side effects', 'Contraindications', 'Monitoring'] },
  { name: 'Organ system', labels: ['Anatomy', 'Physiology', 'Common pathology', 'Key investigations'] },
  { name: 'Compare two', labels: ['Shared features', 'Distinguishing features', 'How to tell them apart'] },
];

// ---------------------------------------------------------------- export

const PDF_PREFS_KEY = 'setatime.mapPdfOptions';

function loadPdfPrefs(): MindMapPdfOptions {
  try {
    const raw = localStorage.getItem(PDF_PREFS_KEY);
    if (!raw) return DEFAULT_PDF_OPTIONS;
    return { ...DEFAULT_PDF_OPTIONS, ...(JSON.parse(raw) as Partial<MindMapPdfOptions>) };
  } catch {
    return DEFAULT_PDF_OPTIONS;
  }
}

/** Hand the file to the OS. On an iPad the share sheet is the whole point —
 *  it offers GoodNotes and Notability directly, which is where the pencil
 *  is, whereas a download only ever reaches Files. Everywhere else, and
 *  whenever the browser will not share a file, fall back to a download.
 *
 *  Both paths have to run inside the click that started them: Safari only
 *  allows navigator.share from a user gesture, which is why the PDF is
 *  built synchronously rather than behind a dynamic import. */
async function deliverPdf(blob: Blob, name: string): Promise<'shared' | 'saved'> {
  const file = new File([blob], name, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (err) {
      // A cancelled share is a completed interaction, not a failure to fall
      // back from — re-downloading behind the user's back would be worse.
      if (err instanceof Error && err.name === 'AbortError') return 'shared';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'saved';
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
        active
          ? 'bg-indigo-600 border-indigo-600 text-white'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400'
      }`}
    >
      {children}
    </button>
  );
}

const splitHint: Record<SplitMode, string> = {
  section:
    'Nothing is marked as a section yet. Select a node on the map and tap Section to make it a page — or split by branches for now.',
  branch: 'This map has no top-level branches yet.',
  label: 'No nodes in this map carry a label yet.',
};

const LAYOUT_BLURB: Record<PdfLayoutKind, string> = {
  overview: 'The whole map on one page, with wide margins to write in.',
  roomy: 'The map first, then a page per branch with a ruled lane beside every node.',
  worksheet: 'No picture — every node as a heading over a block of ruled space.',
};

function ExportSheet({
  map,
  lectureFilter,
  focusId,
  focusTitle,
  onClose,
}: {
  map: MindMap;
  /** Whatever the canvas is filtered to, offered as the export's default —
   *  if you filtered down to one lecture and then hit Export, printing the
   *  whole course is not what you meant. */
  lectureFilter: string | null;
  /** Likewise for focus: exporting from inside a focused branch almost
   *  always means that branch, not the course it belongs to. */
  focusId: string | null;
  focusTitle: string | null;
  onClose: () => void;
}) {
  const [opts, setOpts] = useState<MindMapPdfOptions>(() => ({
    ...loadPdfPrefs(),
    lectureId: lectureFilter ?? undefined,
    rootId: focusId ?? undefined,
  }));
  const [status, setStatus] = useState<string | null>(null);

  const labelsInMap = useMemo(() => {
    const seen = new Set<string>();
    for (const n of map.nodes) {
      const t = tagOf(n);
      if (t) seen.add(t);
    }
    return Array.from(seen).sort();
  }, [map.nodes]);

  const set = (patch: Partial<MindMapPdfOptions>) => {
    const next = { ...opts, ...patch };
    setOpts(next);
    try {
      // The lecture slice is a decision about this one export, not a
      // preference — remembering it would silently truncate the next print.
      // Neither the slice nor the focus is a preference — both are
      // decisions about this one export, and remembering either would
      // silently truncate the next print.
      const { lectureId: _slice, rootId: _root, ...durable } = next;
      void _slice;
      void _root;
      localStorage.setItem(PDF_PREFS_KEY, JSON.stringify(durable));
    } catch {
      // A device that will not persist the preference still exports fine.
    }
  };

  // Building is cheap and pure, so the sheet can just show the real page
  // count rather than an estimate that could disagree with the file.
  const built = useMemo(() => buildMindMapPdf(map, opts), [map, opts]);

  // How many note pages the chosen split actually produces. Zero is worth
  // saying out loud — "Sections" on a map with nothing marked would
  // otherwise silently print an overview and stop.
  const unitCount = useMemo(() => {
    const scoped = opts.rootId
      ? map.nodes
          .filter((n) => subtreeIds(map.nodes, opts.rootId!).has(n.id))
          .map((n) => (n.id === opts.rootId ? { ...n, parentId: null } : n))
      : map.nodes;
    return pageUnits(scoped, opts.splitBy ?? 'section').length;
  }, [map.nodes, opts.splitBy, opts.rootId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
              Export
            </div>
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
              {map.title}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {focusId && focusTitle && (
          <>
            <div className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mb-1.5">
              What to print
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              <Pill active={!!opts.rootId} onClick={() => set({ rootId: focusId })}>
                {focusTitle}
              </Pill>
              <Pill active={!opts.rootId} onClick={() => set({ rootId: undefined })}>
                Whole map
              </Pill>
            </div>
          </>
        )}

        <div className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mb-1.5">
          Layout
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pill active={opts.layout === 'overview'} onClick={() => set({ layout: 'overview' })}>
            Overview
          </Pill>
          <Pill active={opts.layout === 'roomy'} onClick={() => set({ layout: 'roomy' })}>
            Roomy map
          </Pill>
          <Pill active={opts.layout === 'worksheet'} onClick={() => set({ layout: 'worksheet' })}>
            Worksheet
          </Pill>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
          {LAYOUT_BLURB[opts.layout]}
        </p>

        {opts.layout === 'roomy' && (
          <>
            <div className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mt-4 mb-1.5">
              Split pages by
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['section', 'branch', 'label'] as SplitMode[]).map((m) => (
                <Pill
                  key={m}
                  active={(opts.splitBy ?? 'section') === m}
                  onClick={() => set({ splitBy: m })}
                >
                  {m === 'section' ? 'Sections' : m === 'branch' ? 'Top-level branches' : 'Labels'}
                </Pill>
              ))}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mt-4 mb-1.5">
              Writing pages
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['outline', 'map'] as PdfNodeStyle[]).map((st) => (
                <Pill
                  key={st}
                  active={(opts.nodeStyle ?? 'outline') === st}
                  onClick={() => set({ nodeStyle: st })}
                >
                  {st === 'outline' ? 'Indented outline' : 'Map'}
                </Pill>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
              {(opts.nodeStyle ?? 'outline') === 'outline'
                ? 'Full-width rows at full size — nothing gets cut off however deep the branch goes. The map picture stays on page 1.'
                : 'The branch drawn as a tree beside the writing column. Deeper branches have to shrink to fit, so long labels can still be tight.'}
            </p>

            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
              {unitCount === 0
                ? splitHint[opts.splitBy ?? 'section']
                : `${unitCount} page${unitCount === 1 ? '' : 's'} of note space, one per ${
                    (opts.splitBy ?? 'section') === 'section'
                      ? 'section'
                      : (opts.splitBy ?? 'section') === 'branch'
                        ? 'top-level branch'
                        : 'label'
                  }.`}
            </p>
          </>
        )}

        <div className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mt-4 mb-1.5">
          Paper
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['letter', 'a4', 'ipad', 'fit'] as PdfPaper[]).map((p) => (
            <Pill key={p} active={opts.paper === p} onClick={() => set({ paper: p })}>
              {PAPER_LABELS[p]}
            </Pill>
          ))}
          {opts.paper !== 'fit' && (
            <>
              <span className="w-px bg-gray-200 dark:bg-gray-700 mx-1" />
              <Pill active={!opts.landscape} onClick={() => set({ landscape: false })}>
                Portrait
              </Pill>
              <Pill active={opts.landscape} onClick={() => set({ landscape: true })}>
                Landscape
              </Pill>
            </>
          )}
        </div>
        {opts.paper === 'fit' && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
            One page, {(built.pageW / 72).toFixed(0)} × {(built.pageH / 72).toFixed(0)} inches — as
            large as the map needs, so nothing is scaled down, cut off or shrunk. Built for
            pinching around on a tablet rather than for a printer. Collapse a level or two first
            if that is bigger than you want.
          </p>
        )}

        {labelsInMap.length > 0 && (
          <>
            <div className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mt-4 mb-1.5">
              Include
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Pill active={!opts.lectureId} onClick={() => set({ lectureId: undefined })}>
                Whole map
              </Pill>
              {labelsInMap.map((l) => (
                <Pill key={l} active={opts.lectureId === l} onClick={() => set({ lectureId: l })}>
                  {l}
                </Pill>
              ))}
            </div>
            {opts.lectureId && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                Only nodes with this label, plus the branches above them so you can still see
                where it sits in the tree.
              </p>
            )}
          </>
        )}

        <div className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mt-4 mb-1.5">
          Writing guides
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['ruled', 'dots', 'blank'] as PdfGuides[]).map((g) => (
            <Pill key={g} active={opts.guides === g} onClick={() => set({ guides: g })}>
              {g === 'ruled' ? 'Ruled' : g === 'dots' ? 'Dot grid' : 'Blank'}
            </Pill>
          ))}
        </div>

        <button
          onClick={async () => {
            const slice = opts.lectureId;
            const scoped = opts.rootId && focusTitle ? { ...map, title: focusTitle } : map;
            const how = await deliverPdf(built.blob, pdfFileName(scoped, slice));
            setStatus(how === 'shared' ? 'Sent to the share sheet' : 'Saved to your downloads');
            setTimeout(() => setStatus(null), 2600);
          }}
          className="w-full mt-5 px-4 py-3 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors"
        >
          Save PDF · {built.pages} page{built.pages === 1 ? '' : 's'}
        </button>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 text-center leading-relaxed">
          On an iPad, this opens the share sheet — send it straight to GoodNotes or Notability.
        </p>

        <div className="border-t border-gray-100 dark:border-gray-800 mt-4 pt-4">
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(toOutline(map.nodes));
                setStatus('Outline copied');
              } catch {
                setStatus('Could not copy');
              }
              setTimeout(() => setStatus(null), 2600);
            }}
            className="w-full px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-indigo-400 transition-colors"
          >
            Copy as markdown outline
          </button>
        </div>

        {status && (
          <div className="text-xs text-center text-indigo-600 dark:text-indigo-400 mt-3 font-medium">
            {status}
          </div>
        )}
      </div>
    </div>
  );
}


function sectionCount(m: MindMap): number {
  return m.nodes.filter((n) => n.section).length;
}

/** Fold one map into another. The source's root becomes a section under the
 *  node you pick, which is almost always what you want: a lecture map turned
 *  into a lecture-shaped section of the course tree. */
function GraftSheet({
  source,
  maps,
  onClose,
  onGraft,
}: {
  source: MindMap;
  maps: MindMap[];
  onClose: () => void;
  onGraft: (targetId: string, parentId: string) => void;
}) {
  const [targetId, setTargetId] = useState<string>(maps[0]?.id ?? '');
  const target = maps.find((m) => m.id === targetId) ?? null;
  const [parentId, setParentId] = useState<string>('');
  const depths = useMemo(() => (target ? depthsOf(target.nodes) : new Map<string, number>()), [target]);
  const parent = parentId || target?.nodes.find((n) => n.parentId === null)?.id || '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
          Move into another map
        </div>
        <div className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1 truncate">
          {source.title}
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
          Its {source.nodes.length} node{source.nodes.length === 1 ? '' : 's'} move across and become a
          section. This map is then deleted — nothing is copied, so nothing can drift out of step.
        </p>

        <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1">
          Into
        </div>
        <select
          value={targetId}
          onChange={(e) => { setTargetId(e.target.value); setParentId(''); }}
          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 mb-3"
        >
          {maps.map((m) => (
            <option key={m.id} value={m.id}>{m.title}</option>
          ))}
        </select>

        <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1">
          Under which node
        </div>
        <select
          value={parent}
          onChange={(e) => setParentId(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        >
          {(target?.nodes ?? []).map((n) => (
            <option key={n.id} value={n.id}>
              {'\u00a0\u00a0'.repeat(depths.get(n.id) ?? 0)}
              {n.text || 'untitled'}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2 mt-5">
          <button
            onClick={() => target && onGraft(target.id, parent)}
            disabled={!target || !parent}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 dark:disabled:bg-gray-800 transition-colors"
          >
            Move it
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/** Relative time, because "14 minutes ago" is the question you are actually
 *  asking of a restore point. */
function ago(iso: string, now: number): string {
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function HistorySheet({
  mapId,
  currentCount,
  onClose,
  onRestore,
}: {
  mapId: string;
  currentCount: number;
  onClose: () => void;
  onRestore: (snap: MapSnapshot) => void;
}) {
  // Read once on open. The list is a point-in-time view and re-reading it on
  // every render would also mean reading localStorage during render.
  const [snaps] = useState<MapSnapshot[]>(() => snapshotsFor(mapId));
  const [now] = useState(() => Date.now());

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-1">
          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
              Version history
            </div>
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {currentCount} node{currentCount === 1 ? '' : 's'} right now
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
          Kept on this device only, so it survives a reload — and survives the cloud copy being
          overwritten. Restoring is itself undoable.
        </p>

        {snaps.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl px-4 py-6 text-center">
            <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-snug">
              No restore points yet. One is written before anything destructive, and every few
              minutes while you work.
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {snaps.map((s) => {
              const delta = s.nodes.length - currentCount;
              return (
                <li key={s.at}>
                  <button
                    onClick={() => {
                      if (confirm(`Restore this map to its state ${ago(s.at, now)}?`)) onRestore(s);
                    }}
                    className="w-full text-left bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-indigo-300 dark:hover:border-indigo-700 rounded-xl px-3 py-2.5 transition-colors"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                        {ago(s.at, now)}
                      </span>
                      <span className="text-[11px] text-gray-400 dark:text-gray-500">
                        {s.nodes.length} node{s.nodes.length === 1 ? '' : 's'}
                        {delta > 0 ? ` · ${delta} more than now` : delta < 0 ? ` · ${-delta} fewer` : ''}
                      </span>
                    </div>
                    {s.reason && s.reason !== 'autosave' && (
                      <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                        {s.reason}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Maps whose history outlived them. A deleted map is not gone until its
 *  restore points are, so the list offers them back rather than leaving the
 *  only trace in localStorage where nothing can reach it. */
function RecoverableMaps({
  liveIds,
  onRestore,
  onDiscard,
}: {
  liveIds: Set<string>;
  onRestore: (mapId: string, snap: MapSnapshot) => void;
  onDiscard: (mapId: string) => void;
}) {
  const [orphans, setOrphans] = useState(() => orphanedSnapshots(liveIds));
  const [now] = useState(() => Date.now());
  if (orphans.length === 0) return null;

  return (
    <div className="border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 rounded-2xl px-3 py-3">
      <div className="text-[11px] uppercase tracking-wider font-bold text-amber-700 dark:text-amber-400">
        Deleted, but recoverable
      </div>
      <ul className="mt-2 space-y-1.5">
        {orphans.map(({ mapId, snaps }) => (
          <li key={mapId} className="flex items-center gap-2">
            <button
              onClick={() => onRestore(mapId, snaps[0])}
              className="flex-1 min-w-0 text-left bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2 hover:border-amber-400"
            >
              <div className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate">
                {snaps[0].title}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                {snaps[0].nodes.length} nodes · {ago(snaps[0].at, now)}
              </div>
            </button>
            <button
              onClick={() => {
                if (!confirm(`Forget “${snaps[0].title}” for good? This cannot be undone.`)) return;
                onDiscard(mapId);
                setOrphans((prev) => prev.filter((o) => o.mapId !== mapId));
              }}
              className="text-[10px] uppercase tracking-wider font-bold text-amber-600/60 dark:text-amber-500/60 hover:text-red-500 shrink-0 px-1"
            >
              Forget
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
