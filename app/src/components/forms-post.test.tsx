import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { installMatchMedia } from "@/test-utils/dom";
import { DangerPanel } from "./account/DangerPanel";
import { PasswordPanel } from "./account/PasswordPanel";
import { ProfilePanel } from "./account/ProfilePanel";
import type { AccountUser } from "./account/types";
import { ForgotPasswordForm } from "./auth/ForgotPasswordForm";
import { LoginForm } from "./auth/LoginForm";
import { RegisterForm } from "./auth/RegisterForm";
import { ResetPasswordForm } from "./auth/ResetPasswordForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

const user: AccountUser = {
  email: "ada@example.com",
  first_name: "Ada",
  last_name: "Lovelace",
  auth_methods: ["password"],
};

beforeAll(() => installMatchMedia(false));
afterEach(cleanup);

/**
 * A submit before the page has hydrated falls back to the browser's own form submit. With the
 * default GET that would put the password in the address bar, the history and server logs, so
 * every form must declare POST (a POST to a page answers 405 and leaks nothing).
 */
describe("forms never fall back to a GET that puts secrets in the URL", () => {
  const cases: Array<[string, () => React.ReactElement]> = [
    ["login", () => <LoginForm note={null} />],
    ["register", () => <RegisterForm />],
    ["forgot password", () => <ForgotPasswordForm />],
    ["reset password", () => <ResetPasswordForm token="abc" />],
    ["profile", () => <ProfilePanel user={user} />],
    ["change password", () => <PasswordPanel user={user} />],
    ["delete account", () => <DangerPanel user={user} onDeleted={() => undefined} />],
  ];

  it.each(cases)("%s form declares method post", (_name, element) => {
    const { container } = render(element());
    const forms = container.querySelectorAll("form");
    expect(forms.length).toBeGreaterThan(0);
    for (const form of forms) expect(form.getAttribute("method")).toBe("post");
  });
});
