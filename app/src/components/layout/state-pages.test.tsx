import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import GlobalError from "@/app/global-error";
import RouteError from "@/app/error";
import NotFound from "@/app/not-found";
import { SiteFooter } from "./SiteFooter";

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

afterEach(cleanup);

describe("404 page", () => {
  it("is calm, has one h1 and two ways out", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Page not found");
    expect(screen.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Browse the handbook" })).toHaveAttribute(
      "href",
      "/handbook",
    );
    expect(document.body.textContent).not.toContain("!");
  });
});

describe("route error page", () => {
  it("offers a retry that calls reset, and a way home", () => {
    const reset = vi.fn();
    render(<RouteError error={new Error("boom")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/");
  });

  it("never shows the error message, only a reference id when there is one", () => {
    const error = Object.assign(new Error("secret database detail"), { digest: "abc123" });
    render(<RouteError error={error} reset={() => undefined} />);
    expect(document.body.textContent).not.toContain("secret database detail");
    expect(screen.getByText("Reference abc123")).toBeInTheDocument();
  });
});

describe("global error page", () => {
  it("renders its own document with a retry and a plain link home", () => {
    const reset = vi.fn();
    const { container } = render(<GlobalError error={new Error("x")} reset={reset} />);
    expect(container.textContent).toContain("We hit a snag");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/");
  });
});

describe("SiteFooter", () => {
  it("links About, Privacy, Terms and the Handbook and has no origin note", () => {
    render(<SiteFooter />);
    const footer = screen.getByRole("navigation", { name: "Footer" });
    expect(footer).toHaveTextContent("About");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Handbook" })).toHaveAttribute("href", "/handbook");
    expect(document.body.textContent).not.toContain("began as DAHON");
    expect(document.body.textContent).not.toContain("Dahon means leaf in Filipino");
  });
});
