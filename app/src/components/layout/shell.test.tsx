import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorEnvelope, installMatchMedia, okEnvelope, stubFetch } from "@/test-utils/dom";
import { BottomNavBar } from "./BottomNavBar";
import { HeaderBar } from "./HeaderBar";
import { UserMenu } from "./UserMenu";

const { pathname } = vi.hoisted(() => ({ pathname: { value: "/dashboard" } }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

const user = { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" };
const assign = vi.fn();

beforeEach(() => {
  installMatchMedia(false);
  pathname.value = "/dashboard";
  assign.mockClear();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UserMenu", () => {
  it("opens with the name, email, Account and Sign out, and closes on Escape", () => {
    render(<UserMenu user={user} />);
    const trigger = screen.getByRole("button", { name: /open account menu/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("signs out through the logout route and goes to the landing page", async () => {
    const { calls } = stubFetch(() => okEnvelope({ ok: true }));
    render(<UserMenu user={user} />);
    fireEvent.click(screen.getByRole("button", { name: /open account menu/i }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
    expect(calls).toEqual([{ url: "/api/auth/logout", method: "POST", body: null }]);
  });

  it("stays put and explains when sign out fails", async () => {
    stubFetch(() => errorEnvelope(503, "api_unreachable", "Down"));
    render(<UserMenu user={user} />);
    fireEvent.click(screen.getByRole("button", { name: /open account menu/i }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not sign you out/i);
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });
});

describe("HeaderBar", () => {
  it("shows the member links in order with the current page marked", () => {
    render(<HeaderBar user={user} />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Dashboard",
      "Scan a leaf",
      "History",
      "Handbook",
    ]);
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: /open account menu/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sound/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /theme/i })).toBeInTheDocument();
  });

  it("does not mark Scan as current on the history page", () => {
    pathname.value = "/scans";
    render(<HeaderBar user={user} />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("link", { name: "History" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Scan a leaf" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("shows guests the handbook, sign in and a scan call to action, without a user menu", () => {
    render(<HeaderBar user={null} />);
    expect(screen.getByRole("link", { name: "Handbook" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Scan a leaf" })).toHaveAttribute("href", "/scan");
    expect(screen.queryByRole("button", { name: /open account menu/i })).not.toBeInTheDocument();
  });
});

describe("BottomNavBar", () => {
  it("has five items with Scan in the centre and marks the current page", () => {
    pathname.value = "/scans/abc";
    render(<BottomNavBar />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/dashboard",
      "/scans",
      "/scan",
      "/handbook",
      "/account",
    ]);
    expect(links[2]).toHaveAttribute("data-primary", "true");
    expect(links[1]).toHaveAttribute("aria-current", "page");
    expect(links[2]).not.toHaveAttribute("aria-current");
  });
});
