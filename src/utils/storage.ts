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

export function saveState(state: AppState): void {
  const data: StoredData = { version: STORAGE_VERSION, state };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const API_KEY_STORAGE = 'setatime_api_key';

export function getApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE) || '';
}

export function setApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE, key);
}
