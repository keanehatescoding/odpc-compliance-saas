import { describe, expect, it } from "vitest";
import { clientIpFromHeaders } from "@/lib/client-ip";

const h = (init: Record<string, string>) => new Headers(init);

describe("clientIpFromHeaders", () => {
  it("defaults to the rightmost X-Forwarded-For entry and ignores X-Real-IP", () => {
    const headers = h({ "x-forwarded-for": "6.6.6.6, 203.0.113.7", "x-real-ip": "6.6.6.6" });
    expect(clientIpFromHeaders(headers, {})).toBe("203.0.113.7");
  });

  it("skips trusted proxy hops from the right", () => {
    const headers = h({ "x-forwarded-for": "6.6.6.6, 203.0.113.7, 198.51.100.1" });
    expect(clientIpFromHeaders(headers, { TRUSTED_PROXY_HOPS: "2" })).toBe("203.0.113.7");
  });

  it("returns null when there are fewer entries than trusted hops", () => {
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "203.0.113.7" }), { TRUSTED_PROXY_HOPS: "2" })).toBeNull();
    expect(clientIpFromHeaders(h({}), {})).toBeNull();
  });

  it("uses only X-Real-IP when told to", () => {
    const headers = h({ "x-forwarded-for": "6.6.6.6", "x-real-ip": " 203.0.113.7 " });
    expect(clientIpFromHeaders(headers, { TRUST_IP_HEADER: "x-real-ip" })).toBe("203.0.113.7");
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "6.6.6.6" }), { TRUST_IP_HEADER: "x-real-ip" })).toBeNull();
  });

  it("rejects bad configuration instead of guessing", () => {
    expect(() => clientIpFromHeaders(h({}), { TRUST_IP_HEADER: "cf-connecting-ip" })).toThrow();
    expect(() => clientIpFromHeaders(h({}), { TRUSTED_PROXY_HOPS: "0" })).toThrow();
    expect(() => clientIpFromHeaders(h({}), { TRUSTED_PROXY_HOPS: "two" })).toThrow();
  });
});
