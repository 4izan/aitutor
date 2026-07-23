import { describe, it, expect } from "vitest";
import { parseResponse } from "./parseResponse.js";

describe("parseResponse", () => {
  it("passes through plain text with no structure (e.g. small talk)", () => {
    const r = parseResponse("Just chatting, no diagram needed here.");
    expect(r).toEqual({ concept: "", visibleText: "Just chatting, no diagram needed here.", animationHtml: null, pending: false });
  });

  it("hides everything while only the concept marker has streamed in", () => {
    const r = parseResponse("<<<CONCEPT>>>\nBattery Ba");
    expect(r.concept).toBe("");
    expect(r.visibleText).toBe("");
    expect(r.animationHtml).toBe(null);
    expect(r.pending).toBe(true);
  });

  it("extracts the concept once the explanation marker arrives, streams explanation live", () => {
    const r = parseResponse("<<<CONCEPT>>>\nBattery Basics\n<<<EXPLANATION>>>\nA battery sto");
    expect(r.concept).toBe("Battery Basics");
    expect(r.visibleText).toBe("A battery sto");
    expect(r.animationHtml).toBe(null);
    expect(r.pending).toBe(true);
  });

  it("stops growing the explanation once the animation marker opens, still pending", () => {
    const r = parseResponse(
      "<<<CONCEPT>>>\nBattery Basics\n<<<EXPLANATION>>>\nA battery stores energy.\n<<<ANIMATION>>>\n<div>partial"
    );
    expect(r.visibleText).toBe("A battery stores energy.");
    expect(r.animationHtml).toBe(null);
    expect(r.pending).toBe(true);
  });

  it("extracts the complete animation fragment once <<<END>>> arrives", () => {
    const r = parseResponse(
      "<<<CONCEPT>>>\nBattery Basics\n<<<EXPLANATION>>>\nA battery stores energy.\n<<<ANIMATION>>>\n<div>hologram</div>\n<<<END>>>"
    );
    expect(r.concept).toBe("Battery Basics");
    expect(r.visibleText).toBe("A battery stores energy.");
    expect(r.animationHtml).toBe("<div>hologram</div>");
    expect(r.pending).toBe(false);
  });

  it("treats an empty animation section as no animation (small-talk exemption)", () => {
    const r = parseResponse(
      "<<<CONCEPT>>>\nJust Chatting\n<<<EXPLANATION>>>\nHaha, sure thing!\n<<<ANIMATION>>>\n\n<<<END>>>"
    );
    expect(r.animationHtml).toBe(null);
    expect(r.pending).toBe(false);
  });
});
