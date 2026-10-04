import { describe, expect, it } from "vitest";
import type { BrowserApiError } from "@/lib/api/browser";
import { describeAccountError } from "./messages";

const err = (over: Partial<BrowserApiError>): BrowserApiError => ({
  status: 400,
  code: "internal_error",
  message: "Server words",
  details: null,
  ...over,
});

describe("describeAccountError", () => {
  it("puts a wrong current password on the current password field", () => {
    expect(
      describeAccountError(err({ status: 403, code: "password_incorrect" }), "current"),
    ).toEqual({
      field: "current",
      message: "That password is not correct. Check it and try again.",
    });
  });

  it("puts a wrong delete password on the delete password field", () => {
    expect(
      describeAccountError(err({ status: 403, code: "password_incorrect" }), "password").field,
    ).toBe("password");
  });

  it.each([
    ["too_short", "Use at least 10 characters."],
    ["too_long", "Use 128 characters or fewer."],
    ["same_as_email", "Choose a password that is different from your email."],
    ["too_common", "That password is too common. Try a longer one that is harder to guess."],
  ])("explains the %s password rule", (type, message) => {
    const result = describeAccountError(
      err({ status: 422, code: "validation_error", details: [{ field: "new_password", type }] }),
      "current",
    );
    expect(result).toEqual({ field: "new", message });
  });

  it("asks for the first name when it is missing", () => {
    const result = describeAccountError(
      err({
        status: 422,
        code: "validation_error",
        details: [{ field: "first_name", type: "string_too_short" }],
      }),
      "firstName",
    );
    expect(result).toEqual({ field: "firstName", message: "Enter your first name." });
  });

  it("explains the typed confirmation", () => {
    const result = describeAccountError(
      err({
        status: 422,
        code: "validation_error",
        details: [{ field: "confirmation", type: "must_be_DELETE" }],
      }),
      "password",
    );
    expect(result.field).toBe("confirmation");
  });

  it("shows a countdown for rate limits", () => {
    const result = describeAccountError(
      err({ status: 429, code: "rate_limited", retryAfterSeconds: 30 }),
      "form",
    );
    expect(result.field).toBe("form");
    expect(result.message).toContain("30 seconds");
  });

  it("flags a stale session for deletion", () => {
    expect(describeAccountError(err({ status: 403, code: "reauth_required" }), "form").field).toBe(
      "reauth",
    );
  });

  it("falls back to the server message and never leaks raw details", () => {
    const result = describeAccountError(
      err({ status: 500, message: "Something went wrong on our side." }),
      "form",
    );
    expect(result).toEqual({ field: "form", message: "Something went wrong on our side." });
  });
});
