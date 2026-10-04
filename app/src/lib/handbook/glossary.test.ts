import { describe, expect, it } from "vitest";
import { annotateTerms } from "./glossary";

describe("annotateTerms", () => {
  it("splits text around known terms and keeps the original casing", () => {
    const parts = annotateTerms("Apply a Fungicide to the foliage.");
    expect(parts.map((part) => part.text).join("")).toBe("Apply a Fungicide to the foliage.");
    const terms = parts.filter((part) => part.definition);
    expect(terms.map((part) => part.text)).toEqual(["Fungicide", "foliage"]);
  });

  it("annotates each term once when given a shared seen set", () => {
    const seen = new Set<string>();
    const first = annotateTerms("Spores spread in rain.", seen);
    const second = annotateTerms("More spores form later.", seen);
    expect(first.some((part) => part.definition)).toBe(true);
    expect(second.some((part) => part.definition)).toBe(false);
  });

  it("does not match inside longer words", () => {
    const parts = annotateTerms("A pathogenic strain");
    expect(parts).toEqual([{ text: "A pathogenic strain" }]);
  });

  it("returns a single plain part when nothing matches", () => {
    expect(annotateTerms("Water in the morning.")).toEqual([{ text: "Water in the morning." }]);
  });
});
