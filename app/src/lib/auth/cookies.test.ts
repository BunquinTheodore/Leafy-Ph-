import { describe, expect, it } from "vitest";
import {
  ACCESS_MAX_AGE_SECONDS,
  REFRESH_MAX_AGE_SECONDS,
  cookieNames,
  clearSessionCookies,
  setSessionCookies,
  type CookieWriter,
} from "./cookies";

function recorder() {
  const sets: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const writer: CookieWriter = {
    set: (name, value, options) => {
      sets.push({ name, value, options: { ...options } });
    },
  };
  return { sets, writer };
}

const secureEnv = { cookieSecure: true, cookiePrefix: "__Host-" as const };
const devEnv = { cookieSecure: false, cookiePrefix: "" as const };

describe("cookieNames", () => {
  it("applies the prefix", () => {
    expect(cookieNames("__Host-")).toEqual({
      access: "__Host-leafy_at",
      refresh: "__Host-leafy_rt",
    });
    expect(cookieNames("").access).toBe("leafy_at");
  });
});

describe("setSessionCookies", () => {
  const session = { access_token: "AT", refresh_token: "RT", expires_in: 900 };

  it("sets httpOnly Lax cookies on / with the right lifetimes", () => {
    const { sets, writer } = recorder();
    setSessionCookies(writer, session, devEnv);
    const at = sets.find((c) => c.name === "leafy_at");
    const rt = sets.find((c) => c.name === "leafy_rt");
    expect(at?.value).toBe("AT");
    expect(rt?.value).toBe("RT");
    expect(at?.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
    });
    expect(at?.options.maxAge).toBe(ACCESS_MAX_AGE_SECONDS);
    expect(rt?.options.maxAge).toBe(REFRESH_MAX_AGE_SECONDS);
    expect(ACCESS_MAX_AGE_SECONDS).toBe(900);
    expect(REFRESH_MAX_AGE_SECONDS).toBe(30 * 24 * 3600);
  });

  it("marks cookies Secure with the __Host- prefix and no Domain in production", () => {
    const { sets, writer } = recorder();
    setSessionCookies(writer, session, secureEnv);
    for (const cookie of sets) {
      expect(cookie.name.startsWith("__Host-")).toBe(true);
      expect(cookie.options.secure).toBe(true);
      expect(cookie.options.domain).toBeUndefined();
    }
  });
});

describe("clearSessionCookies", () => {
  it("expires both cookies immediately", () => {
    const { sets, writer } = recorder();
    clearSessionCookies(writer, devEnv);
    expect(sets.map((c) => c.name).sort()).toEqual(["leafy_at", "leafy_rt"]);
    for (const cookie of sets) {
      expect(cookie.value).toBe("");
      expect(cookie.options.maxAge).toBe(0);
    }
  });
});
