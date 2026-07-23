export function findScriptSyntaxError(animationHtml) {
  if (!animationHtml) return null;
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(animationHtml)) !== null) {
    const code = match[1];
    if (!code || !code.trim()) continue;
    try {
      new Function(code);
    } catch (syntaxErr) {
      return syntaxErr.message;
    }
  }
  return null;
}
