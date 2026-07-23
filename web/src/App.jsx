import { useRef, useState } from "react";
import AssistantMessage from "./components/AssistantMessage.jsx";
import PinnedViewport from "./components/PinnedViewport.jsx";
import { parseResponse } from "./lib/parseResponse.js";

const EXAMPLE_QUESTIONS = [
  "Why does a pendulum swing?",
  "What caused the fall of the Berlin Wall?",
  "How does supply and demand set prices?",
  "What makes a sonnet different from free verse?",
  "How do plants convert sunlight into energy?",
];

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [exampleQuestion] = useState(
    () => EXAMPLE_QUESTIONS[Math.floor(Math.random() * EXAMPLE_QUESTIONS.length)]
  );
  const listRef = useRef(null);

  async function streamChat(requestHistory, onDelta) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: requestHistory }),
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistantText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop(); // keep incomplete tail
      for (const ev of events) {
        const line = ev.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const data = JSON.parse(line.slice(6));
        if (data.type === "delta") {
          assistantText += data.text;
          onDelta(assistantText);
        } else if (data.type === "error") {
          assistantText += `\n\n> ⚠ ${data.message}`;
          onDelta(assistantText);
        }
      }
      listRef.current?.scrollTo(0, listRef.current.scrollHeight);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    const history = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    try {
      await streamChat(history, (assistantText) => {
        setMessages([...history, { role: "assistant", content: assistantText }]);
      });
    } catch (err) {
      setMessages([...history, { role: "assistant", content: `> ⚠ Request failed: ${err.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    if (busy) return;
    const lastIdx = messages.length - 1;
    const prevIdx = lastIdx - 1;
    if (messages[lastIdx]?.role !== "assistant" || messages[prevIdx]?.role !== "user") return;
    setBusy(true);
    const requestHistory = [
      ...messages.slice(0, prevIdx),
      { role: "user", content: `${messages[prevIdx].content} (give a different visual approach this time)` },
    ];
    setMessages((prev) => prev.map((m, i) => (i === lastIdx ? { role: "assistant", content: "" } : m)));
    try {
      await streamChat(requestHistory, (assistantText) => {
        setMessages((prev) => prev.map((m, i) => (i === lastIdx ? { role: "assistant", content: assistantText } : m)));
      });
    } catch (err) {
      setMessages((prev) =>
        prev.map((m, i) => (i === lastIdx ? { role: "assistant", content: `> ⚠ Request failed: ${err.message}` } : m))
      );
    } finally {
      setBusy(false);
    }
  }

  const lastMessage = messages[messages.length - 1];
  const lastParsed =
    lastMessage?.role === "assistant"
      ? parseResponse(lastMessage.content)
      : { concept: "", animationHtml: null, pending: false };
  const viewportHtml = !busy && lastParsed.animationHtml ? lastParsed.animationHtml : null;
  const viewportPending = lastParsed.pending;
  const viewportConcept = lastParsed.concept;

  return (
    <div className="app">
      <div className={`ambient${busy ? " ambient-active" : ""}`} aria-hidden="true">
        <div className="ambient-mesh"></div>
      </div>
      <header className="topbar">AI Tutor <span className="sub">every subject, animated</span></header>
      <div className="layout">
        <div className="chat-col">
          <main className="chat" ref={listRef}>
            {messages.length === 0 && (
              <div className="empty">
                Ask me anything — try <em>“{exampleQuestion}”</em>
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="msg user">{m.content}</div>
              ) : (
                <AssistantMessage
                  key={i}
                  content={m.content}
                  streaming={busy && i === messages.length - 1}
                />
              )
            )}
          </main>
          <footer className="composer">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask about any subject…"
              rows={1}
            />
            <button onClick={send} disabled={busy || !input.trim()}>
              {busy ? "…" : "Send"}
            </button>
          </footer>
        </div>
        <div className="viewport-col">
          <PinnedViewport
            animationHtml={viewportHtml}
            pending={viewportPending}
            concept={viewportConcept}
            onRedraw={regenerate}
          />
        </div>
      </div>
    </div>
  );
}
