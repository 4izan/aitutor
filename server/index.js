import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { streamCompletion } from "./llm.js";
import { TUTOR_SYSTEM_PROMPT, FIX_SYSTEM_PROMPT } from "./prompts.js";
import { createLimiter, rateLimitMiddleware } from "./rateLimit.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const TEN_MINUTES = 10 * 60 * 1000;
const chatLimiter = createLimiter({ windowMs: TEN_MINUTES, max: 15 });
const fixLimiter = createLimiter({ windowMs: TEN_MINUTES, max: 15 });

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

export function buildTranscript(messages) {
  return messages
    .map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`)
    .join("\n\n");
}

app.post(
  "/api/chat",
  rateLimitMiddleware(chatLimiter, (res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.write(
      `data: ${JSON.stringify({
        type: "error",
        message: "You're sending messages too quickly — please wait a few minutes and try again.",
      })}\n\n`
    );
    res.end();
  }),
  async (req, res) => {
    const { messages } = req.body ?? {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array required" });
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.flushHeaders();
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    let hadError = false;
    for await (const event of streamCompletion({
      systemPrompt: TUTOR_SYSTEM_PROMPT,
      input: buildTranscript(messages),
    })) {
      send(event);
      if (event.type === "error") hadError = true;
    }
    if (!hadError) send({ type: "done" });
    res.end();
  }
);

function extractCodeBlock(text) {
  const m = text.match(/```(?:animation|javascript|js)?\s*\n([\s\S]*?)```/);
  return m ? m[1].trim() : null;
}

app.post(
  "/api/fix",
  rateLimitMiddleware(fixLimiter, (res) => {
    res.status(429).json({ code: null });
  }),
  async (req, res) => {
    const { code, error } = req.body ?? {};
    if (!code || !error) {
      return res.status(400).json({ error: "code and error required" });
    }
    let text = "";
    let failure = null;
    for await (const event of streamCompletion({
      systemPrompt: FIX_SYSTEM_PROMPT,
      input: `This animation script failed.\n\nScript:\n\`\`\`\n${code}\n\`\`\`\n\nRuntime error:\n${error}\n\nReturn the corrected script.`,
    })) {
      if (event.type === "delta") text += event.text;
      else if (event.type === "error") failure = event.message;
    }
    if (failure) {
      console.error(failure);
      return res.status(500).json({ code: null, error: failure });
    }
    res.json({ code: extractCodeBlock(text) });
  }
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "..", "dist");

app.use(express.static(distDir));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`AI Tutor server listening on http://localhost:${PORT}`);
});
