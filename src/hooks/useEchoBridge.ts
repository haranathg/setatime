import { useEffect, useState } from 'react';
import type { EchoPayload } from '../utils/echoImport';

/** What the extension posts into the page. */
export const ECHO_MESSAGE = 'k3h-echo-data';

/**
 * Receive a push from Echo Lecture Finder.
 *
 * Its content script already runs on this origin, so it can hand data
 * straight to the page — no file, no clipboard, and above all no secret key
 * in a second place.
 *
 * Nothing is written on arrival. The payload is held and offered, because
 * anything running on the page could post this message and because an import
 * that happened silently would be impossible to notice or undo.
 */
export function useEchoBridge() {
  const [payload, setPayload] = useState<EchoPayload | null>(null);
  const [at, setAt] = useState<number | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // Only this window, only this origin: a message from a frame or another
      // origin has no business writing to the lecture list.
      if (e.source !== window || e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; payload?: EchoPayload } | null;
      if (!data || data.type !== ECHO_MESSAGE || !data.payload) return;
      const p = data.payload;
      if (typeof p !== 'object') return;
      setPayload(p);
      setAt(Date.now());
    };
    window.addEventListener('message', onMessage);
    // Tell the extension the page is ready, so a tab opened after it had data
    // still gets it rather than waiting for the next refresh.
    window.postMessage({ type: 'k3h-echo-ready' }, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const count = payload?.lectures ? Object.keys(payload.lectures).length : 0;
  const exams = payload?.lists ? Object.keys(payload.lists).length : 0;

  return { payload, at, count, exams, dismiss: () => setPayload(null) };
}
