import { describe, it, expect } from "vitest";
import { buildAnimationSrcdoc } from "./buildAnimationSrcdoc.js";

describe("buildAnimationSrcdoc", () => {
  it("inlines the user fragment with CSP, error bridge, and reduced-motion flag", () => {
    const html = buildAnimationSrcdoc('<div id="thing"></div><script>console.log("hi");</script>');
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('<div id="thing"></div>');
    expect(html).toContain('console.log("hi");');
    expect(html).toContain("anim-error");
    expect(html).toContain("sketchpadReducedMotion");
  });

  it("neutralizes </script> inside the user fragment", () => {
    const html = buildAnimationSrcdoc('<script>const s = "</script>";</script>');
    expect(html).not.toContain('const s = "</script>";');
    expect(html).toContain('const s = "<\\/script>";');
  });
});
