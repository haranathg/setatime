import { useMemo, useState } from 'react';
import type { NorthStar, BasicIndicator, BasicLog, Target, TargetStatus } from '../types';
import {
  STAR_COLORS,
  MAX_ACTIVE_STARS,
  MAX_ACTIVE_TARGETS_PER_STAR,
  colorFor,
  type NewStarInput,
} from '../hooks/useNorthStars';
import { IndicatorIcon } from './IndicatorIcons';

interface NorthStarsViewProps {
  stars: NorthStar[];
  indicators: BasicIndicator[];
  logs: BasicLog[];
  initialFocusId?: string | null;
  onConsumedInitialFocusId?: () => void;
  onAddStar: (input: NewStarInput) => NorthStar | null;
  onUpdateStar: (id: string, patch: Partial<Omit<NorthStar, 'id' | 'createdAt'>>) => void;
  onArchiveStar: (id: string) => void;
  onUnarchiveStar: (id: string) => void;
  onDeleteStar: (id: string) => void;
  onToggleIndicatorStar: (indicatorId: string, starId: string) => void;
  onAddTarget: (starId: string, title: string) => Target | null;
  onUpdateTarget: (starId: string, targetId: string, patch: Partial<Omit<Target, 'id' | 'createdAt'>>) => void;
  onSetTargetStatus: (starId: string, targetId: string, status: TargetStatus) => void;
  onDeleteTarget: (starId: string, targetId: string) => void;
  onSetNextStep: (starId: string, targetId: string, text: string) => void;
  onScheduleThis: (prefill: { taskName?: string; time?: string; dateKey?: string }) => void;
  onSendToDump: (label: string) => string;
}

export default function NorthStarsView({
  stars,
  indicators,
  logs,
  initialFocusId,
  onConsumedInitialFocusId,
  onAddStar,
  onUpdateStar,
  onArchiveStar,
  onUnarchiveStar,
  onDeleteStar,
  onToggleIndicatorStar,
  onAddTarget,
  onUpdateTarget,
  onSetTargetStatus,
  onDeleteTarget,
  onSetNextStep,
  onScheduleThis,
  onSendToDump,
}: NorthStarsViewProps) {
  const active = stars.filter((s) => !s.archivedAt);
  const archived = stars.filter((s) => !!s.archivedAt);

  const [addingOpen, setAddingOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [taggingForId, setTaggingForId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // If we were jumped here focused on a specific star, expand it once.
  useMemo(() => {
    if (initialFocusId) {
      setEditingId(initialFocusId);
      onConsumedInitialFocusId?.();
    }
    // one-shot on mount by design
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFocusId]);

  return (
    <div className="flex-1 overflow-y-auto bg-[#fbfaf7]">
      <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
        <header className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">North Stars</h1>
            <p className="text-sm text-gray-500 mt-1 leading-snug">
              1–3 long-term anchors that steer the small daily moves. Everything else attributes to them.
            </p>
          </div>
          {active.length < MAX_ACTIVE_STARS && !addingOpen && (
            <button
              onClick={() => setAddingOpen(true)}
              className="flex-shrink-0 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-colors"
            >
              + Add star
            </button>
          )}
        </header>

        {addingOpen && (
          <StarEditor
            existing={null}
            active={active}
            onCancel={() => setAddingOpen(false)}
            onSubmit={(input) => {
              const s = onAddStar(input);
              if (s) setAddingOpen(false);
            }}
          />
        )}

        {active.length === 0 && !addingOpen && (
          <EmptyStars onStart={() => setAddingOpen(true)} />
        )}

        <div className="space-y-3">
          {active.map((star) => (
            <StarCard
              key={star.id}
              star={star}
              indicators={indicators}
              logs={logs}
              editing={editingId === star.id}
              tagging={taggingForId === star.id}
              onEdit={() => setEditingId(star.id)}
              onCancelEdit={() => setEditingId(null)}
              onOpenTagging={() => setTaggingForId(star.id)}
              onCloseTagging={() => setTaggingForId(null)}
              onUpdate={(patch) => {
                onUpdateStar(star.id, patch);
                setEditingId(null);
              }}
              onArchive={() => onArchiveStar(star.id)}
              onToggleIndicator={(indId) => onToggleIndicatorStar(indId, star.id)}
              onAddTarget={(title) => onAddTarget(star.id, title)}
              onUpdateTarget={(targetId, patch) => onUpdateTarget(star.id, targetId, patch)}
              onSetTargetStatus={(targetId, status) => onSetTargetStatus(star.id, targetId, status)}
              onDeleteTarget={(targetId) => onDeleteTarget(star.id, targetId)}
              onSetNextStep={(targetId, text) => onSetNextStep(star.id, targetId, text)}
              onScheduleThis={onScheduleThis}
              onSendToDump={onSendToDump}
            />
          ))}
        </div>

        {archived.length > 0 && (
          <section>
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="text-[11px] uppercase tracking-wider font-bold text-gray-400 hover:text-gray-700"
            >
              {showArchived ? '▾' : '▸'} Archived · {archived.length}
            </button>
            {showArchived && (
              <ul className="mt-2 space-y-2">
                {archived.map((star) => {
                  const c = colorFor(star.color);
                  return (
                    <li
                      key={star.id}
                      className="bg-white border border-gray-200 rounded-xl px-4 py-2 flex items-center gap-3"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: c.hex }}
                      />
                      <span className="flex-1 min-w-0 text-sm text-gray-700 truncate">{star.name}</span>
                      {active.length < MAX_ACTIVE_STARS ? (
                        <button
                          onClick={() => onUnarchiveStar(star.id)}
                          className="text-[11px] uppercase tracking-wider font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                          Restore
                        </button>
                      ) : (
                        <span className="text-[10px] text-gray-400">3 active</span>
                      )}
                      <button
                        onClick={() => {
                          if (confirm(`Permanently delete "${star.name}"? Its tags on spirals will be dropped.`)) {
                            onDeleteStar(star.id);
                          }
                        }}
                        className="text-[16px] leading-none text-gray-300 hover:text-red-500"
                        title="Permanently delete"
                      >
                        &times;
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

// ---------- Empty state ----------

function EmptyStars({ onStart }: { onStart: () => void }) {
  return (
    <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl px-6 py-10 text-center">
      <h2 className="text-base font-semibold text-gray-900">Pick your anchors</h2>
      <p className="text-sm text-gray-500 mt-2 max-w-lg mx-auto leading-relaxed">
        Research on goal pursuit is consistent: 1–3 concurrent anchors beats more. Values-direction
        ("live in a way that respects my body") tends to outlast outcome targets ("lose 10 lbs")
        because it survives setbacks. Start with one; add up to three.
      </p>
      <button
        onClick={onStart}
        className="mt-4 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors"
      >
        Add your first star
      </button>
    </div>
  );
}

// ---------- Star card ----------

function StarCard({
  star,
  indicators,
  logs,
  editing,
  tagging,
  onEdit,
  onCancelEdit,
  onOpenTagging,
  onCloseTagging,
  onUpdate,
  onArchive,
  onToggleIndicator,
  onAddTarget,
  onUpdateTarget,
  onSetTargetStatus,
  onDeleteTarget,
  onSetNextStep,
  onScheduleThis,
  onSendToDump,
}: {
  star: NorthStar;
  indicators: BasicIndicator[];
  logs: BasicLog[];
  editing: boolean;
  tagging: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onOpenTagging: () => void;
  onCloseTagging: () => void;
  onUpdate: (patch: Partial<Omit<NorthStar, 'id' | 'createdAt'>>) => void;
  onArchive: () => void;
  onToggleIndicator: (indId: string) => void;
  onAddTarget: (title: string) => Target | null;
  onUpdateTarget: (targetId: string, patch: Partial<Omit<Target, 'id' | 'createdAt'>>) => void;
  onSetTargetStatus: (targetId: string, status: TargetStatus) => void;
  onDeleteTarget: (targetId: string) => void;
  onSetNextStep: (targetId: string, text: string) => void;
  onScheduleThis: (prefill: { taskName?: string; time?: string; dateKey?: string }) => void;
  onSendToDump: (label: string) => string;
}) {
  const c = colorFor(star.color);
  const tagged = indicators.filter(
    (i) => (i.northStarIds ?? []).includes(star.id) && i.enabled
  );

  // Log counts over the last 7 days per tagged spiral.
  const nowMs = Date.now();
  const weekAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;
  const perSpiralWeekCount = new Map<string, number>();
  for (const l of logs) {
    const t = new Date(l.loggedAt).getTime();
    if (t < weekAgoMs) continue;
    perSpiralWeekCount.set(l.indicatorId, (perSpiralWeekCount.get(l.indicatorId) || 0) + 1);
  }
  const totalWeekLogs = tagged.reduce((sum, i) => sum + (perSpiralWeekCount.get(i.id) || 0), 0);

  if (editing) {
    return (
      <StarEditor
        existing={star}
        active={[]}
        onCancel={onCancelEdit}
        onSubmit={(input) => onUpdate(input)}
      />
    );
  }

  return (
    <section
      className={`bg-white border border-gray-200 rounded-2xl overflow-hidden`}
      style={{ boxShadow: `inset 4px 0 0 0 ${c.hex}` }}
    >
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 tracking-tight">{star.name}</h2>
            {star.direction && (
              <p className="text-sm text-gray-500 mt-0.5 italic leading-snug">{star.direction}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onEdit}
              className="text-[11px] uppercase tracking-wider text-gray-500 hover:text-gray-800"
            >
              Edit
            </button>
            <button
              onClick={() => {
                if (confirm(`Archive "${star.name}"? Its spirals stay but stop attributing to it.`)) onArchive();
              }}
              className="text-[11px] uppercase tracking-wider text-gray-400 hover:text-red-500"
            >
              Archive
            </button>
          </div>
        </div>
        {star.why && (
          <p className="text-sm text-gray-700 mt-2 leading-relaxed whitespace-pre-wrap">{star.why}</p>
        )}
      </div>

      {/* Targets — the operationalization ladder */}
      <TargetsSection
        star={star}
        onAddTarget={onAddTarget}
        onUpdateTarget={onUpdateTarget}
        onSetTargetStatus={onSetTargetStatus}
        onDeleteTarget={onDeleteTarget}
        onSetNextStep={onSetNextStep}
        onScheduleThis={onScheduleThis}
        onSendToDump={onSendToDump}
      />

      {/* Attributed spirals */}
      <div className="px-5 pb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
            Spirals feeding this star · {tagged.length}
          </div>
          <div className="flex items-center gap-3">
            {tagged.length > 0 && (
              <span className={`text-[10px] uppercase tracking-wider font-semibold ${c.text}`}>
                {totalWeekLogs} logs this week
              </span>
            )}
            <button
              onClick={tagging ? onCloseTagging : onOpenTagging}
              className="text-[11px] uppercase tracking-wider font-semibold text-indigo-600 hover:text-indigo-700"
            >
              {tagging ? 'Done' : 'Manage tags ›'}
            </button>
          </div>
        </div>

        {tagging ? (
          <ul className="space-y-1">
            {indicators.map((ind) => {
              const on = (ind.northStarIds ?? []).includes(star.id);
              return (
                <li key={ind.id}>
                  <button
                    onClick={() => onToggleIndicator(ind.id)}
                    className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-lg text-left transition-colors ${
                      on ? `${c.bg} ${c.ring} ring-1` : 'bg-white border border-gray-200 hover:border-indigo-200'
                    }`}
                  >
                    <span className="w-6 h-6 flex items-center justify-center text-gray-600">
                      <IndicatorIcon indicator={ind} size={18} />
                    </span>
                    <span className="flex-1 min-w-0 text-sm text-gray-900 truncate">{ind.name}</span>
                    <span
                      className={`text-[10px] uppercase tracking-wider font-bold ${
                        on ? c.text : 'text-gray-400'
                      }`}
                    >
                      {on ? 'Tagged' : 'Tap to tag'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : tagged.length === 0 ? (
          <button
            onClick={onOpenTagging}
            className="w-full text-left px-3 py-2.5 border-2 border-dashed border-gray-200 hover:border-indigo-300 rounded-xl text-[12px] text-gray-500 hover:text-indigo-700 transition-colors"
          >
            No spirals attributed yet. Tap to tag existing spirals to this star.
          </button>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {tagged.map((ind) => {
              const wk = perSpiralWeekCount.get(ind.id) || 0;
              return (
                <li
                  key={ind.id}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg"
                >
                  <span className="w-5 h-5 flex items-center justify-center text-gray-600">
                    <IndicatorIcon indicator={ind} size={16} />
                  </span>
                  <span className="flex-1 min-w-0 text-sm text-gray-800 truncate">{ind.name}</span>
                  <span className="text-[10px] font-mono text-gray-500">{wk} / wk</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

// ---------- Star editor (add or edit) ----------

function StarEditor({
  existing,
  active,
  onCancel,
  onSubmit,
}: {
  existing: NorthStar | null;
  active: NorthStar[];
  onCancel: () => void;
  onSubmit: (input: NewStarInput) => void;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [why, setWhy] = useState(existing?.why ?? '');
  const [direction, setDirection] = useState(existing?.direction ?? '');
  const usedColors = new Set(active.filter((s) => s.id !== existing?.id).map((s) => s.color));
  const initialColor =
    existing?.color ?? STAR_COLORS.find((c) => !usedColors.has(c.id))?.id ?? STAR_COLORS[0].id;
  const [color, setColor] = useState(initialColor);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({ name: trimmed, why: why.trim() || undefined, direction: direction.trim() || undefined, color });
  };

  const c = colorFor(color);

  return (
    <section
      className="bg-white border border-gray-200 rounded-2xl overflow-hidden"
      style={{ boxShadow: `inset 4px 0 0 0 ${c.hex}` }}
    >
      <div className="px-5 py-4 space-y-3">
        <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
          {existing ? 'Edit star' : 'New star'}
        </div>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='e.g. "Metabolic efficiency"'
          className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <textarea
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          placeholder='Optional direction · e.g. "live in a way that respects my body"'
          rows={2}
          className="w-full px-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 italic"
        />
        <textarea
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="Optional 'why' — what does this mean to you?"
          rows={3}
          className="w-full px-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 leading-relaxed"
        />
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1.5">
            Color
          </div>
          <div className="flex flex-wrap gap-2">
            {STAR_COLORS.map((sc) => {
              const isTaken = usedColors.has(sc.id) && color !== sc.id;
              return (
                <button
                  key={sc.id}
                  onClick={() => setColor(sc.id)}
                  disabled={isTaken}
                  className={`w-7 h-7 rounded-full transition-all ${
                    color === sc.id ? 'ring-4 ring-offset-2' : 'ring-1 ring-gray-200 hover:ring-gray-400'
                  } ${isTaken ? 'opacity-30 cursor-not-allowed' : ''}`}
                  style={{ backgroundColor: sc.hex, ...(color === sc.id ? { boxShadow: `0 0 0 2px ${sc.hex}` } : {}) }}
                  title={isTaken ? `${sc.label} · used by another star` : sc.label}
                />
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:cursor-not-allowed rounded-xl transition-colors"
          >
            {existing ? 'Save' : 'Add star'}
          </button>
        </div>
      </div>
    </section>
  );
}

// ---------- Targets section ----------
//
// The operationalization ladder for a star. Two levels of empty-state prompts:
//   Star with no targets → "What's a specific measurable target?"
//   Target with no next step → "What's the immediate next move?"
// Whatever the user types in "next step" converts to a real task with one tap
// via ↳ Schedule (calendar prefill) or ↗ Send to Dump. Converted tasks
// auto-prepend the target title so the dump/calendar entry carries the
// context of what it's for.

function TargetsSection({
  star,
  onAddTarget,
  onUpdateTarget,
  onSetTargetStatus,
  onDeleteTarget,
  onSetNextStep,
  onScheduleThis,
  onSendToDump,
}: {
  star: NorthStar;
  onAddTarget: (title: string) => Target | null;
  onUpdateTarget: (targetId: string, patch: Partial<Omit<Target, 'id' | 'createdAt'>>) => void;
  onSetTargetStatus: (targetId: string, status: TargetStatus) => void;
  onDeleteTarget: (targetId: string) => void;
  onSetNextStep: (targetId: string, text: string) => void;
  onScheduleThis: (prefill: { taskName?: string; time?: string; dateKey?: string }) => void;
  onSendToDump: (label: string) => string;
}) {
  const c = colorFor(star.color);
  const targets = star.targets ?? [];
  const active = targets.filter((t) => t.status === 'active');
  const achieved = targets.filter((t) => t.status === 'achieved');
  const abandoned = targets.filter((t) => t.status === 'abandoned');
  const [showHistory, setShowHistory] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [addingOpen, setAddingOpen] = useState(active.length === 0);
  const capReached = active.length >= MAX_ACTIVE_TARGETS_PER_STAR;

  const submitNew = () => {
    const t = onAddTarget(newTitle);
    if (t) {
      setNewTitle('');
      // Keep the add row open only when at zero to preserve the prompt state;
      // otherwise collapse so the user's focus moves to the new target row.
      setAddingOpen(active.length === 0);
    }
  };

  return (
    <div className="px-5 pb-4 border-t border-gray-100 pt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
          Targets · {active.length} / {MAX_ACTIVE_TARGETS_PER_STAR} active
        </div>
        {!addingOpen && !capReached && (
          <button
            onClick={() => setAddingOpen(true)}
            className={`text-[11px] uppercase tracking-wider font-semibold ${c.text} hover:opacity-80`}
          >
            + Add target
          </button>
        )}
      </div>

      {/* Active target list (empty state = prompt row) */}
      {active.length === 0 && !addingOpen && (
        <button
          onClick={() => setAddingOpen(true)}
          className="w-full text-left px-3 py-3 border-2 border-dashed border-gray-200 hover:border-indigo-300 rounded-xl text-[12px] text-gray-500 hover:text-indigo-700 transition-colors"
        >
          What's a specific, measurable target for this star? · e.g. "6:55 mile time"
        </button>
      )}

      <ul className="space-y-2">
        {active.map((t) => (
          <TargetRow
            key={t.id}
            target={t}
            star={star}
            onUpdate={(patch) => onUpdateTarget(t.id, patch)}
            onSetStatus={(status) => onSetTargetStatus(t.id, status)}
            onDelete={() => onDeleteTarget(t.id)}
            onSetNextStep={(text) => onSetNextStep(t.id, text)}
            onScheduleThis={onScheduleThis}
            onSendToDump={onSendToDump}
          />
        ))}
      </ul>

      {/* Add-target row */}
      {addingOpen && !capReached && (
        <div className="mt-2 flex items-center gap-2">
          <input
            autoFocus
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitNew()}
            placeholder='e.g. "6:55 mile time"'
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            onClick={submitNew}
            disabled={!newTitle.trim()}
            className="px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            Add
          </button>
          {active.length > 0 && (
            <button
              onClick={() => { setAddingOpen(false); setNewTitle(''); }}
              className="text-xs text-gray-500 hover:text-gray-800"
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {capReached && (
        <p className="text-[10px] text-gray-400 mt-2">
          At the {MAX_ACTIVE_TARGETS_PER_STAR}-active cap. Achieve or abandon one to add another.
        </p>
      )}

      {(achieved.length > 0 || abandoned.length > 0) && (
        <div className="mt-3">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-[10px] uppercase tracking-wider font-bold text-gray-400 hover:text-gray-700"
          >
            {showHistory ? '▾' : '▸'} History · {achieved.length} achieved · {abandoned.length} abandoned
          </button>
          {showHistory && (
            <ul className="mt-1.5 space-y-1">
              {[...achieved, ...abandoned].map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg text-[12px]"
                >
                  <span
                    className={`text-[9px] uppercase tracking-wider font-bold ${
                      t.status === 'achieved' ? 'text-emerald-700' : 'text-gray-400'
                    }`}
                  >
                    {t.status === 'achieved' ? '✓' : '×'}
                  </span>
                  <span className={`flex-1 min-w-0 truncate ${
                    t.status === 'achieved' ? 'text-gray-800' : 'text-gray-400 line-through'
                  }`}>
                    {t.title}
                  </span>
                  <button
                    onClick={() => onSetTargetStatus(t.id, 'active')}
                    className="text-[10px] uppercase tracking-wider font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    Reopen
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${t.title}"?`)) onDeleteTarget(t.id);
                    }}
                    className="text-[14px] leading-none text-gray-300 hover:text-red-500"
                    title="Delete"
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function TargetRow({
  target,
  star,
  onUpdate,
  onSetStatus,
  onDelete,
  onSetNextStep,
  onScheduleThis,
  onSendToDump,
}: {
  target: Target;
  star: NorthStar;
  onUpdate: (patch: Partial<Omit<Target, 'id' | 'createdAt'>>) => void;
  onSetStatus: (status: TargetStatus) => void;
  onDelete: () => void;
  onSetNextStep: (text: string) => void;
  onScheduleThis: (prefill: { taskName?: string; time?: string; dateKey?: string }) => void;
  onSendToDump: (label: string) => string;
}) {
  const c = colorFor(star.color);
  const [draftStep, setDraftStep] = useState(target.nextStep ?? '');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(target.title);
  const [editingDate, setEditingDate] = useState(false);

  const persistStep = () => {
    const trimmed = draftStep.trim();
    if ((trimmed || undefined) === target.nextStep) return;
    onSetNextStep(draftStep);
  };

  // Convert helpers: give the resulting task/label the target's context so the
  // dump/calendar entry carries "why" with it — you'll see "toward 6:55 mile:
  // do a tempo run" not just "do a tempo run."
  const contextLabel = (step: string) => `toward ${target.title}: ${step.trim()}`;

  const scheduleStep = () => {
    const step = draftStep.trim();
    if (!step) return;
    onScheduleThis({ taskName: contextLabel(step) });
    setDraftStep('');
    onSetNextStep('');
  };

  const dumpStep = () => {
    const step = draftStep.trim();
    if (!step) return;
    onSendToDump(contextLabel(step));
    setDraftStep('');
    onSetNextStep('');
  };

  return (
    <li className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2">
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: c.hex }}
        />
        {editingTitle ? (
          <input
            autoFocus
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              const t = titleDraft.trim();
              if (t && t !== target.title) onUpdate({ title: t });
              setEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const t = titleDraft.trim();
                if (t && t !== target.title) onUpdate({ title: t });
                setEditingTitle(false);
              }
              if (e.key === 'Escape') {
                setTitleDraft(target.title);
                setEditingTitle(false);
              }
            }}
            className="flex-1 min-w-0 px-2 py-0.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        ) : (
          <button
            onClick={() => { setTitleDraft(target.title); setEditingTitle(true); }}
            className="flex-1 min-w-0 text-left text-sm font-medium text-gray-900 truncate hover:text-indigo-700"
          >
            {target.title}
          </button>
        )}
        {editingDate ? (
          <input
            autoFocus
            type="date"
            value={target.targetDate ?? ''}
            onChange={(e) => onUpdate({ targetDate: e.target.value || undefined })}
            onBlur={() => setEditingDate(false)}
            className="px-2 py-0.5 text-xs font-mono border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        ) : (
          <button
            onClick={() => setEditingDate(true)}
            className={`text-[10px] uppercase tracking-wider font-semibold flex-shrink-0 ${
              target.targetDate ? c.text : 'text-gray-300 hover:text-gray-500'
            }`}
            title={target.targetDate ? 'Change target date' : 'Add a target date'}
          >
            {target.targetDate ? formatShortDate(target.targetDate) : '+ Date'}
          </button>
        )}
        <button
          onClick={() => onSetStatus('achieved')}
          className="text-[14px] leading-none text-gray-300 hover:text-emerald-500 px-1 flex-shrink-0"
          title="Mark achieved"
        >
          ✓
        </button>
        <button
          onClick={() => {
            if (confirm(`Delete target "${target.title}"?`)) onDelete();
          }}
          className="text-[14px] leading-none text-gray-300 hover:text-red-500 px-1 flex-shrink-0"
          title="Delete"
        >
          &times;
        </button>
      </div>

      {/* Next step prompt */}
      <div className="px-3 pb-2 pt-1 border-t border-gray-50 bg-gray-50/40">
        <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">
          Next step
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={draftStep}
            onChange={(e) => setDraftStep(e.target.value)}
            onBlur={persistStep}
            onKeyDown={(e) => e.key === 'Enter' && scheduleStep()}
            placeholder="What's the immediate next move?"
            className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
          />
          <button
            onClick={scheduleStep}
            disabled={!draftStep.trim()}
            className="flex-shrink-0 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:bg-gray-200 disabled:cursor-not-allowed rounded-md transition-colors"
            title="Jump to the calendar with this step pre-filled"
          >
            ↳ Schedule
          </button>
          <button
            onClick={dumpStep}
            disabled={!draftStep.trim()}
            className="flex-shrink-0 px-2.5 py-1.5 text-[11px] font-semibold text-[#1a4a73] bg-white border border-[#1a4a73] hover:bg-[#e8eef4] disabled:opacity-30 disabled:cursor-not-allowed rounded-md transition-colors"
            title="Send this step to the Hold"
          >
            ↗ Hold
          </button>
        </div>
      </div>
    </li>
  );
}

function formatShortDate(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
