const CONCEPT_OPEN = "<<<CONCEPT>>>";
const EXPLANATION_OPEN = "<<<EXPLANATION>>>";
const ANIMATION_OPEN = "<<<ANIMATION>>>";
const END = "<<<END>>>";

export function parseResponse(text) {
  const conceptStart = text.indexOf(CONCEPT_OPEN);
  if (conceptStart === -1) {
    return { concept: "", visibleText: text, animationHtml: null, pending: false };
  }

  const explanationStart = text.indexOf(EXPLANATION_OPEN);
  if (explanationStart === -1) {
    return { concept: "", visibleText: "", animationHtml: null, pending: true };
  }
  const concept = text.slice(conceptStart + CONCEPT_OPEN.length, explanationStart).trim();

  const animationStart = text.indexOf(ANIMATION_OPEN);
  if (animationStart === -1) {
    const visibleText = text.slice(explanationStart + EXPLANATION_OPEN.length).trim();
    return { concept, visibleText, animationHtml: null, pending: true };
  }
  const visibleText = text.slice(explanationStart + EXPLANATION_OPEN.length, animationStart).trim();

  const rest = text.slice(animationStart + ANIMATION_OPEN.length);
  const endIdx = rest.indexOf(END);
  if (endIdx === -1) {
    return { concept, visibleText, animationHtml: null, pending: true };
  }
  const animationHtml = rest.slice(0, endIdx).trim();
  return { concept, visibleText, animationHtml: animationHtml || null, pending: false };
}
