import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { streamCompletion } from "./llm.js";
import { TUTOR_SYSTEM_PROMPT, FIX_SYSTEM_PROMPT } from "./prompts.js";
import { createLimiter, rateLimitMiddleware } from "./rateLimit.js";

const app = express();
app.set("trust proxy", true);
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
    // Claude's adaptive thinking can run silently for many seconds before
    // the first visible delta arrives. Keep the connection alive across
    // that gap (and any proxy/host idle-response timeout) with an SSE
    // comment line, which EventSource and this client's `data: `-prefixed
    // parsing both ignore.
    const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 15000);
    // Stop writing as soon as the student closes the tab -- otherwise the
    // interval keeps firing at a socket that no longer exists, from a timer
    // callback outside Express's error handling.
    req.on("close", () => clearInterval(heartbeat));
    let hadError = false;
    let full = "";
    // The client reads a missing <<<END>>> as "still streaming" and spins
    // forever, so whenever the stream stops -- normally or early -- the text
    // has to be left in a state the parser considers finished. Two ways it
    // can be left open: the model ends its turn without the closing marker,
    // or an error cuts it off partway (most likely inside the animation,
    // since that code is the tail of the response).
    const closeOpenSections = () => {
      if (!full.includes("<<<ANIMATION>>>")) {
        send({ type: "delta", text: "\n<<<ANIMATION>>>\n<<<END>>>" });
        full += "\n<<<ANIMATION>>>\n<<<END>>>";
      } else if (!full.includes("<<<END>>>")) {
        send({ type: "delta", text: "\n<<<END>>>" });
        full += "\n<<<END>>>";
      }
    };
    try {
      for await (const event of streamCompletion({
        systemPrompt: TUTOR_SYSTEM_PROMPT,
        input: buildTranscript(messages),
      })) {
        // Close first, so an error message appended by the client lands
        // after the marker instead of inside the animation fragment.
        if (event.type === "error") closeOpenSections();
        send(event);
        if (event.type === "delta") full += event.text;
        if (event.type === "error") {
          hadError = true;
          console.error(event.message);
        }
      }
      if (!hadError) {
        closeOpenSections();
        send({ type: "done" });
      }
    } finally {
      clearInterval(heartbeat);
    }
    res.end();
  }
);

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
      input: `This animation fragment failed.\n\nFragment:\n${code}\n\nError:\n${error}\n\nReturn the corrected fragment.`,
    })) {
      if (event.type === "delta") text += event.text;
      else if (event.type === "error") failure = event.message;
    }
    if (failure) {
      console.error(failure);
      return res.status(500).json({ code: null, error: failure });
    }
    res.json({ code: text.trim() || null });
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
