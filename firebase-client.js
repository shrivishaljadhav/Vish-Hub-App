import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

// Shared by the student app and admin interface. getApps() prevents duplicate
// initialization when another module in this page has already loaded Firebase.
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
