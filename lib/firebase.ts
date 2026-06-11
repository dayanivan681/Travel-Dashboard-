// Firebase client setup. Config comes from NEXT_PUBLIC_FIREBASE_* env vars —
// the Firebase web config is not a secret (it's baked into every client
// bundle by design; access is controlled by Firestore security rules).
//
// If the env vars aren't set, `app`/`auth`/`db` are null and cloud sync /
// auth quietly disable themselves — the app keeps working fully offline
// from localStorage, same as before Phase 2.
import { FirebaseApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";
import { Firestore, initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (firebaseEnabled) {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  auth = getAuth(app);
  // Trip/booking/etc. records freely use `undefined` for absent optional
  // fields; Firestore rejects those by default, so ignore them on write
  // instead of stripping them everywhere they're constructed.
  db = initializeFirestore(app, { ignoreUndefinedProperties: true });
}

export { app, auth, db };
