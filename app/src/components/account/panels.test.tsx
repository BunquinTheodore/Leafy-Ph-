import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  errorEnvelope,
  installDialog,
  installMatchMedia,
  okEnvelope,
  stubFetch,
} from "@/test-utils/dom";
import { AccountPanels } from "./AccountPanels";
import { DangerPanel } from "./DangerPanel";
import { PasswordPanel } from "./PasswordPanel";
import { ProfilePanel } from "./ProfilePanel";
import type { AccountUser } from "./types";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
// The re-sign in button needs Google sign in to be available; the SDK itself is never loaded here.
vi.mock("@/lib/firebase/config", () => ({ isGoogleSignInAvailable: () => true }));
vi.mock("@/lib/firebase/client", () => ({
  signInWithGoogle: vi.fn(),
  completeRedirectSignIn: vi.fn().mockResolvedValue(null),
  preloadFirebase: vi.fn(),
}));

const passwordUser: AccountUser = {
  email: "ada@example.com",
  first_name: "Ada",
  last_name: "Lovelace",
  auth_methods: ["password"],
};
const googleUser: AccountUser = { ...passwordUser, auth_methods: ["google"] };

beforeEach(() => {
  installMatchMedia(false);
  installDialog();
  refresh.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const type = (label: RegExp | string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("ProfilePanel", () => {
  it("shows the sign in methods", () => {
    render(<ProfilePanel user={{ ...passwordUser, auth_methods: ["password", "google"] }} />);
    const list = screen.getByRole("list", { name: "How you sign in" });
    expect(within(list).getByText("Email and password")).toBeInTheDocument();
    expect(within(list).getByText("Google")).toBeInTheDocument();
  });

  it("keeps Save disabled until something changes and saves the trimmed names", async () => {
    const { calls } = stubFetch(() => okEnvelope({ first_name: "Grace" }));
    render(<ProfilePanel user={passwordUser} />);
    const save = () => screen.getByRole("button", { name: "Save changes" });
    expect(save()).toBeDisabled();

    type("First name", "  Grace ");
    type("Last name", "Hopper");
    expect(save()).toBeEnabled();
    fireEvent.click(save());

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(calls).toEqual([
      {
        url: "/api/me",
        method: "PATCH",
        body: { first_name: "Grace", last_name: "Hopper" },
      },
    ]);
  });

  it("asks for a first name instead of sending an empty one", () => {
    const { mock } = stubFetch(() => okEnvelope());
    render(<ProfilePanel user={passwordUser} />);
    type("First name", "   ");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Enter your first name.")).toBeInTheDocument();
    expect(mock).not.toHaveBeenCalled();
  });

  it("shows a server failure in plain words", async () => {
    stubFetch(() => errorEnvelope(500, "internal_error", "Something went wrong on our side."));
    render(<ProfilePanel user={passwordUser} />);
    type("Last name", "Byron");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong on our side.");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("PasswordPanel", () => {
  it("changes the password with the current one and clears the fields", async () => {
    const { calls } = stubFetch(() => okEnvelope({ changed: true }));
    render(<PasswordPanel user={passwordUser} />);
    expect(screen.getByRole("heading", { name: "Password" })).toBeInTheDocument();

    type("Current password", "old-password-1");
    type("New password", "a much longer phrase 42");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      url: "/api/me/password",
      method: "POST",
      body: { current_password: "old-password-1", new_password: "a much longer phrase 42" },
    });
    await waitFor(() => expect(screen.getByLabelText("New password")).toHaveValue(""));
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("requires the current password and a long enough new one before calling the API", () => {
    const { mock } = stubFetch(() => okEnvelope());
    render(<PasswordPanel user={passwordUser} />);
    type("New password", "short");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByText("Enter your current password.")).toBeInTheDocument();
    expect(screen.getAllByText("Use at least 10 characters.").length).toBeGreaterThan(0);
    expect(mock).not.toHaveBeenCalled();
  });

  it("puts a wrong current password on that field", async () => {
    stubFetch(() => errorEnvelope(403, "password_incorrect", "The password is not correct."));
    render(<PasswordPanel user={passwordUser} />);
    type("Current password", "wrong-password");
    type("New password", "a much longer phrase 42");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(
      await screen.findByText("That password is not correct. Check it and try again."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toHaveAttribute("aria-invalid", "true");
  });

  it("maps an API password rule to the new password field", async () => {
    stubFetch(() =>
      errorEnvelope(422, "validation_error", "Invalid", [
        { field: "new_password", type: "too_common" },
      ]),
    );
    render(<PasswordPanel user={passwordUser} />);
    type("Current password", "old-password-1");
    type("New password", "passwordpassword");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText(/too common/i)).toBeInTheDocument();
  });

  it("offers Set a password to a Google only member, without a current password", async () => {
    const { calls } = stubFetch(() => okEnvelope({ changed: true }));
    render(<PasswordPanel user={googleUser} />);
    expect(screen.getByRole("heading", { name: "Set a password" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();

    type("New password", "a much longer phrase 42");
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(calls[0]?.body).toEqual({ new_password: "a much longer phrase 42" });
  });

  it("lets a recent Google sign in set a new password without the current one", async () => {
    const { calls } = stubFetch(() => okEnvelope({ changed: true }));
    render(
      <PasswordPanel
        user={{ ...passwordUser, auth_methods: ["password", "google"] }}
        recentGoogle
      />,
    );
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
    expect(screen.getByText(/You signed in with Google a moment ago/)).toBeInTheDocument();

    type("New password", "a much longer phrase 42");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ new_password: "a much longer phrase 42" });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("asks for the current password after all when the API says the sign in is no longer recent", async () => {
    stubFetch(() =>
      errorEnvelope(422, "validation_error", "Invalid", [
        { field: "current_password", type: "missing" },
      ]),
    );
    render(
      <PasswordPanel
        user={{ ...passwordUser, auth_methods: ["password", "google"] }}
        recentGoogle
      />,
    );
    type("New password", "a much longer phrase 42");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByLabelText("Current password")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.queryByText(/You signed in with Google a moment ago/)).not.toBeInTheDocument();
  });

  it("still requires the current password for a password session", () => {
    render(<PasswordPanel user={passwordUser} recentGoogle={false} />);
    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
  });
});

describe("DangerPanel", () => {
  it("explains what is removed", () => {
    render(<DangerPanel user={passwordUser} onDeleted={() => undefined} />);
    expect(screen.getByText("Every scan and the photo you uploaded.")).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });

  it("needs the password and the word DELETE before it opens the confirmation", () => {
    render(<DangerPanel user={passwordUser} onDeleted={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(screen.getByText("Type DELETE in capital letters to continue.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("deletes after the final confirmation and reports success", async () => {
    const onDeleted = vi.fn();
    const { calls } = stubFetch(() => okEnvelope({ deleted: true }));
    render(<DangerPanel user={passwordUser} onDeleted={onDeleted} />);
    type("Password", "my-password-123");
    type("Type DELETE to confirm", "DELETE");
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    const dialog = await screen.findByRole("dialog");
    expect(calls).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete account" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(calls).toEqual([
      {
        url: "/api/me",
        method: "DELETE",
        body: { password: "my-password-123", confirmation: "DELETE" },
      },
    ]);
  });

  it("lets the member back out", async () => {
    const { mock } = stubFetch(() => okEnvelope());
    render(<DangerPanel user={passwordUser} onDeleted={() => undefined} />);
    type("Password", "my-password-123");
    type("Type DELETE to confirm", "DELETE");
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Keep my account" }),
    );
    expect(mock).not.toHaveBeenCalled();
  });

  it("shows a wrong password on the password field and keeps the account", async () => {
    const onDeleted = vi.fn();
    stubFetch(() => errorEnvelope(403, "password_incorrect", "The password is not correct."));
    render(<DangerPanel user={passwordUser} onDeleted={onDeleted} />);
    type("Password", "wrong");
    type("Type DELETE to confirm", "DELETE");
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete account" }),
    );
    expect(
      await screen.findByText("That password is not correct. Check it and try again."),
    ).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("asks a Google only member for DELETE only", async () => {
    const { calls } = stubFetch(() => okEnvelope({ deleted: true }));
    const onDeleted = vi.fn();
    render(<DangerPanel user={googleUser} onDeleted={onDeleted} />);
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.getByText(/no password to enter/i)).toBeInTheDocument();

    type("Type DELETE to confirm", "DELETE");
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete account" }),
    );
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(calls[0]?.body).toEqual({ confirmation: "DELETE" });
  });

  it("handles reauth_required with a fresh Google sign in", async () => {
    const onDeleted = vi.fn();
    stubFetch(() =>
      errorEnvelope(403, "reauth_required", "Please sign in again to confirm this change."),
    );
    render(<DangerPanel user={googleUser} onDeleted={onDeleted} />);
    type("Type DELETE to confirm", "DELETE");
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete account" }),
    );

    const button = await screen.findByRole("button", { name: "Sign in with Google again" });
    expect(button).toBeEnabled();
    expect(screen.getByText(/has not been deleted/i)).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

describe("AccountPanels", () => {
  it("offers Profile, Password and Danger zone as sideways panels", () => {
    render(<AccountPanels user={passwordUser} />);
    expect(screen.getByRole("group", { name: /1 of 3: Profile/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /2 of 3: Password/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /3 of 3: Danger zone/ })).toBeInTheDocument();
  });

  it("replaces the page with a goodbye state after the account is deleted", async () => {
    stubFetch(() => okEnvelope({ deleted: true }));
    render(<AccountPanels user={passwordUser} />);
    const panel = screen.getByRole("group", { name: /3 of 3/, hidden: true });
    fireEvent.change(within(panel).getByLabelText("Password"), {
      target: { value: "pw-123456789" },
    });
    fireEvent.change(within(panel).getByLabelText("Type DELETE to confirm"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Delete my account" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { hidden: true })).getByRole("button", {
        name: "Delete account",
      }),
    );

    const goodbye = await screen.findByTestId("goodbye");
    expect(within(goodbye).getByRole("heading", { name: "Your account is deleted" })).toHaveFocus();
    expect(within(goodbye).getByRole("link", { name: "Back to the home page" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
