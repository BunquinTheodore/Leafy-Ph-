import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const verifyMock = vi.fn();
vi.mock("./verify", () => ({ verifyEmailToken: (token: string) => verifyMock(token) }));

import { VerifyEmailPanel } from "./VerifyEmailPanel";

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fetchMock = vi.fn();

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
});

beforeEach(() => {
  verifyMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("VerifyEmailPanel", () => {
  it("verifies on mount and shows success with a way on", async () => {
    verifyMock.mockResolvedValue("verified");
    render(<VerifyEmailPanel token="tok" />);
    expect(screen.getByRole("progressbar", { name: "Checking your link" })).toBeInTheDocument();
    expect(await screen.findByText("Email verified")).toBeInTheDocument();
    expect(verifyMock).toHaveBeenCalledWith("tok");
    expect(screen.getByRole("link", { name: "Continue to Leafy" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("says when the email was already verified", async () => {
    verifyMock.mockResolvedValue("already");
    render(<VerifyEmailPanel token="tok" />);
    expect(await screen.findByText("Already verified")).toBeInTheDocument();
  });

  it("offers a new link when the token expired, and confirms it was sent", async () => {
    verifyMock.mockResolvedValue("expired");
    fetchMock.mockResolvedValue(reply(200, { success: true, data: { sent: true }, error: null }));
    render(<VerifyEmailPanel token="old" />);
    expect(await screen.findByText("This link has expired")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send a new link" }));
    expect(await screen.findByText(/new link is on its way/)).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/auth/resend-verification");
    expect(
      screen.getByRole("button", { name: /You can ask for another link in 1:00/ }),
    ).toBeDisabled();
  });

  it("asks a signed out visitor to sign in before a new link can be sent", async () => {
    verifyMock.mockResolvedValue("expired");
    fetchMock.mockResolvedValue(
      reply(401, {
        success: false,
        data: null,
        error: { code: "not_authenticated", message: "x" },
      }),
    );
    render(<VerifyEmailPanel token="old" />);
    fireEvent.click(await screen.findByRole("button", { name: "Send a new link" }));
    expect(await screen.findByText(/Sign in first/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("treats a missing token as expired without verifying", () => {
    render(<VerifyEmailPanel token={null} />);
    expect(screen.getByText("This link has expired")).toBeInTheDocument();
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("lets the visitor retry after a server problem", async () => {
    verifyMock.mockResolvedValueOnce("failed").mockResolvedValueOnce("verified");
    render(<VerifyEmailPanel token="tok" />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Email verified")).toBeInTheDocument());
    expect(verifyMock).toHaveBeenCalledTimes(2);
  });
});
