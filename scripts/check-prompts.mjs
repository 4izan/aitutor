// Acceptance checker: hits /api/chat with a set of canonical prompts and
// validates each generated hologram animation fragment (present, valid
// syntax, no forbidden APIs). Requires the dev server (npm run dev).
const PROMPTS = [
  "Explain what a sine wave is",
  "Why does a pendulum swing?",
  "How does bubble sort work?",
  "Show me projectile motion",
  "What is a derivative?",
  "What caused the fall of the Berlin Wall?",
  "How does supply and demand set prices?",
  "What makes a sonnet different from free verse?",
];

const FORBIDDEN = /\b(fetch\s*\(|XMLHttpRequest|eval\s*\(|import\s|export\s)/;

function extractAnimation(text) {
  const start = text.indexOf("<<<ANIMATION>>>");
  const end = text.indexOf("<<<END>>>");
  if (start === -1 || end === -1) return null;
  const html = text.slice(start + "<<<ANIMATION>>>".length, end).trim();
  return html || null;
}

function findScriptSyntaxError(animationHtml) {
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(animationHtml)) !== null) {
    const code = match[1];
    if (!code || !code.trim()) continue;
    try {
      new Function(code);
    } catch (e) {
      return e.message;
    }
  }
  return null;
}

async function askOnce(prompt) {
  const res = await fetch("http://localhost:3001/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(180_000),
  });
  const raw = await res.text();
  let full = "";
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const data = JSON.parse(line.slice(6));
    if (data.type === "delta") full += data.text;
    if (data.type === "error") throw new Error(data.message);
  }
  return full;
}

async function ask(prompt) {
  try {
    return await askOnce(prompt);
  } catch (e) {
    // Transient connection hiccups (e.g. "fetch failed", "terminated") have
    // been observed intermittently against this endpoint -- retry once
    // before treating it as a real failure.
    console.log(`  (retrying after: ${e.message})`);
    return await askOnce(prompt);
  }
}

let failures = 0;
for (const prompt of PROMPTS) {
  process.stdout.write(`\n=== ${prompt}\n`);
  try {
    const full = await ask(prompt);
    const html = extractAnimation(full);
    if (!html) { console.log("FAIL: no animation fragment"); failures++; continue; }
    const forbidden = html.match(FORBIDDEN);
    if (forbidden) { console.log(`FAIL: forbidden API: ${forbidden[0]}`); failures++; continue; }
    const syntaxErr = findScriptSyntaxError(html);
    if (syntaxErr) { console.log(`FAIL: syntax error: ${syntaxErr}`); failures++; continue; }
    console.log(`PASS: ${html.split("\n").length} lines, preserve-3d=${/preserve-3d/.test(html)}, setPointerCapture=${/setPointerCapture/.test(html)}`);
  } catch (e) {
    console.log(`FAIL: request error: ${e.message}`);
    failures++;
  }
}
console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURES"}`);
process.exit(failures === 0 ? 0 : 1);
