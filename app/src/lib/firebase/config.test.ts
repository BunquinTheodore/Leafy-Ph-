import { describe, expect, it } from "vitest";
import { parseFirebaseConfig } from "./config";

const full = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "p.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "p",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:1:web:a",
};

describe("parseFirebaseConfig", () => {
  it("builds the config and leaves optional values undefined", () => {
    expect(parseFirebaseConfig(full)).toEqual({
      apiKey: "key",
      authDomain: "p.firebaseapp.com",
      projectId: "p",
      appId: "1:1:web:a",
      storageBucket: undefined,
      messagingSenderId: undefined,
    });
  });

  it("is null when the API key is empty or blank, which disables the button", () => {
    expect(parseFirebaseConfig({ ...full, NEXT_PUBLIC_FIREBASE_API_KEY: "" })).toBeNull();
    expect(parseFirebaseConfig({ ...full, NEXT_PUBLIC_FIREBASE_API_KEY: "  " })).toBeNull();
    expect(parseFirebaseConfig({})).toBeNull();
  });

  it("is null without an auth domain or project id", () => {
    expect(parseFirebaseConfig({ ...full, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "" })).toBeNull();
    expect(parseFirebaseConfig({ ...full, NEXT_PUBLIC_FIREBASE_PROJECT_ID: "" })).toBeNull();
  });
});
