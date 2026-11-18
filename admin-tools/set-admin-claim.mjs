import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const [uid, action = 'grant'] = process.argv.slice(2);

if (!uid || !['grant', 'revoke'].includes(action)) {
  console.error('Usage: node set-admin-claim.mjs <firebase-auth-uid> [grant|revoke]');
  process.exit(2);
}

const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId: 'vish-hub' });
const auth = getAuth(app);
const user = await auth.getUser(uid);

if (action === 'grant' && !user.emailVerified) {
  throw new Error('Refusing to grant Admin to an account whose email is not verified.');
}

const claims = { ...(user.customClaims || {}) };
if (action === 'grant') claims.admin = true;
else delete claims.admin;

await auth.setCustomUserClaims(uid, claims);
console.log(`Admin claim ${action === 'grant' ? 'granted to' : 'revoked for'} ${uid}. The user must refresh their ID token.`);
