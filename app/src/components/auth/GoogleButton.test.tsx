import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  signInWithGoogle: vi.fn(),
  completeRedirectSignIn: vi.fn(),
  preloadFirebase: vi.fn(),
  available: true,
}));

vi.mock("@/lib/firebase/client", () => ({
  signInWithGoogle: firebase.signInWithGoogle,
  completeRedirectSignIn: firebase.completeRedirectSignIn,
  preloadFirebase: firebase.preloadFirebase,
}));
vi.mock("@/lib/firebase/config", () => ({
  isGoogleSignInAvailable: () => firebase.available,
}));

import { GoogleButton } from "./GoogleButton";

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const sessionOk = () => reply(200, { success: true, data: { user: {} }, error: null });
const sessionFail = (status: number, code: string) =>
  reply(status, { success: false, data: null, error: { code, message: "x" } });

const fetchMock = vi.fn();
const assign = vi.fn();
const button = () => screen.getByRole("button", { name: /Continue with Google|Opening|Signing/ });

beforeEach(() => {
  firebase.available = true;
  firebase.signInWithGoogle.mockReset();
  firebase.completeRedirectSignIn.mockReset().mockResolvedValue(null);
  firebase.preloadFirebase.mockReset();
  fetchMock.mockReset();
  assign.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign, search: "" },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GoogleButton", () => {
  it("renders a button that does nothing on page load", async () => {
    render(<GoogleButton />);
    expect(button()).toBeEnabled();
    expect(firebase.signInWithGoogle).not.toHaveBeenCalled();
    expect(firebase.preloadFirebase).not.toHaveBeenCalled();
    await waitFor(() => expect(firebase.completeRedirectSignIn).toHaveBeenCalledTimes(1));
  });

  it("starts loading the SDK when the pointer or focus shows intent", () => {
    render(<GoogleButton />);
    fireEvent.pointerEnter(button());
    fireEvent.focus(button());
    expect(firebase.preloadFirebase).toHaveBeenCalledTimes(2);
  });

  it("posts the ID token to our route and goes to a safe next", async () => {
    firebase.signInWithGoogle.mockResolvedValue({ status: "ok", idToken: "TOKEN" });
    fetchMock.mockResolvedValue(sessionOk());
    render(<GoogleButton next="/scan" />);
    fireEvent.click(button());
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/scan"));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/google");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ idToken: "TOKEN" });
  });

  it("drops an unsafe next and falls back to the dashboard", async () => {
    firebase.signInWithGoogle.mockResolvedValue({ status: "ok", idToken: "TOKEN" });
    fetchMock.mockResolvedValue(sessionOk());
    render(<GoogleButton next="https://evil.example" />);
    fireEvent.click(button());
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows a busy state and ignores a second click while signing in", async () => {
    firebase.signInWithGoogle.mockReturnValue(new Promise(() => undefined));
    render(<GoogleButton />);
    fireEvent.click(button());
    expect(button()).toHaveAttribute("aria-busy", "true");
    expect(button()).toHaveTextContent("Opening Google");
    fireEvent.click(button());
    expect(firebase.signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it("explains a cancelled popup calmly and lets the person try again", async () => {
    firebase.signInWithGoogle.mockResolvedValue({ status: "cancelled" });
    render(<GoogleButton />);
    fireEvent.click(button());
    expect(await screen.findByText(/Sign in was cancelled/)).toBeInTheDocument();
    expect(button()).toHaveTextContent("Continue with Google");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a network note when Google cannot be reached", async () => {
    firebase.signInWithGoogle.mockResolvedValue({ status: "network" });
    render(<GoogleButton />);
    fireEvent.click(button());
    expect(await screen.findByText(/could not reach Google/)).toBeInTheDocument();
  });

  it("shows the generic failure when Firebase fails", async () => {
    firebase.signInWithGoogle.mockResolvedValue({ status: "failed" });
    render(<GoogleButton />);
    fireEvent.click(button());
    expect(await screen.findByText(/Google sign in did not work/)).toBeInTheDocument();
  });

  it("stays quiet while the browser redirects to Google", async () => {
    firebase.signInWithGoogle.mockResolvedValue({ status: "redirecting" });
    render(<GoogleButton />);
    fireEvent.click(button());
    await waitFor(() => expect(firebase.signInWithGoogle).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(button()).toHaveAttribute("aria-busy", "true");
  });

  it("shows google_email_unverified from our route", async () => {
    firebase.signInWithGoogle.mockResolvedValue({ status: "ok", idToken: "TOKEN" });
    fetchMock.mockResolvedValue(sessionFail(400, "google_email_unverified"));
    render(<GoogleButton />);
    fireEvent.click(button());
    expect(await screen.findByText(/has not verified that email/)).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows a rate limit note and a reachable-API failure", async () => {
    firebase.signInWithGoogle.mockResolvedValue({ status: "ok", idToken: "TOKEN" });
    fetchMock.mockResolvedValueOnce(sessionFail(429, "rate_limited"));
    render(<GoogleButton />);
    fireEvent.click(button());
    expect(await screen.findByText(/Too many attempts/)).toBeInTheDocument();
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    fireEvent.click(button());
    expect(await screen.findByText(/could not reach Leafy/)).toBeInTheDocument();
  });

  it("is disabled with a hint when Firebase is not configured", async () => {
    firebase.available = false;
    render(<GoogleButton />);
    const disabled = screen.getByRole("button", { name: "Continue with Google" });
    expect(disabled).toBeDisabled();
    expect(disabled).toHaveAccessibleDescription(/not set up yet/);
    expect(firebase.completeRedirectSignIn).not.toHaveBeenCalled();
  });

  it("finishes a redirect sign in when the page comes back from Google", async () => {
    firebase.completeRedirectSignIn.mockResolvedValue({ status: "ok", idToken: "BACK" });
    fetchMock.mockResolvedValue(sessionOk());
    render(<GoogleButton next="/account" />);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/account"));
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({
      idToken: "BACK",
    });
  });
});
