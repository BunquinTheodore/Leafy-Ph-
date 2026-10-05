import { firebaseConfig, isAuthMock } from "./config";

/**
 * Lazy Firebase Auth wrapper. The SDK (firebase/app + firebase/auth only, no analytics) is loaded
 * with dynamic imports the first time someone clicks "Continue with Google", so it never ships in
 * the landing or handbook bundles.
 */
export type GoogleSignInResult =
  | { status: "ok"; idToken: string }
  /** The browser is leaving for Google (popup blocked, redirect flow). Nothing more to do here. */
  | { status: "redirecting" }
  | { status: "cancelled" | "network" | "failed" | "disabled" };

const REDIRECT_FLAG = "leafy_google_redirect";

const CANCELLED_CODES = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/user-cancelled",
]);
const REDIRECT_CODES = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
]);

const errorCode = (error: unknown): string =>
  typeof (error as { code?: unknown } | null)?.code === "string"
    ? (error as { code: string }).code
    : "";

function remember(flag: boolean): void {
  try {
    if (flag) sessionStorage.setItem(REDIRECT_FLAG, "1");
    else sessionStorage.removeItem(REDIRECT_FLAG);
  } catch {
    // Private mode: the redirect still works, we just cannot resume it on the next page load.
  }
}

/** True when this page load follows a redirect sign in we started. */
export function returnedFromRedirect(): boolean {
  try {
    return sessionStorage.getItem(REDIRECT_FLAG) === "1";
  } catch {
    return false;
  }
}

async function importAuth() {
  const config = firebaseConfig();
  if (!config) return null;
  const [{ getApp, getApps, initializeApp }, sdk] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
  ]);
  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  return { sdk, auth: sdk.getAuth(app) };
}

type LoadedAuth = NonNullable<Awaited<ReturnType<typeof importAuth>>>;

let loading: Promise<LoadedAuth | null> | undefined;

function loadAuth(): Promise<LoadedAuth | null> {
  loading ??= importAuth().catch((error: unknown) => {
    loading = undefined; // a failed chunk load may be retried by the next click
    throw error;
  });
  return loading;
}

/**
 * Starts fetching the SDK chunk when the user shows intent (pointer over, focus, touch) so the
 * click can open the popup while the browser still treats it as user initiated. Never called on
 * page load. Safe to call repeatedly and a no-op in mock mode.
 */
export function preloadFirebase(): void {
  if (isAuthMock() || firebaseConfig() === null) return;
  loadAuth().catch(() => undefined);
}

function failureFrom(error: unknown): GoogleSignInResult {
  const code = errorCode(error);
  if (CANCELLED_CODES.has(code)) return { status: "cancelled" };
  if (code === "auth/network-request-failed") return { status: "network" };
  return { status: "failed" };
}

async function tokenFrom(
  loaded: LoadedAuth,
  user: { getIdToken: () => Promise<string> },
): Promise<GoogleSignInResult> {
  const idToken = await user.getIdToken();
  // The API session is ours; keep no Firebase session behind in the browser.
  await loaded.sdk.signOut(loaded.auth).catch(() => undefined);
  return { status: "ok", idToken };
}

async function mockToken(): Promise<GoogleSignInResult> {
  const { mockGoogleIdToken } = await import("./mock");
  const idToken = await mockGoogleIdToken({
    search: window.location.search,
    projectId: firebaseConfig()?.projectId ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
  return { status: "ok", idToken };
}

/** Popup first; if the browser blocks it, fall back to a full page redirect. */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  if (isAuthMock()) return mockToken();
  try {
    const loaded = await loadAuth();
    if (!loaded) return { status: "disabled" };
    const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = loaded.sdk;
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      const result = await signInWithPopup(loaded.auth, provider);
      return await tokenFrom(loaded, result.user);
    } catch (error) {
      if (!REDIRECT_CODES.has(errorCode(error))) throw error;
      remember(true);
      await signInWithRedirect(loaded.auth, provider);
      return { status: "redirecting" };
    }
  } catch (error) {
    remember(false);
    return failureFrom(error);
  }
}

/** Finishes a redirect sign in after the page reloads. Null when there is nothing to finish. */
export async function completeRedirectSignIn(): Promise<GoogleSignInResult | null> {
  if (isAuthMock() || !returnedFromRedirect()) return null;
  remember(false);
  try {
    const loaded = await loadAuth();
    if (!loaded) return { status: "disabled" };
    const result = await loaded.sdk.getRedirectResult(loaded.auth);
    return result ? await tokenFrom(loaded, result.user) : null;
  } catch (error) {
    return failureFrom(error);
  }
}
