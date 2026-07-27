import threeSource from "../vendor/three.iife.js?raw";

// The iframe is sandboxed with an opaque origin and a `default-src 'none'` CSP,
// so it cannot fetch anything -- not even from our own origin. Three.js has to
// be inlined into the document itself. The vendored bundle contains no literal
// "</script" sequence, so it embeds without escaping.
export function buildAnimationSrcdoc(userFragment) {
  return `<!doctype html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<style>
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #0a0a0a; }
  #stage { width: 100%; height: 100%; }
  #stage canvas { display: block; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
    }
  }
</style>
</head>
<body>
<script>
window.sketchpadReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
window.onerror = function (msg, src, line) {
  parent.postMessage({ type: "anim-error", message: String(msg) + " (line " + line + ")" }, "*");
};
window.addEventListener("unhandledrejection", function (e) {
  parent.postMessage({ type: "anim-error", message: String((e.reason && e.reason.message) || e.reason || "unhandled promise rejection") }, "*");
});
</${"script"}>
<div id="stage"></div>
<script>
${threeSource}
</${"script"}>
${userFragment}
</body>
</html>`;
}
