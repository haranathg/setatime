import type { AppState } from '../types';
import { loadState, lastLocalWriteFailed } from '../utils/storage';

const SYNC_URL = import.meta.env.VITE_SYNC_API_URL || '/api/sync';
const SECRET_KEY_STORAGE = 'setatime_secret_key';

export function getSecretKey(): string {
  return localStorage.getItem(SECRET_KEY_STORAGE) || '';
}

export function setSecretKey(key: string): void {
  localStorage.setItem(SECRET_KEY_STORAGE, key);
  sessionStorage.removeItem('setatime_auth_hash');
  resetGate(key);
}

export function clearSecretKey(): void {
  localStorage.removeItem(SECRET_KEY_STORAGE);
  sessionStorage.removeItem('setatime_auth_hash');
  resetGate('');
}

export async function getAuthHashAsync(): Promise<string> {
  const key = getSecretKey();
  if (!key) return '';
  const cacheKey = 'setatime_auth_hash';
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) return cached;
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  sessionStorage.setItem(cacheKey, hash);
  return hash;
}

// ---------------------------------------------------------------------------
// The write gate
//
// Every slice hook does the same thing on mount: read localStorage, render it,
// then fetch the cloud copy and merge. Rendering flips that hook's `loaded`
// flag, which arms its debounced cloud save — so a save can fire ~1.5s after
// mount, *before* the cloud fetch has returned, pushing whatever localStorage
// happened to hold at that moment.
//
// On a device whose storage was cleared, or a freshly installed PWA, that is
// `{ blocks: [] }`. The bucket keeps one unversioned object per key, so the
// push is not a stale write — it is the data loss, with nothing to roll back
// to.
//
// The case that actually bites is a flaky connection rather than a slow one:
// the load fails (all 25 hooks swallow the error), the save 1.5s later
// succeeds, and the cloud copy is replaced by an empty one.
//
// So the rule is: no cloud write for a key until a cloud *read* of that key
// has succeeded. A read that returns nothing still counts — the Lambda maps
// NoSuchKey to `{ blocks: [] }` with a 200, so a genuinely new key opens the
// gate and a first device can still sync up. Only a failure to reach the
// object at all keeps it shut.
//
// Local saves are never gated. Work keeps landing in localStorage while the
// gate is shut, so nothing the user types is at risk — it just doesn't leave
// the device until we know what we would be overwriting.
// ---------------------------------------------------------------------------

export type SyncGateState =
  /** No read attempted yet for this key. Writes wait. */
  | 'idle'
  /** A read is in flight. Writes wait, and the last one is remembered. */
  | 'loading'
  /** A read succeeded. Writes go through. */
  | 'ready'
  /** A read failed and none has ever succeeded. Writes are refused. */
  | 'blocked';

export interface SyncStatus {
  state: SyncGateState;
  /** True when an edit is waiting for the gate to open. */
  deferred: boolean;
  /** Why the gate is shut, for the sync panel. */
  error: string | null;
}

interface Gate {
  key: string;
  state: SyncGateState;
  inflight: Promise<AppState> | null;
  cached: AppState | null;
  cachedAt: number;
  deferred: boolean;
  error: string | null;
}

/** How long a successful read is reused instead of refetched. Long enough to
 *  collapse the mount storm — 25 hooks asking for the same object — and short
 *  enough that a view mounted later still sees something current. */
const LOAD_CACHE_MS = 60_000;

const gate: Gate = {
  key: '',
  state: 'idle',
  inflight: null,
  cached: null,
  cachedAt: 0,
  deferred: false,
  error: null,
};

type Listener = (status: SyncStatus) => void;
const listeners = new Set<Listener>();

export function getSyncStatus(): SyncStatus {
  return { state: gate.state, deferred: gate.deferred, error: gate.error };
}

export function subscribeSyncStatus(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify(): void {
  const status = getSyncStatus();
  for (const fn of listeners) fn(status);
}

function resetGate(key: string): void {
  gate.key = key;
  gate.state = 'idle';
  gate.inflight = null;
  gate.cached = null;
  gate.cachedAt = 0;
  gate.deferred = false;
  gate.error = null;
  notify();
}

/** Point the gate at `key`, discarding anything known about a different one. */
function ensureKey(key: string): void {
  if (gate.key !== key) resetGate(key);
}

/** What to push. Every hook writes localStorage synchronously before arming
 *  its debounce, so localStorage is a superset of any one caller's payload —
 *  sending it stops one slice's in-flight save from reverting another's in the
 *  cloud. The caller's own payload is the fallback for the one case where
 *  localStorage is behind: its last write was rejected for quota. */
function freshestPayload(data: AppState): AppState {
  if (lastLocalWriteFailed()) return data;
  try {
    return loadState();
  } catch {
    return data;
  }
}

async function put(secretKey: string, data: AppState): Promise<void> {
  const response = await fetch(SYNC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'save', secretKey, data }),
  });

  if (!response.ok) {
    throw new Error('Failed to save to cloud');
  }
}

/** Read the cloud copy.
 *
 *  Shared by default: the first caller starts the request and the rest await
 *  the same promise, so a cold start makes one request rather than one per
 *  hook. `force` bypasses both the cache and the in-flight share, for an
 *  explicit refresh.
 *
 *  Succeeding opens the write gate and flushes any edit that was deferred
 *  while it was shut. Failing shuts the gate — unless it had already opened
 *  for this key, in which case one bad request is not a reason to stop
 *  syncing. */
export async function syncLoad(
  secretKey: string,
  opts?: { force?: boolean }
): Promise<AppState> {
  ensureKey(secretKey);

  if (!opts?.force) {
    if (gate.cached && Date.now() - gate.cachedAt < LOAD_CACHE_MS) return gate.cached;
    if (gate.inflight) return gate.inflight;
  }

  const hadOpened = gate.state === 'ready';
  if (!hadOpened) {
    gate.state = 'loading';
    gate.error = null;
    notify();
  }

  const request = (async (): Promise<AppState> => {
    const response = await fetch(SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'load', secretKey }),
    });

    if (!response.ok) {
      throw new Error('Failed to load from cloud');
    }

    return response.json();
  })();

  gate.inflight = request;

  try {
    const state = await request;
    gate.cached = state;
    gate.cachedAt = Date.now();
    gate.state = 'ready';
    gate.error = null;
    notify();
    await flushDeferred(secretKey);
    return state;
  } catch (err) {
    // A failure after the gate has already opened is just a failed request.
    // Only a key that has never been read successfully gets blocked.
    if (!hadOpened) {
      gate.state = 'blocked';
      gate.error = 'Could not read the cloud copy, so nothing is being sent up.';
      notify();
    }
    throw err;
  } finally {
    if (gate.inflight === request) gate.inflight = null;
  }
}

async function flushDeferred(secretKey: string): Promise<void> {
  if (!gate.deferred) return;
  gate.deferred = false;
  notify();
  try {
    await put(secretKey, freshestPayload(loadState()));
  } catch {
    // The hook that deferred this still has its own debounce running, and the
    // next edit pushes again. Re-flagging here would leave `deferred` stuck on
    // for a device that is simply offline.
  }
}

/** Write the whole state to the cloud, if the gate is open.
 *
 *  While it is shut this resolves without writing and remembers that an edit
 *  is waiting, so a save made during the initial load is not dropped — it goes
 *  up as soon as the read lands. That is a deferral rather than a failure, so
 *  it does not throw; `getSyncStatus` is what reports it. */
export async function syncSave(secretKey: string, data: AppState): Promise<void> {
  ensureKey(secretKey);

  if (gate.state !== 'ready') {
    if (!gate.deferred) {
      gate.deferred = true;
      notify();
    }
    return;
  }

  await put(secretKey, freshestPayload(data));
}

/** Send local state up even though the cloud copy could not be read.
 *
 *  The honest case for this: a day's work offline, where local is certainly
 *  the newer copy. It is a deliberate overwrite, so it is only ever reached
 *  from a button the user presses. */
export async function forcePushLocal(secretKey: string): Promise<void> {
  ensureKey(secretKey);
  await put(secretKey, loadState());
  gate.state = 'ready';
  gate.error = null;
  gate.deferred = false;
  notify();
}

/** Try the read again, reopening the gate if it works. */
export async function retryCloudLoad(secretKey: string): Promise<AppState> {
  return syncLoad(secretKey, { force: true });
}
