/** Firebase Authentication helpers (email/password and Google). */
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  setPersistence,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
} from "firebase/auth";
import { getFirebaseAuth } from "./firebase";
import { ensureUserProfile } from "./firestore";

export async function registerWithEmail(name: string, email: string, password: string) {
  const auth = getFirebaseAuth();
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(cred.user, { displayName: name.trim() });
  await ensureUserProfile(cred.user.uid, name.trim(), cred.user.email ?? email.trim());
  return cred.user;
}

/** "Remember me": stay signed in after the browser closes, or only for this browser session. */
async function applyRemember(remember: boolean) {
  await setPersistence(getFirebaseAuth(), remember ? browserLocalPersistence : browserSessionPersistence);
}

export async function loginWithEmail(email: string, password: string, remember = true) {
  await applyRemember(remember);
  const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  return cred.user;
}

export async function loginWithGoogle() {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    const cred = await signInWithPopup(auth, provider);
    // The sign-in itself has succeeded here. The profile is also ensured when the session
    // starts (AuthContext), so a slow or failed write must not show "sign-in failed".
    ensureUserProfile(cred.user.uid, cred.user.displayName ?? "", cred.user.email ?? "").catch((e) =>
      console.warn("Could not save the profile after Google sign-in", e),
    );
    return cred.user;
  } catch (error) {
    // Some mobile browsers block popups; fall back to a full-page redirect.
    if ((error as { code?: string }).code === "auth/popup-blocked") {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw error;
  }
}

export async function resetPassword(email: string) {
  await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
}

export async function logout() {
  await signOut(getFirebaseAuth());
}

/** ID token for calling our own API routes. */
export async function getIdToken(): Promise<string | null> {
  const user = getFirebaseAuth().currentUser;
  return user ? user.getIdToken() : null;
}
