// Acceptance checker: hits /api/chat with a set of canonical prompts and
// validates each generated animation block (present, valid syntax, no
// forbidden APIs). Requires the dev server (npm run dev).
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

const FORBIDDEN = /\b(document\.|window\.|fetch\s*\(|setTimeout|setInterval|requestAnimationFrame|import\s|export\s|eval\s*\(|XMLHttpRequest)/;

function extractAnimation(text) {
  const m = text.match(/```animation\s*\n([\s\S]*?)```/);
  return m ? m[1].trim() : null;
}

async function ask(prompt) {
  const res = await fetch("http://localhost:3001/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
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

let failures = 0;
for (const prompt of PROMPTS) {
  process.stdout.write(`\n=== ${prompt}\n`);
  try {
    const full = await ask(prompt);
    const code = extractAnimation(full);
    if (!code) { console.log("FAIL: no animation block"); failures++; continue; }
    const forbidden = code.match(FORBIDDEN);
    if (forbidden) { console.log(`FAIL: forbidden API: ${forbidden[0]}`); failures++; continue; }
    try { new Function(code); } catch (e) { console.log(`FAIL: syntax error: ${e.message}`); failures++; continue; }
    console.log(`PASS: ${code.split("\n").length} lines, createScene3D=${/createScene3D\s*\(/.test(code)}, tween=${/\.tween\s*\(/.test(code)}`);
  } catch (e) {
    console.log(`FAIL: request error: ${e.message}`);
    failures++;
  }
}
console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURES"}`);
process.exit(failures === 0 ? 0 : 1);
