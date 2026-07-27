import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
// Claude Sonnet 5 runs adaptive thinking by default at "high" effort, and
// thinking tokens share this same budget with visible output. Observed
// thinking spend at "high" effort was non-deterministic across identical
// prompts (1.7k-8k+ tokens for the same prompt across runs) -- effort is
// set to "medium" below specifically to keep thinking spend near zero
// (confirmed via live testing: thinking_tokens=0 across all 8 canonical
// prompts at "medium", vs the same prompts sometimes consuming the full
// budget on thinking alone at "high"). MAX_TOKENS stays generous (well
// above the ~2000-3000 tokens actually used per response at "medium") as
// a second line of defense -- not because ANIMATION_RULES' "40-90 line"
// budget needs the extra room, since that rule constrains visible output
// only, not thinking.
const MAX_TOKENS = 24000;

export async function* streamCompletion({ systemPrompt, input }) {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const stream = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      output_config: { effort: "medium" },
      system: systemPrompt,
      messages: [{ role: "user", content: input }],
      stream: true,
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        yield { type: "delta", text: event.delta.text };
      } else if (event.type === "message_delta" && event.delta?.stop_reason === "max_tokens") {
        yield { type: "error", message: "Response was cut off before completing. Please try again." };
      }
    }
  } catch (err) {
    yield { type: "error", message: String(err?.message ?? err) };
  }
}
