import { describe, expect, it } from "vitest";
import { causeSentence } from "./copy";

describe("causeSentence", () => {
  it("names the pathogen when it adds information", () => {
    expect(causeSentence("Early Blight", "Tomato", "fungal", "Alternaria solani")).toBe(
      "Early Blight on Tomato is caused by a fungus, Alternaria solani.",
    );
  });

  it("does not repeat a pathogen that shares the disease name", () => {
    expect(
      causeSentence(
        "Tomato Yellow Leaf Curl Virus",
        "Tomato",
        "viral",
        "Tomato yellow leaf curl virus",
      ),
    ).toBe("Tomato Yellow Leaf Curl Virus is caused by a virus.");
  });

  it("falls back to a plain sentence for an unknown cause type", () => {
    expect(causeSentence("Leaf Scorch", "Strawberry", null, null)).toBe(
      "Leaf Scorch on Strawberry is a known problem for Strawberry.",
    );
  });

  it("explains oomycetes in plain words", () => {
    expect(causeSentence("Late Blight", "Potato", "oomycete", "Phytophthora infestans")).toContain(
      "water mold",
    );
  });
});
