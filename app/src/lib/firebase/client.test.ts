import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn(),
  signOut: vi.fn(),
  setCustomParameters: vi.fn(),
  initializeApp: vi.fn(),
}));

vi.mock("firebase/app", () => ({
  getApps: () => [],
  getApp: () => ({ name: "app" }),
  initializeApp: sdk.initializeApp,
}));
vi.mock("firebase/auth", () => ({
  getAuth: () => ({ name: "auth" }),
  GoogleAuthProvider: class {
    setCustomParameters = sdk.setCustomParameters;
  },
  signInWithPopup: sdk.signInWithPopup,
  signInWithRedirect: sdk.signInWithRedirect,
  getRedirectResult: sdk.getRedirectResult,
  signOut: sdk.signOut,
}));

const user = { getIdToken: vi.fn(async () => "ID_TOKEN") };

async function load() {
  vi.resetModules();
  return import("./client");
}

function configure() {
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "key");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "p.firebaseapp.com");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "p");
}

beforeEach(() => {
  Object.values(sdk).forEach((fn) => fn.mockReset());
  sdk.initializeApp.mockReturnValue({ name: "app" });
  sdk.signOut.mockResolvedValue(undefined);
  sessionStorage.clear();
  vi.stubEnv("NEXT_PUBLIC_AUTH_MOCK", "");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("signInWithGoogle", () => {
  it("is disabled without Firebase config and never loads the SDK", async () => {
    const { signInWithGoogle } = await load();
    expect(await signInWithGoogle()).toEqual({ status: "disabled" });
    expect(sdk.initializeApp).not.toHaveBeenCalled();
  });

  it("returns the ID token after a popup sign in and drops the Firebase session", async () => {
    configure();
    sdk.signInWithPopup.mockResolvedValue({ user });
    const { signInWithGoogle } = await load();
    expect(await signInWithGoogle()).toEqual({ status: "ok", idToken: "ID_TOKEN" });
    expect(sdk.initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "key", projectId: "p", authDomain: "p.firebaseapp.com" }),
    );
    expect(sdk.setCustomParameters).toHaveBeenCalledWith({ prompt: "select_account" });
    expect(sdk.signOut).toHaveBeenCalled();
  });

  it.each(["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"])(
    "maps %s to cancelled",
    async (code) => {
      configure();
      sdk.signInWithPopup.mockRejectedValue({ code });
      const { signInWithGoogle } = await load();
      expect(await signInWithGoogle()).toEqual({ status: "cancelled" });
    },
  );

  it("maps a network failure and other errors", async () => {
    configure();
    const { signInWithGoogle } = await load();
    sdk.signInWithPopup.mockRejectedValueOnce({ code: "auth/network-request-failed" });
    expect(await signInWithGoogle()).toEqual({ status: "network" });
    sdk.signInWithPopup.mockRejectedValueOnce({ code: "auth/internal-error" });
    expect(await signInWithGoogle()).toEqual({ status: "failed" });
    sdk.signInWithPopup.mockRejectedValueOnce(new Error("boom"));
    expect(await signInWithGoogle()).toEqual({ status: "failed" });
  });

  it("falls back to a redirect when the popup is blocked and remembers it", async () => {
    configure();
    sdk.signInWithPopup.mockRejectedValue({ code: "auth/popup-blocked" });
    sdk.signInWithRedirect.mockResolvedValue(undefined);
    const { signInWithGoogle, returnedFromRedirect } = await load();
    expect(await signInWithGoogle()).toEqual({ status: "redirecting" });
    expect(sdk.signInWithRedirect).toHaveBeenCalled();
    expect(returnedFromRedirect()).toBe(true);
  });

  it("uses the mock token and never touches Firebase in mock mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_MOCK", "1");
    const { signInWithGoogle } = await load();
    const result = await signInWithGoogle();
    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.idToken.split(".")).toHaveLength(3);
    expect(sdk.initializeApp).not.toHaveBeenCalled();
  });
});

describe("completeRedirectSignIn", () => {
  it("does nothing, and loads nothing, when no redirect was started", async () => {
    configure();
    const { completeRedirectSignIn } = await load();
    expect(await completeRedirectSignIn()).toBeNull();
    expect(sdk.getRedirectResult).not.toHaveBeenCalled();
    expect(sdk.initializeApp).not.toHaveBeenCalled();
  });

  it("returns the token after coming back from Google and clears the flag", async () => {
    configure();
    sessionStorage.setItem("leafy_google_redirect", "1");
    sdk.getRedirectResult.mockResolvedValue({ user });
    const { completeRedirectSignIn, returnedFromRedirect } = await load();
    expect(await completeRedirectSignIn()).toEqual({ status: "ok", idToken: "ID_TOKEN" });
    expect(returnedFromRedirect()).toBe(false);
  });

  it("returns null when the redirect carried no result and maps failures", async () => {
    configure();
    const { completeRedirectSignIn } = await load();
    sessionStorage.setItem("leafy_google_redirect", "1");
    sdk.getRedirectResult.mockResolvedValueOnce(null);
    expect(await completeRedirectSignIn()).toBeNull();
    sessionStorage.setItem("leafy_google_redirect", "1");
    sdk.getRedirectResult.mockRejectedValueOnce({ code: "auth/network-request-failed" });
    expect(await completeRedirectSignIn()).toEqual({ status: "network" });
  });
});

describe("preloadFirebase", () => {
  it("loads the SDK once when configured and not at all otherwise", async () => {
    const off = await load();
    off.preloadFirebase();
    await Promise.resolve();
    expect(sdk.initializeApp).not.toHaveBeenCalled();

    configure();
    const on = await load();
    on.preloadFirebase();
    on.preloadFirebase();
    await vi.waitFor(() => expect(sdk.initializeApp).toHaveBeenCalledTimes(1));
  });
});
