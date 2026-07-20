import { useRef, useState } from "react";
import AssistantMessage from "./components/AssistantMessage.jsx";

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    const history = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
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
            setMessages([...history, { role: "assistant", content: assistantText }]);
          } else if (data.type === "error") {
            assistantText += `\n\n> ⚠ ${data.message}`;
            setMessages([...history, { role: "assistant", content: assistantText }]);
          }
        }
        listRef.current?.scrollTo(0, listRef.current.scrollHeight);
      }
    } catch (err) {
      setMessages([...history, { role: "assistant", content: `> ⚠ Request failed: ${err.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">AI Tutor <span className="sub">math &amp; physics, animated</span></header>
      <main className="chat" ref={listRef}>
        {messages.length === 0 && (
          <div className="empty">
            Ask me anything — try <em>“Why does a pendulum swing?”</em>
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
          placeholder="Ask a math or physics question…"
          rows={1}
        />
        <button onClick={send} disabled={busy || !input.trim()}>
          {busy ? "…" : "Send"}
        </button>
      </footer>
    </div>
  );
}
