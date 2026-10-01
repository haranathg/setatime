import type { ActivateKey } from '../types';
import LayoutEditor, { type LayoutItemMeta } from './LayoutEditor';

// The strategy menu's own labels. Shares LayoutEditor with Arrange Today, so
// reordering works identically in both places.

const ACTIVATE_META: Record<ActivateKey, LayoutItemMeta> = {
  stuck:    { label: 'Stuck?',                 hint: 'Start ridiculously small, using your reminder' },
  start:    { label: 'Start a session',        hint: 'Underway — 15 minutes on one thing' },
  knockOne: { label: 'Knock one out',          hint: 'A small task picked from your hold' },
  triage:   { label: 'Triage the dump',        hint: 'One card at a time' },
  reflect:  { label: 'Weekly reflection',      hint: 'The SOAP chart note' },
  predict:  { label: 'Make a prediction',      hint: 'A small bet, in the Lab' },
  maps:     { label: 'Map a lecture',          hint: 'Mind maps — build or fill in a tree' },
  sort:     { label: "Sort what's on my mind", hint: 'Circle of Control, in Compass' },
  breathe:  { label: 'Breathe',                hint: 'Box breathing, in Grounding' },
};

export default function ActivateLayoutEditor({
  order,
  isTucked,
  onMove,
  onPinToTop,
  onToggleTucked,
  onReset,
  onClose,
}: {
  order: ActivateKey[];
  isTucked: (key: ActivateKey) => boolean;
  onMove: (key: ActivateKey, delta: -1 | 1) => void;
  onPinToTop: (key: ActivateKey) => void;
  onToggleTucked: (key: ActivateKey) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <LayoutEditor
      title="Arrange Activate now"
      intro="Put what you actually reach for at the top, and tuck the rest behind “more strategies”."
      tuckedNoun={{ tucked: 'Behind “more strategies”', shown: 'Shown in the menu' }}
      resetPrompt="Put the strategy menu back to the original order?"
      resetLabel="Reset menu"
      order={order}
      meta={ACTIVATE_META}
      isTucked={isTucked}
      onMove={onMove}
      onPinToTop={onPinToTop}
      onToggleTucked={onToggleTucked}
      onReset={onReset}
      onClose={onClose}
    />
  );
}
