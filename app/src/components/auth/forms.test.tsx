import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
}));

import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
const success = (data: unknown = {}, status = 200) =>
  reply(status, { success: true, data, error: null });
const failure = (
  status: number,
  code: string,
  headers: Record<string, string> = {},
  details?: unknown,
) => reply(status, { success: false, data: null, error: { code, message: "x", details } }, headers);

const fetchMock = vi.fn();

beforeAll(() => {
  // jsdom has no matchMedia; the interaction hooks used by Button read it.
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
  fetchMock.mockReset();
  replace.mockReset();
  refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const type = (label: RegExp | string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = (name: RegExp | string) => fireEvent.click(screen.getByRole("button", { name }));
const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, body: JSON.parse(init.body as string) as Record<string, unknown> };
};

describe("LoginForm", () => {
  it("validates inline and does not call the API when fields are empty", async () => {
    render(<LoginForm note={null} />);
    submit("Sign in");
    expect(await screen.findByText("Enter your email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("signs in, then goes to the sanitized next and refreshes", async () => {
    fetchMock.mockResolvedValue(success({ user: { id: "1" } }));
    render(<LoginForm next="/scan" note={null} />);
    type("Email", "  ada@example.com ");
    type("Password", "secret-password");
    submit("Sign in");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/scan"));
    expect(refresh).toHaveBeenCalled();
    expect(lastCall()).toEqual({
      url: "/api/auth/login",
      body: { email: "ada@example.com", password: "secret-password" },
    });
  });

  it("never follows an unsafe next", async () => {
    fetchMock.mockResolvedValue(success({ user: {} }));
    render(<LoginForm next="//evil.example" note={null} />);
    type("Email", "ada@example.com");
    type("Password", "secret-password");
    submit("Sign in");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows one uniform message for wrong credentials and keeps what was typed", async () => {
    fetchMock.mockResolvedValue(failure(401, "invalid_credentials"));
    render(<LoginForm note={null} />);
    type("Email", "ada@example.com");
    type("Password", "wrong-password");
    submit("Sign in");
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not match/);
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
    expect(screen.getByLabelText("Password")).toHaveValue("wrong-password");
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("counts down after a rate limit and blocks submits until it ends", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(failure(429, "rate_limited", { "retry-after": "3" }));
    render(<LoginForm note={null} />);
    type("Email", "ada@example.com");
    type("Password", "secret-password");
    await act(async () => submit("Sign in"));
    expect(screen.getByText("0:03")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText("0:03")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("shows the session note and links that keep next", () => {
    render(
      <LoginForm
        next="/scan"
        note={{ tone: "info", text: "Your session ended, so please sign in again." }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/session ended/);
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/register?next=%2Fscan",
    );
  });

  it("explains how to recover a forgotten password without any email link", () => {
    render(<LoginForm note={null} />);
    expect(screen.getByTestId("forgot-help")).toHaveTextContent(
      "Forgot your password? Sign in with Google, then set a new one in Account.",
    );
    expect(screen.queryByRole("link", { name: /forgot/i })).not.toBeInTheDocument();
  });

  it("can show and hide the password", () => {
    render(<LoginForm note={null} />);
    const field = screen.getByLabelText("Password");
    expect(field).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(field).toHaveAttribute("type", "text");
  });
});

describe("RegisterForm", () => {
  const fill = () => {
    type("Your name", "Ada Lovelace");
    type("Email", "ada@example.com");
    type("Password", "a long passphrase here");
  };

  it("splits the name, posts, and continues to next", async () => {
    fetchMock.mockResolvedValue(success({ user: {} }, 201));
    render(<RegisterForm next="/scan" />);
    fill();
    submit("Create account");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/scan"));
    expect(lastCall()).toEqual({
      url: "/api/auth/register",
      body: {
        email: "ada@example.com",
        password: "a long passphrase here",
        first_name: "Ada",
        last_name: "Lovelace",
      },
    });
  });

  it("shows a strength hint while typing", () => {
    render(<RegisterForm />);
    type("Password", "short");
    expect(screen.getByRole("meter", { name: "Password strength" })).toBeInTheDocument();
    expect(screen.getAllByText(/at least 10/).length).toBeGreaterThan(0);
  });

  it("blocks a short password without calling the API", async () => {
    render(<RegisterForm />);
    type("Your name", "Ada");
    type("Email", "ada@example.com");
    type("Password", "short");
    submit("Create account");
    expect(
      await screen.findByText("Use at least 10 characters.", { selector: "p[role=alert]" }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains an email that is already used and links to sign in", async () => {
    fetchMock.mockResolvedValue(failure(409, "email_taken"));
    render(<RegisterForm next="/scan" />);
    fill();
    submit("Create account");
    expect(await screen.findByText("That email already has an account.")).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "Sign in" })) {
      expect(link).toHaveAttribute("href", "/login?next=%2Fscan");
    }
    expect(screen.queryByRole("link", { name: "Reset password" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Your name")).toHaveValue("Ada Lovelace");
  });

  it("maps a rejected password from the API to the password field", async () => {
    fetchMock.mockResolvedValue(
      failure(422, "validation_error", {}, [{ field: "password", type: "x" }]),
    );
    render(<RegisterForm />);
    fill();
    submit("Create account");
    expect(await screen.findByText(/password was not accepted/)).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
  });

  it("links the terms and privacy pages in a new tab so the form is kept", () => {
    render(<RegisterForm />);
    const terms = screen.getByRole("link", { name: "Terms" });
    expect(terms).toHaveAttribute("href", "/terms");
    expect(terms).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
  });
});
