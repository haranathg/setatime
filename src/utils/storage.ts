import type { AppState } from '../types';

const STORAGE_KEY = 'setatime_data';
const STORAGE_VERSION = 1;

interface StoredData {
  version: number;
  state: AppState;
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { blocks: [] };
    const data: StoredData = JSON.parse(raw);
    return data.state;
  } catch {
    return { blocks: [] };
  }
}

// Whether the most recent local write was rejected. The cloud sync reads this:
// it normally prefers localStorage over a caller's own payload, because
// localStorage is a superset of any single slice. That stops being true the
// moment a write is dropped for quota, and pushing the older copy would then
// lose the newest edit in the cloud as well as locally.
let localWriteFailed = false;

export function lastLocalWriteFailed(): boolean {
  return localWriteFailed;
}

// Returns false when the write was rejected (quota) rather than throwing.
// Callers that add bulky data — plan photos are the only one today — check
// the result so a too-large payload surfaces as a message instead of an
// unhandled exception inside a save effect, which would otherwise take the
// rest of the app's persistence down with it.
export function saveState(state: AppState): boolean {
  const data: StoredData = { version: STORAGE_VERSION, state };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localWriteFailed = false;
    return true;
  } catch {
    localWriteFailed = true;
    return false;
  }
}

const API_KEY_STORAGE = 'setatime_api_key';

export function getApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE) || '';
}

export function setApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE, key);
}
