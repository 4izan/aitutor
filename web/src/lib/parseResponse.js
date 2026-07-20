const OPEN = "```animation";

export function parseResponse(text) {
  const start = text.indexOf(OPEN);
  if (start === -1) {
    return { visibleText: text, animationCode: null, pending: false };
  }
  const before = text.slice(0, start).trimEnd();
  const afterOpen = text.indexOf("\n", start);
  if (afterOpen === -1) {
    // fence line itself still streaming
    return { visibleText: before, animationCode: null, pending: true };
  }
  const rest = text.slice(afterOpen + 1);
  const close = rest.indexOf("```");
  if (close === -1) {
    return { visibleText: before, animationCode: null, pending: true };
  }
  const animationCode = rest.slice(0, close).trim();
  const after = rest.slice(close + 3).replace(/^[ \t]*\n?/, "");
  const visibleText = after.trim() ? `${before}\n\n${after.trim()}` : before;
  return { visibleText, animationCode, pending: false };
}
