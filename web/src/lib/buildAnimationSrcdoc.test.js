import { describe, it, expect } from "vitest";
import { buildAnimationSrcdoc } from "./buildAnimationSrcdoc.js";

describe("buildAnimationSrcdoc", () => {
  it("inlines three, engine, and user code with CSP and error bridge", () => {
    const html = buildAnimationSrcdoc("/*THREE*/", "/*ENGINE*/", "createScene3D();");
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("/*THREE*/");
    expect(html).toContain("/*ENGINE*/");
    expect(html).toContain("createScene3D();");
    expect(html).toContain("anim-error");
    expect(html).toContain('<div id="stage">');
    // three must load before the engine, engine before user code
    expect(html.indexOf("/*THREE*/")).toBeLessThan(html.indexOf("/*ENGINE*/"));
    expect(html.indexOf("/*ENGINE*/")).toBeLessThan(html.indexOf("createScene3D();"));
  });

  it("neutralizes </script> inside user code", () => {
    const html = buildAnimationSrcdoc("/*THREE*/", "/*ENGINE*/", 'const s = "</script>";');
    expect(html).not.toContain('const s = "</script>";');
    expect(html).toContain('const s = "<\\/script>";');
  });
});
