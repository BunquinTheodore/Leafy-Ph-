import { describe, expect, it } from "vitest";
import { BOTTOM_ITEMS, DESKTOP_ITEMS, initialsFor, isActivePath } from "./nav";

describe("isActivePath", () => {
  it("matches whole segments only", () => {
    expect(isActivePath("/scan", "/scan")).toBe(true);
    expect(isActivePath("/scan/anything", "/scan")).toBe(true);
    expect(isActivePath("/scans", "/scan")).toBe(false);
    expect(isActivePath("/scans/abc", "/scans")).toBe(true);
    expect(isActivePath("/scanner", "/scan")).toBe(false);
  });

  it("ignores a trailing slash and null paths", () => {
    expect(isActivePath("/dashboard/", "/dashboard")).toBe(true);
    expect(isActivePath(null, "/dashboard")).toBe(false);
  });

  it("treats the handbook subtree as one section", () => {
    expect(isActivePath("/handbook/tomato/early-blight", "/handbook")).toBe(true);
  });
});

describe("nav items", () => {
  it("puts Scan in the centre of the bottom nav", () => {
    expect(BOTTOM_ITEMS).toHaveLength(5);
    expect(BOTTOM_ITEMS[2]?.href).toBe("/scan");
    expect(BOTTOM_ITEMS[2]?.primary).toBe(true);
    expect(BOTTOM_ITEMS.map((item) => item.href)).toEqual([
      "/dashboard",
      "/scans",
      "/scan",
      "/handbook",
      "/account",
    ]);
  });

  it("lists the desktop links in the plan order", () => {
    expect(DESKTOP_ITEMS.map((item) => item.href)).toEqual([
      "/dashboard",
      "/scan",
      "/scans",
      "/handbook",
    ]);
  });
});

describe("initialsFor", () => {
  it("uses first and last initials", () => {
    expect(initialsFor("Ada", "Lovelace", "ada@example.com")).toBe("AL");
  });

  it("falls back to the first name, then the email", () => {
    expect(initialsFor("Ada", "", "ada@example.com")).toBe("A");
    expect(initialsFor("", "", "zed@example.com")).toBe("Z");
    expect(initialsFor("", "", "")).toBe("?");
  });
});
