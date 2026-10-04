import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ToastProvider } from "@/components/ui/Toast";
import { NOTICE_TEXT, noticeAfterGoogle, readNotice } from "@/lib/auth/notice";
import { FlashNotice } from "./FlashNotice";

afterEach(() => {
  cleanup();
  document.cookie = "leafy_notice=; Path=/; Max-Age=0";
});

function mount() {
  return render(
    <ToastProvider>
      <FlashNotice />
    </ToastProvider>,
  );
}

describe("FlashNotice", () => {
  it("shows the Google welcome once and clears the cookie", () => {
    document.cookie = "leafy_notice=google_welcome; Path=/";
    mount();
    expect(screen.getByRole("status")).toHaveTextContent(NOTICE_TEXT.google_welcome);
    expect(document.cookie).not.toContain("leafy_notice");
    cleanup();
    mount();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("tells the user the Google account was linked to an existing account", () => {
    document.cookie = "leafy_notice=google_linked; Path=/";
    mount();
    expect(screen.getByRole("status")).toHaveTextContent(
      /linked it to your existing Leafy account/,
    );
  });

  it("ignores an unknown value and shows nothing without a cookie", () => {
    document.cookie = "leafy_notice=<script>; Path=/";
    mount();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("notice helpers", () => {
  it("maps the API flags to a notice, a new user first", () => {
    expect(noticeAfterGoogle({ isNewUser: true, linkedExistingAccount: true })).toBe(
      "google_welcome",
    );
    expect(noticeAfterGoogle({ isNewUser: false, linkedExistingAccount: true })).toBe(
      "google_linked",
    );
    expect(noticeAfterGoogle({ isNewUser: false, linkedExistingAccount: false })).toBeNull();
  });

  it("reads the keyword among other cookies", () => {
    expect(readNotice("a=1; leafy_notice=google_linked; b=2")).toBe("google_linked");
    expect(readNotice("leafy_notice=other")).toBeNull();
  });

  it("keeps the copy calm: no exclamation marks, no hyphens", () => {
    for (const text of Object.values(NOTICE_TEXT)) {
      expect(text).not.toContain("!");
      expect(text).not.toMatch(/\w-\w/);
    }
  });
});
