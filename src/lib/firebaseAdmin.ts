// Firebase Admin SDK — server-side only.
// Used by API routes that must be accessible to unauthenticated users
// (e.g. the public interview booking page). Admin SDK bypasses Realtime
// Database security rules entirely, so no client-side auth is required.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getDatabase, type Database } from "firebase-admin/database";
import { getAuth, type Auth } from "firebase-admin/auth";

function initAdmin() {
  if (getApps().some((a) => a.name === "admin")) return;

  const clientEmail  = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey       = process.env.FIREBASE_PRIVATE_KEY;
  const projectId    = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const databaseURL  = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

  if (!clientEmail || !rawKey || !projectId || !databaseURL) return;

  // Vercel stores the private key with literal \n — replace them with real newlines.
  const privateKey = rawKey.replace(/\\n/g, "\n");

  initializeApp(
    { credential: cert({ projectId, clientEmail, privateKey }), databaseURL },
    "admin",
  );
}

export function getAdminDB(): Database | null {
  initAdmin();
  const app = getApps().find((a) => a.name === "admin");
  return app ? getDatabase(app) : null;
}

export function getAdminAuth(): Auth | null {
  initAdmin();
  const app = getApps().find((a) => a.name === "admin");
  return app ? getAuth(app) : null;
}
