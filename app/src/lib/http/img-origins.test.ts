import { describe, expect, it } from "vitest";
import { imgOriginsFrom } from "./img-origins";

describe("imgOriginsFrom", () => {
  it("keeps only the origin of the public storage endpoint", () => {
    expect(imgOriginsFrom("http://localhost:9000/leafy-scans/key.jpg?sig=1")).toEqual([
      "http://localhost:9000",
    ]);
    expect(imgOriginsFrom(" https://files.example.com ")).toEqual(["https://files.example.com"]);
  });

  it("returns nothing for empty, malformed or non http values", () => {
    expect(imgOriginsFrom(undefined)).toEqual([]);
    expect(imgOriginsFrom("")).toEqual([]);
    expect(imgOriginsFrom("not a url")).toEqual([]);
    expect(imgOriginsFrom("javascript:alert(1)")).toEqual([]);
    expect(imgOriginsFrom("data:text/html,x")).toEqual([]);
  });
});
