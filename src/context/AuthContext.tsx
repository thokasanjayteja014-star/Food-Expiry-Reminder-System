"use client";

/**
 * Holds the signed-in user and the matching data repository.
 * Real accounts use Firebase; demo mode uses a separate local-only repository.
 */
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import type { AppUser } from "@/types/user";
import type { DataRepository } from "@/lib/repository";
import { getDb, getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase";
import { FirestoreRepository, ensureUserProfile } from "@/lib/firestore";
import { DEMO_USER, DemoRepository, isDemoEnabled } from "@/lib/demoStore";
import { logout as firebaseLogout } from "@/lib/auth";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  status: AuthStatus;
  user: AppUser | null;
  repo: DataRepository | null;
  /** The shared household this user belongs to, or null for a personal list. */
  householdId: string | null;
  firebaseReady: boolean;
  demoAllowed: boolean;
  enterDemo: () => void;
  logout: () => Promise<void>;
  /** Updates the display name held in memory after the profile changes. */
  setDisplayName: (name: string) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const DEMO_ALLOWED = process.env.NEXT_PUBLIC_ENABLE_DEMO !== "false";

/** Remembers the household per account so the right list shows at once, even offline. */
const HOUSEHOLD_CACHE = "fer.household.";

function cachedHousehold(uid: string): string | null {
  try {
    return localStorage.getItem(HOUSEHOLD_CACHE + uid) || null;
  } catch {
    return null;
  }
}

function cacheHousehold(uid: string, id: string | null) {
  try {
    if (id) localStorage.setItem(HOUSEHOLD_CACHE + uid, id);
    else localStorage.removeItem(HOUSEHOLD_CACHE + uid);
  } catch {
    // Storage blocked (private mode): the profile listener still keeps it right.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AppUser | null>(null);
  const [repo, setRepo] = useState<DataRepository | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [memberName, setMemberName] = useState("");

  const startDemo = useCallback(() => {
    setUser({ ...DEMO_USER, isDemo: true });
    setRepo(new DemoRepository());
    setStatus("authenticated");
  }, []);

  useEffect(() => {
    if (DEMO_ALLOWED && isDemoEnabled()) {
      // Restoring the session from localStorage (an external store) on mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      startDemo();
      return;
    }
    if (!isFirebaseConfigured) {
       
      setStatus("unauthenticated");
      return;
    }
    const auth = getFirebaseAuth();
    // Firebase persists the session in IndexedDB, so users stay signed in across visits.
    return onAuthStateChanged(auth, (fbUser) => {
      if (isDemoEnabled()) return;
      if (fbUser) {
        setUser({
          uid: fbUser.uid,
          name: fbUser.displayName ?? fbUser.email?.split("@")[0] ?? "",
          email: fbUser.email ?? "",
          isDemo: false,
        });
        setHouseholdId(cachedHousehold(fbUser.uid));
        setMemberName(fbUser.displayName ?? fbUser.email?.split("@")[0] ?? "");
        setStatus("authenticated");
        // Covers Google redirect sign-in, where the profile could not be created before navigating away.
        ensureUserProfile(fbUser.uid, fbUser.displayName ?? "", fbUser.email ?? "").catch(() => {});
      } else {
        setUser(null);
        setRepo(null);
        setHouseholdId(null);
        setStatus("unauthenticated");
      }
    });
  }, [startDemo]);

  const uid = user && !user.isDemo ? user.uid : null;

  // Follow the profile so joining or leaving a household (done by the server) switches the list live.
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(getDb(), "users", uid),
      (snap) => {
        const id = snap.get("householdId");
        const next = typeof id === "string" && id ? id : null;
        cacheHousehold(uid, next);
        setHouseholdId(next);
        const name = snap.get("name");
        if (typeof name === "string" && name) setMemberName(name);
      },
      (error) => console.warn("Could not follow the profile", error),
    );
  }, [uid]);

  // One repository per account and list; a new one makes every screen re-read the right list.
  useEffect(() => {
    if (!uid) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRepo(new FirestoreRepository(uid, householdId, memberName));
  }, [uid, householdId, memberName]);

  const enterDemo = useCallback(() => {
    DemoRepository.enable();
    startDemo();
  }, [startDemo]);

  const logout = useCallback(async () => {
    if (user?.isDemo) {
      DemoRepository.disable();
      setUser(null);
      setRepo(null);
      setStatus("unauthenticated");
      return;
    }
    await firebaseLogout();
  }, [user]);

  const setDisplayName = useCallback((name: string) => {
    setUser((u) => (u ? { ...u, name } : u));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      // Signed in but the repository is not built yet: still loading, so no screen sees a null repo.
      status: status === "authenticated" && !repo ? "loading" : status,
      user,
      repo,
      householdId: user?.isDemo ? null : householdId,
      firebaseReady: isFirebaseConfigured,
      demoAllowed: DEMO_ALLOWED,
      enterDemo,
      logout,
      setDisplayName,
    }),
    [status, user, repo, householdId, enterDemo, logout, setDisplayName],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
