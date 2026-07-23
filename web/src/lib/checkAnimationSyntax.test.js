import { describe, it, expect } from "vitest";
import { findScriptSyntaxError } from "./checkAnimationSyntax.js";

describe("findScriptSyntaxError", () => {
  it("returns null for a fragment with no script tags", () => {
    expect(findScriptSyntaxError("<div>just markup</div>")).toBe(null);
  });

  it("returns null for valid script content", () => {
    const html = '<div id="x"></div><script>const x = 1; console.log(x);</script>';
    expect(findScriptSyntaxError(html)).toBe(null);
  });

  it("returns the error message for invalid script content", () => {
    const html = "<script>const x = ;</script>";
    const err = findScriptSyntaxError(html);
    expect(err).not.toBe(null);
    expect(typeof err).toBe("string");
  });

  it("checks multiple script blocks and catches an error in a later one", () => {
    const html = "<script>const a = 1;</script><div></div><script>const b = ;</script>";
    expect(findScriptSyntaxError(html)).not.toBe(null);
  });

  it("skips empty script blocks", () => {
    const html = "<script></script><script>   </script>";
    expect(findScriptSyntaxError(html)).toBe(null);
  });

  it("returns null for empty or null input", () => {
    expect(findScriptSyntaxError("")).toBe(null);
    expect(findScriptSyntaxError(null)).toBe(null);
  });
});
