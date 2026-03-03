"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { type User, onAuthStateChanged } from "firebase/auth";
import { ref, get } from "firebase/database";
import { getAuth, getDB } from "@/lib/firebase";
import { setUserProfileRecord, type UserProfile, type AuthRole } from "@/lib/members/storage";

// ── CONTEXT TYPE ──────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: User | null;
  userProfile: UserProfile | null;
  authRole: AuthRole | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  userProfile: null,
  authRole: null,
  loading: true,
});

// ── AUTH PROVIDER ─────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]               = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      setLoading(false);
      return;
    }

    // Listen for Firebase auth state changes (sign-in, sign-out, page reload).
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        const db = getDB();
        if (db) {
          try {
            const profileSnap = await get(ref(db, `userProfiles/${firebaseUser.uid}`));

            if (profileSnap.exists()) {
              const profile = profileSnap.val() as Omit<UserProfile, "id">;
              setUserProfile({ ...profile, id: firebaseUser.uid });
            } else {
              // First login: create a profile record in the database.
              const newProfile: UserProfile = {
                id:        firebaseUser.uid,
                email:     firebaseUser.email ?? "",
                authRole:  "member",
                active:    true,
                createdAt: new Date().toISOString(),
              };
              await setUserProfileRecord(firebaseUser.uid, {
                email:     newProfile.email,
                authRole:  newProfile.authRole,
                active:    newProfile.active,
                createdAt: newProfile.createdAt,
              });
              setUserProfile(newProfile);
            }
          } catch {
            // DB unavailable or permission denied — proceed with no profile.
          }
        }
      } else {
        setUserProfile(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, userProfile, authRole: userProfile?.authRole ?? null, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── HOOK ──────────────────────────────────────────────────────────────────────

export function useAuth() {
  return useContext(AuthContext);
}
