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

function Composer({ input, setInput, onSend, busy, hero, children }) {
  return (
    <div className={`composer${hero ? " composer-hero" : ""}`}>
      <div className="composer-box">
        <span className="composer-edge" aria-hidden="true"></span>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Ask about any subject…"
          rows={hero ? 2 : 1}
        />
        <div className="composer-bar">
          <div className="composer-meta">{children}</div>
          <button
            className="btn-primary"
            onClick={onSend}
            disabled={busy || !input.trim()}
            aria-label="Send question"
          >
            {busy ? "…" : "Explain it"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
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

  async function sendText(text) {
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

  function send() {
    sendText(input.trim());
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

  const isHero = messages.length === 0;

  return (
    <div className={`app${isHero ? " is-hero" : ""}`}>
      <div className={`rays${busy ? " rays-active" : ""}`} aria-hidden="true"></div>

      {isHero ? (
        <main className="hero">
          <span className="hero-badge">
            <span className="hero-badge-dot" aria-hidden="true"></span>
            Every subject, animated in 3D
          </span>
          <h1 className="hero-title">
            What do you want to <span className="hero-title-accent">understand</span>?
          </h1>
          <p className="hero-sub">
            Ask about anything — physics, history, poetry — and watch it explained
            with an interactive 3D scene you can spin.
          </p>
          <Composer input={input} setInput={setInput} onSend={send} busy={busy} hero />
          <div className="chips">
            <span className="chips-label">or try</span>
            {EXAMPLE_QUESTIONS.slice(0, 3).map((q) => (
              <button key={q} className="chip" onClick={() => sendText(q)} disabled={busy}>
                {q}
              </button>
            ))}
          </div>
        </main>
      ) : (
        <>
          <header className="topbar">
            <span className="topbar-mark">AI Tutor</span>
            <span className="sub">every subject, animated</span>
          </header>
          <div className="layout">
            <div className="chat-col">
              <main className="chat" ref={listRef}>
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
              <Composer input={input} setInput={setInput} onSend={send} busy={busy} />
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
        </>
      )}
    </div>
  );
}
