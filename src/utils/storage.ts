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

// Returns false when the write was rejected (quota) rather than throwing.
// Callers that add bulky data — plan photos are the only one today — check
// the result so a too-large payload surfaces as a message instead of an
// unhandled exception inside a save effect, which would otherwise take the
// rest of the app's persistence down with it.
export function saveState(state: AppState): boolean {
  const data: StoredData = { version: STORAGE_VERSION, state };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
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
