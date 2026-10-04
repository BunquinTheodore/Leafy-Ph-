import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorEnvelope, okEnvelope, stubFetch } from "@/test-utils/dom";
import { VerifyEmailBanner } from "./VerifyEmailBanner";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  window.sessionStorage.clear();
  refresh.mockClear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const resendButton = () => screen.getByRole("button", { name: /resend/i });

describe("VerifyEmailBanner", () => {
  it("asks the member to verify and offers a resend", () => {
    stubFetch(() => okEnvelope());
    render(<VerifyEmailBanner />);
    expect(screen.getByText("Check your email to verify your account.")).toBeInTheDocument();
    expect(resendButton()).toBeEnabled();
    expect(resendButton()).toHaveTextContent("Resend email");
  });

  it("posts a resend, confirms it and starts a 60 second cooldown", async () => {
    const { calls } = stubFetch(() => okEnvelope({ sent: true }));
    render(<VerifyEmailBanner />);
    fireEvent.click(resendButton());

    await waitFor(() => expect(resendButton()).toHaveTextContent("Resend in 60s"));
    expect(calls).toEqual([{ url: "/api/auth/resend-verification", method: "POST", body: null }]);
    expect(resendButton()).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/sent a new link/i);
  });

  it("counts down and enables the button again after 60 seconds", async () => {
    stubFetch(() => okEnvelope({ sent: true }));
    render(<VerifyEmailBanner />);
    fireEvent.click(resendButton());
    await waitFor(() => expect(resendButton()).toHaveTextContent("Resend in 60s"));

    await act(async () => undefined); // let the effect register the interval first
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(resendButton()).toHaveTextContent(/Resend in (29|30)s/);

    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });
    expect(resendButton()).toHaveTextContent("Resend email");
    expect(resendButton()).toBeEnabled();
  });

  it("does not send twice while the cooldown runs", async () => {
    const { mock } = stubFetch(() => okEnvelope({ sent: true }));
    render(<VerifyEmailBanner />);
    fireEvent.click(resendButton());
    await waitFor(() => expect(resendButton()).toBeDisabled());
    fireEvent.click(resendButton());
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("uses the server Retry-After when the API says to wait", async () => {
    stubFetch(() => errorEnvelope(429, "rate_limited", "Slow down", null, { "retry-after": "42" }));
    render(<VerifyEmailBanner />);
    fireEvent.click(resendButton());
    await waitFor(() => expect(resendButton()).toHaveTextContent("Resend in 42s"));
  });

  it("refreshes the page when the email is already verified", async () => {
    stubFetch(() => errorEnvelope(409, "already_verified", "This email is already verified."));
    render(<VerifyEmailBanner />);
    fireEvent.click(resendButton());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("shows a failure in plain words and keeps the button usable", async () => {
    stubFetch(() => errorEnvelope(500, "internal_error", "Something went wrong on our side."));
    render(<VerifyEmailBanner />);
    fireEvent.click(resendButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong on our side.");
    expect(resendButton()).toBeEnabled();
  });

  it("remembers a running cooldown across a reload", async () => {
    window.sessionStorage.setItem("leafy-resend-until", String(Date.now() + 20_000));
    stubFetch(() => okEnvelope());
    render(<VerifyEmailBanner />);
    await waitFor(() => expect(resendButton()).toBeDisabled());
    expect(resendButton()).toHaveTextContent(/Resend in (19|20)s/);
  });
});
