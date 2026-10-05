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
      "Leaf Scorch on Strawberry is a known disease.",
    );
  });

  it("does not repeat the plant name when the disease already carries it", () => {
    expect(causeSentence("Tomato Mosaic", "Tomato", null, null)).toBe(
      "Tomato Mosaic is a known disease of Tomato.",
    );
  });

  it("reads the cause types the API sends (fungus, virus)", () => {
    expect(causeSentence("Early Blight", "Tomato", "fungus", "Alternaria solani")).toContain(
      "caused by a fungus",
    );
    expect(causeSentence("Mosaic", "Tomato", "Virus", null)).toContain("caused by a virus");
  });

  it("explains oomycetes in plain words", () => {
    expect(causeSentence("Late Blight", "Potato", "oomycete", "Phytophthora infestans")).toContain(
      "water mold",
    );
  });
});
