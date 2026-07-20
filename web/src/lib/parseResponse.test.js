import { describe, it, expect } from "vitest";
import { parseResponse } from "./parseResponse.js";

describe("parseResponse", () => {
  it("passes through plain text", () => {
    const r = parseResponse("Just an explanation.");
    expect(r).toEqual({ visibleText: "Just an explanation.", animationCode: null, pending: false });
  });

  it("extracts a complete animation block", () => {
    const r = parseResponse("Intro text.\n\n```animation\nconst s = createScene();\n```\n\nOutro.");
    expect(r.visibleText).toBe("Intro text.\n\nOutro.");
    expect(r.animationCode).toBe("const s = createScene();");
    expect(r.pending).toBe(false);
  });

  it("hides a partial block while streaming", () => {
    const r = parseResponse("Intro.\n\n```animation\nconst s = crea");
    expect(r.visibleText).toBe("Intro.");
    expect(r.animationCode).toBe(null);
    expect(r.pending).toBe(true);
  });

  it("hides the bare opening fence itself", () => {
    const r = parseResponse("Intro.\n\n```animation");
    expect(r.visibleText).toBe("Intro.");
    expect(r.pending).toBe(true);
  });

  it("ignores other fenced blocks", () => {
    const text = "Look:\n```python\nprint(1)\n```\ndone";
    const r = parseResponse(text);
    expect(r.visibleText).toBe(text);
    expect(r.animationCode).toBe(null);
  });
});
