import Groq from "groq-sdk";

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export async function* streamCompletion({ systemPrompt, input }) {
  try {
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const stream = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: input },
      ],
      stream: true,
    });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) {
        yield { type: "delta", text };
      }
    }
  } catch (err) {
    yield { type: "error", message: String(err?.message ?? err) };
  }
}
