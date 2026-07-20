import express from "express";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { TUTOR_SYSTEM_PROMPT, FIX_SYSTEM_PROMPT } from "./prompts.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

export function buildTranscript(messages) {
  return messages
    .map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`)
    .join("\n\n");
}

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array required" });
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  try {
    const q = query({
      prompt: buildTranscript(messages),
      options: {
        systemPrompt: TUTOR_SYSTEM_PROMPT,
        tools: [],
        maxTurns: 1,
        includePartialMessages: true,
      },
    });
    for await (const message of q) {
      if (
        message.type === "stream_event" &&
        message.event?.type === "content_block_delta" &&
        message.event.delta?.type === "text_delta"
      ) {
        send({ type: "delta", text: message.event.delta.text });
      }
    }
    send({ type: "done" });
  } catch (err) {
    console.error(err);
    send({ type: "error", message: String(err?.message ?? err) });
  } finally {
    res.end();
  }
});

function extractCodeBlock(text) {
  const m = text.match(/```(?:animation|javascript|js)?\s*\n([\s\S]*?)```/);
  return m ? m[1].trim() : null;
}

app.post("/api/fix", async (req, res) => {
  const { code, error } = req.body ?? {};
  if (!code || !error) {
    return res.status(400).json({ error: "code and error required" });
  }
  try {
    const q = query({
      prompt: `This animation script failed.\n\nScript:\n\`\`\`\n${code}\n\`\`\`\n\nRuntime error:\n${error}\n\nReturn the corrected script.`,
      options: {
        systemPrompt: FIX_SYSTEM_PROMPT,
        tools: [],
        maxTurns: 1,
      },
    });
    let text = "";
    for await (const message of q) {
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "text") text += block.text;
        }
      }
    }
    res.json({ code: extractCodeBlock(text) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: null, error: String(err?.message ?? err) });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`AI Tutor server listening on http://localhost:${PORT}`);
});
