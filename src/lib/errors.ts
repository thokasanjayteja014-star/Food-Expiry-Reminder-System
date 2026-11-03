/** Maps technical errors to friendly messages. Raw errors are logged, never shown. */

export const FRIENDLY = {
  save: "We couldn't save the product. Please check your connection and try again.",
  load: "We couldn't load your products. Please check your connection and try again.",
  delete: "We couldn't delete the product. Please try again.",
  offline: "You are offline. Some features may be unavailable.",
  offlineSave: "You are offline, so the product was not saved. Please try again when you're back online.",
  generic: "Something went wrong. Please try again.",
  camera: "Camera access was denied. Please allow camera permission or upload an image.",
  cameraUnavailable: "Camera access is unavailable. You can upload an image instead.",
  cameraInsecure:
    "The camera only works on a secure page (https:// or http://localhost). Open the app that way, or upload an image instead.",
  cameraBusy: "The camera is being used by another app. Close it (Zoom, Teams, the Camera app) and try again, or upload an image.",
  cameraMissing: "No camera was found on this device. You can upload an image instead.",
  ocr: "We couldn't clearly detect the expiry date. Please enter it manually.",
  ocrFailed: "We couldn't read this image. Please try a clearer photo or enter the details manually.",
  notificationsDenied: "Notifications are disabled. Please enable them in your browser settings.",
  imageUpload: "We couldn't open this image. Please try another one.",
} as const;

export class AppError extends Error {
  constructor(
    public readonly friendly: string,
    cause?: unknown,
  ) {
    super(friendly);
    this.name = "AppError";
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

export function friendlyMessage(error: unknown, fallback: string = FRIENDLY.generic): string {
  if (error instanceof AppError) return error.friendly;
  return fallback;
}

const AUTH_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/wrong-password": "Incorrect email or password.",
  "auth/user-not-found": "Incorrect email or password.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/email-already-in-use": "An account with this email already exists. Please log in instead.",
  "auth/weak-password": "Please choose a stronger password.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
  "auth/network-request-failed": "Network error. Please check your connection and try again.",
  "auth/popup-closed-by-user": "Google sign-in was cancelled.",
  "auth/cancelled-popup-request": "Google sign-in was cancelled.",
  "auth/popup-blocked": "The sign-in popup was blocked. Please allow popups and try again.",
  "auth/operation-not-allowed": "This sign-in method is not turned on yet. In the Firebase console, open Authentication > Sign-in method and enable it.",
  "auth/unauthorized-domain": "This website is not authorised for sign-in. Add it in Firebase Authentication settings.",
};

export function friendlyAuthError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? "";
  return AUTH_MESSAGES[code] ?? "We couldn't sign you in. Please try again.";
}

/** Rejects if `promise` does not settle in time, so the UI never spins forever. */
export function withTimeout<T>(promise: Promise<T>, ms: number, friendly: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new AppError(friendly)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e instanceof AppError ? e : new AppError(friendly, e));
      },
    );
  });
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}
