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

  it("refuses the mock Google provider on a production like (Secure cookie) setup", () => {
    expect(() => parseEnv({ ...base, GOOGLE_MOCK: "1", COOKIE_SECURE: "true" })).toThrow(
      /GOOGLE_MOCK/,
    );
    expect(parseEnv({ ...base, GOOGLE_MOCK: "1" }).googleMock).toBe(true);
  });

  it("refuses the mock Google provider when ENV=prod even without Secure cookies", () => {
    expect(() => parseEnv({ ...base, GOOGLE_MOCK: "1", ENV: "prod" })).toThrow(/GOOGLE_MOCK/);
    expect(parseEnv({ ...base, GOOGLE_MOCK: "0", ENV: "prod" }).googleMock).toBe(false);
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

  it("refuses the mock sign in flag in production too", () => {
    expect(() => parseEnv({ ...base, NEXT_PUBLIC_AUTH_MOCK: "1", ENV: "prod" })).toThrow(
      /AUTH_MOCK/,
    );
    expect(() => parseEnv({ ...base, NEXT_PUBLIC_AUTH_MOCK: "1", COOKIE_SECURE: "true" })).toThrow(
      /AUTH_MOCK/,
    );
    expect(parseEnv({ ...base, NEXT_PUBLIC_AUTH_MOCK: "1" }).googleMock).toBe(true);
  });

  it("reads the Firebase auth domain as a bare lowercase host", () => {
    expect(parseEnv(base).firebaseAuthDomain).toBe("");
    const env = parseEnv({
      ...base,
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "Leafy-8ecd6.firebaseapp.com",
    });
    expect(env.firebaseAuthDomain).toBe("leafy-8ecd6.firebaseapp.com");
  });

  it("rejects an auth domain that could widen the CSP", () => {
    for (const bad of [
      "https://x.firebaseapp.com",
      "x.com/path",
      "x.com; script-src *",
      "*.com",
      "x",
    ]) {
      expect(() => parseEnv({ ...base, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: bad })).toThrow();
    }
  });
});
