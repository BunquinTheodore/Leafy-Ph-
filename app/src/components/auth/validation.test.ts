import { describe, expect, it } from "vitest";
import {
  splitName,
  validateEmail,
  validateLoginPassword,
  validateName,
  validateNewPassword,
} from "./validation";

describe("validateEmail", () => {
  it("accepts ordinary addresses and trims", () => {
    expect(validateEmail("  ada@example.com ")).toBeNull();
    expect(validateEmail("first.last+tag@sub.example.co")).toBeNull();
  });
  it("asks for an address when empty", () => {
    expect(validateEmail("   ")).toMatch(/Enter your email/);
  });
  it.each(["ada", "ada@", "@example.com", "ada@example", "a b@example.com", "ada@@example.com"])(
    "rejects %s",
    (value) => {
      expect(validateEmail(value)).toMatch(/valid email/);
    },
  );
});

describe("validateName", () => {
  it("requires a name", () => {
    expect(validateName("  ")).toMatch(/what to call you/);
  });
  it("caps at 100 characters", () => {
    expect(validateName("a".repeat(101))).toMatch(/100/);
    expect(validateName("a".repeat(100))).toBeNull();
  });
});

describe("splitName", () => {
  it("uses the first word as first name and the rest as last name", () => {
    expect(splitName("Ada Lovelace")).toEqual({ first_name: "Ada", last_name: "Lovelace" });
    expect(splitName("  Maria  de la   Cruz ")).toEqual({
      first_name: "Maria",
      last_name: "de la Cruz",
    });
  });
  it("leaves last name empty for a single word", () => {
    expect(splitName("Ada")).toEqual({ first_name: "Ada", last_name: "" });
  });
  it("keeps both halves inside the 100 character API limits", () => {
    const long = `${"a".repeat(150)} ${"b".repeat(150)}`;
    const { first_name, last_name } = splitName(long);
    expect(first_name.length).toBeLessThanOrEqual(100);
    expect(last_name.length).toBeLessThanOrEqual(100);
  });
});

describe("validateNewPassword", () => {
  it("requires 10 to 128 characters", () => {
    expect(validateNewPassword("", "a@b.co")).toMatch(/Enter your password/);
    expect(validateNewPassword("short", "a@b.co")).toMatch(/at least 10/);
    expect(validateNewPassword("x".repeat(129), "a@b.co")).toMatch(/128/);
    expect(validateNewPassword("long enough pass", "a@b.co")).toBeNull();
  });
  it("rejects a password containing the email", () => {
    expect(validateNewPassword("my-ada@example.com-1", "ada@example.com")).toMatch(/email/);
  });
});

describe("validateLoginPassword", () => {
  it("only requires something, the server judges the rest", () => {
    expect(validateLoginPassword("")).toMatch(/Enter your password/);
    expect(validateLoginPassword("x")).toBeNull();
  });
});
