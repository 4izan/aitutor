import { marked } from "marked";
import { parseResponse } from "../lib/parseResponse.js";
import AnimationFrame from "./AnimationFrame.jsx";

export default function AssistantMessage({ content, streaming }) {
  const { visibleText, animationCode, pending } = parseResponse(content);
  return (
    <div className="msg assistant">
      <div
        className="msg-text"
        dangerouslySetInnerHTML={{ __html: marked.parse(visibleText || "") }}
      />
      {pending && <div className="anim-note">Building animation…</div>}
      {animationCode && !streaming && <AnimationFrame code={animationCode} />}
      {streaming && !visibleText && !pending && <div className="anim-note">Thinking…</div>}
    </div>
  );
}
