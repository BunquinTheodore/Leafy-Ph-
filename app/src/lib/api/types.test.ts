import { describe, expect, it } from "vitest";
import {
  authSessionSchema,
  googleSessionSchema,
  refreshOutSchema,
  sessionTokensSchema,
  userSchema,
} from "./types";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ada@example.com",
  first_name: "Ada",
  last_name: "Lovelace",
  email_verified: false,
  email_verified_at: null,
  created_at: "2026-10-04T10:00:00Z",
  auth_methods: ["password"],
};

/** Shape of AuthSessionOut in api/openapi.json. */
const session = {
  access_token: "at",
  refresh_token: "rt",
  token_type: "bearer",
  expires_in: 900,
  refresh_expires_at: "2026-11-03T10:00:00Z",
  user,
};

describe("AuthSessionOut", () => {
  it("accepts the shape the API publishes", () => {
    const parsed = authSessionSchema.parse(session);
    expect(parsed.expires_in).toBe(900);
    expect(parsed.refresh_expires_at).toBe("2026-11-03T10:00:00Z");
    expect(parsed.user.email_verified_at).toBeNull();
  });

  it("requires refresh_expires_at like the API does", () => {
    const rest: Partial<typeof session> = { ...session };
    delete rest.refresh_expires_at;
    expect(authSessionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an empty access token", () => {
    expect(authSessionSchema.safeParse({ ...session, access_token: "" }).success).toBe(false);
  });

  it("keeps user fields the cookies layer does not need optional", () => {
    const minimal: Partial<typeof user> = { ...user };
    delete minimal.created_at;
    delete minimal.email_verified_at;
    expect(userSchema.safeParse(minimal).success).toBe(true);
  });
});

describe("GoogleSessionOut", () => {
  it("adds the new user and linked account flags", () => {
    const parsed = googleSessionSchema.parse({
      ...session,
      is_new_user: true,
      linked_existing_account: false,
    });
    expect(parsed.is_new_user).toBe(true);
    expect(parsed.linked_existing_account).toBe(false);
  });
});

describe("RefreshOut", () => {
  it("allows a null refresh token (benign concurrent refresh inside the grace window)", () => {
    const parsed = refreshOutSchema.parse({
      access_token: "at",
      refresh_token: null,
      token_type: "bearer",
      expires_in: 900,
      refresh_expires_at: null,
    });
    expect(parsed.refresh_token).toBeNull();
  });

  it("still needs a non empty refresh token when one is present for cookies", () => {
    expect(
      sessionTokensSchema.safeParse({ access_token: "a", refresh_token: "", expires_in: 900 })
        .success,
    ).toBe(false);
  });
});
