import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

// Shared by the student app and admin interface. getApps() prevents duplicate
// initialization when another module in this page has already loaded Firebase.
const defaultApp = getApps().find(existingApp => existingApp.name === '[DEFAULT]');
export const app = defaultApp || initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
