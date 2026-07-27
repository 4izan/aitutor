import { describe, it, expect } from "vitest";
import { buildAnimationSrcdoc } from "./buildAnimationSrcdoc.js";

describe("buildAnimationSrcdoc", () => {
  it("inlines the user fragment with CSP, error bridge, and reduced-motion flag", () => {
    const html = buildAnimationSrcdoc('<script>console.log("hi");</script>');
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("anim-error");
    expect(html).toContain("sketchpadReducedMotion");
  });

  it("embeds the user fragment's own script tags verbatim, without mangling their close tags", () => {
    const html = buildAnimationSrcdoc('<script>console.log("hi");</script>');
    expect(html).toContain('<script>console.log("hi");</script>');
  });

  it("provides the #stage mount point the fragment renders into", () => {
    const html = buildAnimationSrcdoc("<script></script>");
    expect(html).toContain('<div id="stage"></div>');
  });

  it("inlines the Three.js bundle, since the sandboxed iframe cannot fetch it", () => {
    const html = buildAnimationSrcdoc("<script></script>");
    // The bundle defines THREE.REVISION; its presence means the real library
    // is embedded rather than referenced by URL.
    expect(html).toContain("REVISION");
    expect(html).not.toContain("<script src=");
    expect(html.length).toBeGreaterThan(500_000);
  });

  it("puts the error bridge before the library, so a library failure is still reported", () => {
    const html = buildAnimationSrcdoc("<script></script>");
    expect(html.indexOf("anim-error")).toBeLessThan(html.indexOf("REVISION"));
  });

  it("mounts #stage before the fragment runs, so it can be measured at startup", () => {
    const html = buildAnimationSrcdoc('<script>MARKER</script>');
    expect(html.indexOf('id="stage"')).toBeLessThan(html.indexOf("MARKER"));
  });
});
