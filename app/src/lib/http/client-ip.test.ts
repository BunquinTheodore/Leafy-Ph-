import { describe, expect, it } from "vitest";
import { forwardedClientIp } from "./client-ip";

const headers = (xff?: string) => new Headers(xff ? { "x-forwarded-for": xff } : {});

describe("forwardedClientIp", () => {
  it("ignores the header when no proxy is trusted, so a client cannot spoof it", () => {
    expect(forwardedClientIp(headers("9.9.9.9"), 0)).toBeNull();
  });

  it("takes the entry the trusted edge appended, counted from the right", () => {
    expect(forwardedClientIp(headers("6.6.6.6, 203.0.113.7"), 1)).toBe("203.0.113.7");
    expect(forwardedClientIp(headers("6.6.6.6, 203.0.113.7, 10.0.0.2"), 2)).toBe("203.0.113.7");
  });

  it("returns null when the chain is shorter than the trusted hops", () => {
    expect(forwardedClientIp(headers("203.0.113.7"), 2)).toBeNull();
    expect(forwardedClientIp(headers(), 1)).toBeNull();
  });

  it("returns null for a value that is not an IP address", () => {
    expect(forwardedClientIp(headers("evil; x: y"), 1)).toBeNull();
    expect(forwardedClientIp(headers("not-an-ip"), 1)).toBeNull();
  });

  it("accepts IPv6", () => {
    expect(forwardedClientIp(headers("2001:db8::1"), 1)).toBe("2001:db8::1");
  });
});
