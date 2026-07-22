import { marked } from "marked";
import { parseResponse } from "../lib/parseResponse.js";

export default function AssistantMessage({ content, streaming }) {
  const { visibleText, pending } = parseResponse(content);
  return (
    <div className="msg assistant">
      <div
        className="msg-text"
        dangerouslySetInnerHTML={{ __html: marked.parse(visibleText || "") }}
      />
      {streaming && !visibleText && !pending && (
        <div className="think" role="status" aria-label="Thinking">
          <span></span>
          <span></span>
          <span></span>
        </div>
      )}
    </div>
  );
}
