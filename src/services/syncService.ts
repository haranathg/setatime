import type { AppState } from '../types';

const SYNC_URL = import.meta.env.VITE_SYNC_API_URL || '/api/sync';
const SECRET_KEY_STORAGE = 'setatime_secret_key';

export function getSecretKey(): string {
  return localStorage.getItem(SECRET_KEY_STORAGE) || '';
}

export function setSecretKey(key: string): void {
  localStorage.setItem(SECRET_KEY_STORAGE, key);
  sessionStorage.removeItem('setatime_auth_hash');
}

export function clearSecretKey(): void {
  localStorage.removeItem(SECRET_KEY_STORAGE);
  sessionStorage.removeItem('setatime_auth_hash');
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

export async function syncLoad(secretKey: string): Promise<AppState> {
  const response = await fetch(SYNC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'load', secretKey }),
  });

  if (!response.ok) {
    throw new Error('Failed to load from cloud');
  }

  return response.json();
}

export async function syncSave(secretKey: string, data: AppState): Promise<void> {
  const response = await fetch(SYNC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'save', secretKey, data }),
  });

  if (!response.ok) {
    throw new Error('Failed to save to cloud');
  }
}
