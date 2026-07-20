function neutralize(code) {
  return code.replaceAll("</script", "<\\/script");
}

export function buildAnimationSrcdoc(libSource, userCode) {
  return `<!doctype html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<style>
  body { margin: 0; background: #0f172a; display: flex; justify-content: center; padding: 8px 0; }
</style>
</head>
<body>
<div id="stage"></div>
<script>
window.onerror = function (msg, src, line) {
  parent.postMessage({ type: "anim-error", message: String(msg) + " (line " + line + ")" }, "*");
};
</${"script"}>
<script>
${neutralize(libSource)}
</${"script"}>
<script>
try {
${neutralize(userCode)}
} catch (err) {
  parent.postMessage({ type: "anim-error", message: String((err && err.stack) || err) }, "*");
}
</${"script"}>
</body>
</html>`;
}
