import { describe, it, expect } from "vitest";
import { buildAnimationSrcdoc } from "./buildAnimationSrcdoc.js";

describe("buildAnimationSrcdoc", () => {
  it("inlines the user fragment with CSP, error bridge, and reduced-motion flag", () => {
    const html = buildAnimationSrcdoc('<div id="thing"></div><script>console.log("hi");</script>');
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('<div id="thing"></div>');
    expect(html).toContain("anim-error");
    expect(html).toContain("sketchpadReducedMotion");
  });

  it("embeds the user fragment's own script tags verbatim, without mangling their close tags", () => {
    const html = buildAnimationSrcdoc('<script>console.log("hi");</script>');
    expect(html).toContain('<script>console.log("hi");</script>');
  });
});
