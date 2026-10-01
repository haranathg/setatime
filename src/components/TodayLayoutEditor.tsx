import type { TodaySectionKey } from '../types';
import LayoutEditor, { type LayoutItemMeta } from './LayoutEditor';

// Today's own labels. The reordering behaviour itself lives in LayoutEditor,
// which the Activate now menu uses too.

const SECTION_META: Record<TodaySectionKey, LayoutItemMeta> = {
  activate:    { label: 'Activate now',   hint: 'The strategy menu and your reminder line' },
  projectsDue: { label: 'Coming due',     hint: 'Projects due within a week, or stalled' },
  block:       { label: "Now / next block", hint: 'All-day banner and the block you are in' },
  plan:        { label: "Today's 1/3/5",  hint: 'The day plan and your handwritten photo' },
  weekBoard:   { label: 'This week',      hint: 'The week board' },
  northStars:  { label: 'North Stars',    hint: 'Your long-term anchors' },
  stateLog:    { label: 'Log a moment',   hint: 'Window of tolerance, and your resets' },
  basics:      { label: 'Daily basics',   hint: 'Hydration, meals, sleep and the rest' },
  predictions: { label: 'Lab reflections', hint: 'Predictions waiting to be closed out' },
  agedDump:    { label: 'Aging in Hold',  hint: 'Captured tasks going stale' },
  pins:        { label: "Don't forget",   hint: 'Friction-free todos' },
  upNext:      { label: 'Up next',        hint: 'Later blocks today' },
};

export default function TodayLayoutEditor({
  order,
  isTucked,
  onMove,
  onPinToTop,
  onToggleTucked,
  onReset,
  onClose,
}: {
  order: TodaySectionKey[];
  isTucked: (key: TodaySectionKey) => boolean;
  onMove: (key: TodaySectionKey, delta: -1 | 1) => void;
  onPinToTop: (key: TodaySectionKey) => void;
  onToggleTucked: (key: TodaySectionKey) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <LayoutEditor
      title="Arrange Today"
      intro="Reorder, pin what you use most to the top, or tuck the rest behind “show more”."
      tuckedNoun={{ tucked: 'Behind “show more”', shown: 'Shown on Today' }}
      resetPrompt="Put Today back to the original order?"
      resetLabel="Reset order"
      order={order}
      meta={SECTION_META}
      isTucked={isTucked}
      onMove={onMove}
      onPinToTop={onPinToTop}
      onToggleTucked={onToggleTucked}
      onReset={onReset}
      onClose={onClose}
    />
  );
}
