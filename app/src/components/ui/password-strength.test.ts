import { describe, expect, it } from "vitest";
import { scorePassword } from "./password-score";

describe("scorePassword", () => {
  it("scores empty input as zero with no label", () => {
    expect(scorePassword("")).toEqual({ score: 0, label: "", hint: "Use at least 10 characters." });
  });

  it("rejects passwords shorter than 10 characters", () => {
    const result = scorePassword("Ab1!xyz");
    expect(result.score).toBe(1);
    expect(result.label).toBe("Too short");
  });

  it("flags common passwords", () => {
    expect(scorePassword("password123").label).toBe("Too common");
    expect(scorePassword("1234567890").score).toBe(1);
  });

  it("flags the email address inside the password", () => {
    const result = scorePassword("ada@example.com1", "ada@example.com");
    expect(result.score).toBe(1);
    expect(result.hint).toMatch(/email/i);
  });

  it("rewards length and variety", () => {
    const weak = scorePassword("aaaaaaaaaa");
    const ok = scorePassword("leaf and fern 2024");
    const strong = scorePassword("Fern-Leaf_Tomato#9042-blight");
    expect(weak.score).toBeLessThan(ok.score);
    expect(ok.score).toBeLessThanOrEqual(strong.score);
    expect(strong.score).toBe(4);
    expect(strong.label).toBe("Strong");
  });

  it("penalises repeated characters", () => {
    expect(scorePassword("zzzzzzzzzzzz").score).toBeLessThanOrEqual(2);
  });

  it("caps at 128 characters like the API", () => {
    expect(scorePassword("a".repeat(129)).hint).toMatch(/128/);
  });
});
