import { generateKeyPair, KeyPairB64 } from './crypto';

const KEY_STORAGE = 'ghostline_client_keypair';
const SESSION_STORAGE = 'ghostline_client_session';

export function getOrCreateKeyPair(): KeyPairB64 {
  const stored = localStorage.getItem(KEY_STORAGE);
  if (stored) return JSON.parse(stored);
  const kp = generateKeyPair();
  localStorage.setItem(KEY_STORAGE, JSON.stringify(kp));
  return kp;
}

export function getSessionId(): string | null {
  return localStorage.getItem(SESSION_STORAGE);
}

export function setSessionId(id: string) {
  localStorage.setItem(SESSION_STORAGE, id);
}
