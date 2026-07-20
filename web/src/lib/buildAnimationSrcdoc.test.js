import { describe, it, expect } from "vitest";
import { buildAnimationSrcdoc } from "./buildAnimationSrcdoc.js";

describe("buildAnimationSrcdoc", () => {
  it("inlines library and user code with CSP and error bridge", () => {
    const html = buildAnimationSrcdoc("/*LIB*/", "createScene();");
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("/*LIB*/");
    expect(html).toContain("createScene();");
    expect(html).toContain("anim-error");
    expect(html).toContain('<div id="stage">');
  });

  it("neutralizes </script> inside user code", () => {
    const html = buildAnimationSrcdoc("/*LIB*/", 'const s = "</script>";');
    // the raw closing tag must not appear inside the injected code
    expect(html).not.toContain('const s = "</script>";');
    expect(html).toContain('const s = "<\\/script>";');
  });
});
