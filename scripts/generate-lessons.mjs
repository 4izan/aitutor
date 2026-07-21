// Generates the Artifact demo lessons through the real tutor pipeline.
// Requires the dev server (npm run dev) and a logged-in Claude Code install.
import { writeFileSync, mkdirSync } from "fs";

const LESSONS = [
  { id: "projectile", title: "Projectile motion in 3D", prompt: "Show me projectile motion in 3D" },
  { id: "orbit", title: "Planetary orbits", prompt: "Explain planetary orbits" },
  { id: "sine", title: "Sine waves from circular motion", prompt: "Show how a sine wave comes from circular motion" },
  { id: "pendulum", title: "Why pendulums swing", prompt: "Why does a pendulum swing?" },
  { id: "surface", title: "Functions of two variables", prompt: "Explain functions of two variables using a 3D surface" },
  { id: "interference", title: "Wave interference", prompt: "Show wave interference" },
];

const FORBIDDEN = /\b(document\.|window\.|fetch\s*\(|setTimeout|setInterval|requestAnimationFrame|import\s|export\s|eval\s*\(|XMLHttpRequest)/;

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

function split(full) {
  const m = full.match(/```animation\s*\n([\s\S]*?)```/);
  if (!m) throw new Error("no animation block");
  const code = m[1].trim();
  if (FORBIDDEN.test(code)) throw new Error(`forbidden API: ${code.match(FORBIDDEN)[0]}`);
  new Function(code); // throws on syntax error
  const explanationMd = full.replace(m[0], "").replace(/\n{3,}/g, "\n\n").trim();
  return { explanationMd, animationCode: code };
}

const out = [];
for (const lesson of LESSONS) {
  process.stdout.write(`Generating: ${lesson.title} ... `);
  try {
    const full = await ask(lesson.prompt);
    out.push({ ...lesson, ...split(full) });
    console.log("ok");
  } catch (e) {
    console.log(`FAILED (${e.message})`);
    process.exitCode = 1;
  }
}

if (process.exitCode) {
  console.log("\nNot writing lessons.json — fix failures and re-run.");
} else {
  mkdirSync("artifact", { recursive: true });
  writeFileSync("artifact/lessons.json", JSON.stringify(out, null, 2));
  console.log(`\nartifact/lessons.json written (${out.length} lessons)`);
}
