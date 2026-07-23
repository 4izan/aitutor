function neutralize(code) {
  return code.replaceAll("</script", "<\\/script");
}

export function buildAnimationSrcdoc(userFragment) {
  return `<!doctype html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<style>
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #06080B; }
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
${neutralize(userFragment)}
</body>
</html>`;
}
