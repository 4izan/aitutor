import { describe, it, expect } from "vitest";
import "./tutorAnim.js";

const A = globalThis.TutorAnim;

describe("lerp and easings", () => {
  it("lerps linearly", () => {
    expect(A.lerp(0, 10, 0.5)).toBe(5);
    expect(A.lerp(2, 4, 0)).toBe(2);
    expect(A.lerp(2, 4, 1)).toBe(4);
  });
  it("easings map 0->0 and 1->1", () => {
    for (const name of ["linear", "easeIn", "easeOut", "easeInOut"]) {
      expect(A.easings[name](0)).toBeCloseTo(0);
      expect(A.easings[name](1)).toBeCloseTo(1);
    }
  });
});

describe("makeTransform", () => {
  const T = A.makeTransform({ width: 200, height: 100, xmin: -1, xmax: 1, ymin: 0, ymax: 2 });
  it("maps world x to pixels", () => {
    expect(T.toX(-1)).toBe(0);
    expect(T.toX(1)).toBe(200);
    expect(T.toX(0)).toBe(100);
  });
  it("maps world y to pixels with flipped axis", () => {
    expect(T.toY(0)).toBe(100);
    expect(T.toY(2)).toBe(0);
  });
  it("scales lengths", () => {
    expect(T.scaleX(1)).toBe(100);
    expect(T.scaleY(1)).toBe(50);
  });
});

describe("tweens", () => {
  it("interpolates target props over time with delay", () => {
    const ball = { x: 0, y: 5 };
    const tweens = [
      { target: ball, props: { x: [0, 10] }, delay: 0, duration: 2, easing: A.easings.linear },
      { target: ball, props: { y: [5, 0] }, delay: 1, duration: 1, easing: A.easings.linear },
    ];
    A.applyTweens(tweens, 1);
    expect(ball.x).toBeCloseTo(5);
    expect(ball.y).toBeCloseTo(5); // second tween just starting
    A.applyTweens(tweens, 2);
    expect(ball.x).toBeCloseTo(10);
    expect(ball.y).toBeCloseTo(0);
  });
  it("clamps before delay and after end", () => {
    const p = { v: -1 };
    const tweens = [{ target: p, props: { v: [0, 1] }, delay: 1, duration: 1, easing: A.easings.linear }];
    A.applyTweens(tweens, 0);
    expect(p.v).toBe(0);
    A.applyTweens(tweens, 99);
    expect(p.v).toBe(1);
  });
  it("supports function-valued props for non-linear motion", () => {
    const bob = { x: 0 };
    const tweens = [
      { target: bob, props: { x: (t) => Math.sin(t * Math.PI) }, delay: 0, duration: 2, easing: A.easings.linear },
    ];
    A.applyTweens(tweens, 1); // halfway -> t = 0.5 -> sin(pi/2) = 1
    expect(bob.x).toBeCloseTo(1);
    A.applyTweens(tweens, 2); // end -> sin(pi) = 0
    expect(bob.x).toBeCloseTo(0);
  });
  it("computes timeline duration", () => {
    expect(A.timelineDuration([
      { delay: 0, duration: 2 },
      { delay: 1.5, duration: 1 },
    ])).toBe(2.5);
    expect(A.timelineDuration([])).toBe(0);
  });
});

describe("isClick", () => {
  it("treats a stationary pointer as a click", () => {
    expect(A.isClick({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(true);
  });
  it("treats a tiny wobble under the default threshold as a click", () => {
    expect(A.isClick({ x: 100, y: 100 }, { x: 102, y: 101 })).toBe(true);
  });
  it("treats a point exactly at the default 5px threshold as a click", () => {
    expect(A.isClick({ x: 0, y: 0 }, { x: 5, y: 0 })).toBe(true);
  });
  it("treats movement past the default threshold as a drag, not a click", () => {
    expect(A.isClick({ x: 0, y: 0 }, { x: 6, y: 0 })).toBe(false);
    expect(A.isClick({ x: 0, y: 0 }, { x: 50, y: 50 })).toBe(false);
  });
  it("respects a custom threshold", () => {
    expect(A.isClick({ x: 0, y: 0 }, { x: 20, y: 0 }, 25)).toBe(true);
    expect(A.isClick({ x: 0, y: 0 }, { x: 20, y: 0 }, 10)).toBe(false);
  });
});
