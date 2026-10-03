import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const base = {
  API_INTERNAL_URL: "http://localhost:8000",
  APP_ORIGIN: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("applies safe defaults", () => {
    const env = parseEnv(base);
    expect(env.cookieSecure).toBe(false);
    expect(env.cookiePrefix).toBe("");
    expect(env.maxUploadBytes).toBe(8 * 1024 * 1024);
    expect(env.googleMock).toBe(false);
    expect(env.apiBaseUrl).toBe("http://localhost:8000/api/v1");
  });

  it("strips trailing slashes from urls", () => {
    const env = parseEnv({
      ...base,
      API_INTERNAL_URL: "http://api:8000/",
      APP_ORIGIN: "http://x.test/",
    });
    expect(env.apiBaseUrl).toBe("http://api:8000/api/v1");
    expect(env.appOrigin).toBe("http://x.test");
  });

  it("requires Secure cookies for the __Host- prefix", () => {
    expect(() => parseEnv({ ...base, COOKIE_PREFIX: "__Host-", COOKIE_SECURE: "false" })).toThrow();
    const env = parseEnv({ ...base, COOKIE_PREFIX: "__Host-", COOKIE_SECURE: "true" });
    expect(env.cookiePrefix).toBe("__Host-");
  });

  it("rejects a missing or invalid origin", () => {
    expect(() => parseEnv({ API_INTERNAL_URL: "http://a" })).toThrow();
    expect(() => parseEnv({ ...base, APP_ORIGIN: "not a url" })).toThrow();
  });

  it("rejects unknown cookie prefixes and bad upload limits", () => {
    expect(() => parseEnv({ ...base, COOKIE_PREFIX: "evil" })).toThrow();
    expect(() => parseEnv({ ...base, MAX_UPLOAD_BYTES: "-1" })).toThrow();
  });

  it("reads google settings as optional", () => {
    const env = parseEnv({ ...base, GOOGLE_CLIENT_ID: "abc", GOOGLE_MOCK: "1" });
    expect(env.googleClientId).toBe("abc");
    expect(env.googleMock).toBe(true);
    expect(env.googleRedirectUri).toBe("http://localhost:3000/api/auth/google/callback");
  });
});
