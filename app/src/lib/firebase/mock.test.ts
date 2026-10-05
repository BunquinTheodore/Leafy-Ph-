import { describe, expect, it } from "vitest";
import { mockEmailFrom, mockGoogleIdToken } from "./mock";

const decode = (part: string) =>
  JSON.parse(
    atob(
      part
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(part.length / 4) * 4, "="),
    ),
  );

describe("mockEmailFrom", () => {
  it("reads and lowercases the query value", () => {
    expect(mockEmailFrom("?mock_google_email=Grace%40Example.com")).toBe("grace@example.com");
  });
  it("falls back to the dev account for a missing or malformed value", () => {
    expect(mockEmailFrom("")).toBe("dev@example.com");
    expect(mockEmailFrom("?mock_google_email=nope")).toBe("dev@example.com");
  });
});

describe("mockGoogleIdToken", () => {
  const options = { search: "?mock_google_email=a@b.co", projectId: "proj", nowSeconds: 1000 };

  it("issues a Firebase shaped HS256 token for the project", async () => {
    const [header, payload, signature] = (await mockGoogleIdToken(options)).split(".");
    expect(decode(header ?? "")).toEqual({ alg: "HS256", typ: "JWT", kid: "leafy-mock" });
    const claims = decode(payload ?? "");
    expect(claims).toMatchObject({
      iss: "https://securetoken.google.com/proj",
      aud: "proj",
      iat: 1000,
      auth_time: 1000,
      exp: 4600,
      email: "a@b.co",
      email_verified: true,
      firebase: { sign_in_provider: "google.com", identities: {} },
    });
    expect(claims.sub).toMatch(/^mock-[0-9a-f]{20}$/);
    expect(claims.user_id).toBe(claims.sub);
    expect(signature?.length).toBeGreaterThan(20);
  });

  it("gives the same uid for the same email and a different one otherwise", async () => {
    const sub = async (search: string) =>
      decode((await mockGoogleIdToken({ ...options, search })).split(".")[1] ?? "").sub;
    expect(await sub("?mock_google_email=a@b.co")).toBe(await sub("?mock_google_email=a@b.co"));
    expect(await sub("?mock_google_email=a@b.co")).not.toBe(await sub("?mock_google_email=c@d.co"));
  });
});
