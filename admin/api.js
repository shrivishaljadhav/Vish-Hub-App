import { auth } from '../firebase-client.js';

const configuredBase = typeof window.VISH_HUB_ADMIN_API_URL === 'string'
  ? window.VISH_HUB_ADMIN_API_URL.trim().replace(/\/$/, '')
  : '';
export const ADMIN_API_BASE = configuredBase || 'https://us-central1-vish-hub.cloudfunctions.net/adminApi';

export async function adminApi(path, { method = 'GET', body, signal } = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to VISH HUB Admin first.');
  const token = await user.getIdToken();
  const response = await fetch(`${ADMIN_API_BASE}/api/admin/${String(path).replace(/^\/+/, '')}`, {
    method,
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store'
  });
  let payload = {};
  try { payload = await response.json(); } catch { /* The caller receives a safe generic error below. */ }
  if (!response.ok) {
    const error = new Error(typeof payload.error === 'string' ? payload.error : 'The Admin request could not be completed.');
    error.status = response.status;
    throw error;
  }
  return payload;
}
