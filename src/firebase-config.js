// ---------------------------------------------------------------------------
// Paste your Firebase project's web app config here.
//
// Firebase console → Project settings → Your apps → SDK setup and configuration.
//
// While the placeholder values below are untouched, the app runs in
// LOCAL MODE: accounts and uploads live only in this browser (localStorage +
// IndexedDB) so you can try every feature before wiring up Firebase.
// Once a real apiKey is pasted, the app switches to Firebase automatically.
// ---------------------------------------------------------------------------
export const firebaseConfig = {
  apiKey: 'PASTE_YOUR_API_KEY',
  authDomain: 'PASTE_YOUR_PROJECT.firebaseapp.com',
  projectId: 'PASTE_YOUR_PROJECT_ID',
  storageBucket: 'PASTE_YOUR_PROJECT.appspot.com',
  messagingSenderId: 'PASTE_YOUR_SENDER_ID',
  appId: 'PASTE_YOUR_APP_ID',
}

export const isFirebaseConfigured = () =>
  !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('PASTE_')
