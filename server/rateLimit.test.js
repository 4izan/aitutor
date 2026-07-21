import { describe, it, expect } from "vitest";
import { createLimiter } from "./rateLimit.js";

describe("createLimiter", () => {
  it("allows requests under the limit", () => {
    const limiter = createLimiter({ windowMs: 10_000, max: 3 });
    expect(limiter.check("a", 0)).toBe(true);
    expect(limiter.check("a", 1)).toBe(true);
    expect(limiter.check("a", 2)).toBe(true);
  });

  it("blocks requests over the limit within the window", () => {
    const limiter = createLimiter({ windowMs: 10_000, max: 3 });
    limiter.check("a", 0);
    limiter.check("a", 1);
    limiter.check("a", 2);
    expect(limiter.check("a", 3)).toBe(false);
  });

  it("resets once the window has elapsed", () => {
    const limiter = createLimiter({ windowMs: 10_000, max: 2 });
    limiter.check("a", 0);
    limiter.check("a", 1);
    expect(limiter.check("a", 2)).toBe(false);
    expect(limiter.check("a", 10_001)).toBe(true);
  });

  it("tracks separate keys independently", () => {
    const limiter = createLimiter({ windowMs: 10_000, max: 1 });
    expect(limiter.check("a", 0)).toBe(true);
    expect(limiter.check("b", 0)).toBe(true);
    expect(limiter.check("a", 1)).toBe(false);
  });
});
