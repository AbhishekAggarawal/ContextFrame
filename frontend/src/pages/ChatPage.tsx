import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Send,
  Bot,
  User,
  Loader2,
  Sparkles,
  ArrowLeft,
  MessageSquare,
  Info,
} from "lucide-react";
import { askQuestion } from "../api";
import { useJob } from "../context/JobContext";
import { renderMarkdown } from "../utils/markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const navigate = useNavigate();
  const { chatJobId } = useJob();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const q = input.trim();
    if (!q || !chatJobId) return;

    setInput("");
    setError("");
    const userMsg: Message = { role: "user", content: q };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await askQuestion(chatJobId, q);
      const assistantMsg: Message = { role: "assistant", content: res.answer };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to get answer";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!chatJobId) {
    return (
      <div style={{ animation: "fadeInUp 0.5s ease forwards", textAlign: "center", paddingTop: 80 }}>
        <MessageSquare size={48} color="var(--text-muted)" style={{ marginBottom: 16 }} />
        <h2 style={{ marginBottom: 8 }}>No active video session</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
          Process a video first to start chatting with it.
        </p>
        <button className="btn-primary" onClick={() => navigate("/upload")}>
          Start New Analysis
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        animation: "fadeInUp 0.5s ease forwards",
        height: "calc(100vh - 120px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Chat with Video</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
            Ask questions about the processed video content
          </p>
        </div>
        <button className="btn-secondary" onClick={() => navigate("/results")}>
          View Results
        </button>
      </div>

      {/* Chat Area */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-color)",
          padding: "20px",
          marginBottom: 16,
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--text-muted)",
              textAlign: "center",
              padding: "0 40px",
            }}
          >
            <Bot size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
            <h3 style={{ fontSize: "1.1rem", marginBottom: 8, color: "var(--text-secondary)" }}>
              RAG-Powered Q&A
            </h3>
            <p style={{ fontSize: "0.88rem", maxWidth: 400, lineHeight: 1.5 }}>
              Your video has been indexed. Ask anything — key topics, key moments,
              specific details, or any insights from the content.
            </p>
            <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {[
                "What are the main topics covered?",
                "Summarize the key points",
                "What are the key takeaways?",
                "Any important details mentioned?",
              ].map((s) => (
                <button
                  key={s}
                  className="btn-secondary"
                  style={{ fontSize: "0.78rem", padding: "6px 14px" }}
                  onClick={() => setInput(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 12,
              marginBottom: 20,
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              animation: "slideInRight 0.3s ease forwards",
            }}
          >
            {msg.role === "assistant" && (
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "var(--radius-sm)",
                  background: "var(--gradient-hero)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Bot size={18} color="#fff" />
              </div>
            )}
            <div
              style={{
                maxWidth: "75%",
                padding: "12px 18px",
                borderRadius: "var(--radius-md)",
                background:
                  msg.role === "user"
                    ? "rgba(99, 102, 241, 0.15)"
                    : "var(--bg-card)",
                border:
                  msg.role === "user"
                    ? "1px solid rgba(99, 102, 241, 0.3)"
                    : "1px solid var(--border-color)",
                fontSize: "0.9rem",
                lineHeight: 1.6,
                wordBreak: "break-word",
              }}
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(msg.content),
              }}
            >
            </div>
            {msg.role === "user" && (
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(99, 102, 241, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <User size={18} color="var(--accent-secondary)" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--text-muted)",
              padding: "0 0 0 48px",
              animation: "pulse 1.5s ease infinite",
            }}
          >
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
            Thinking...
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            className="input-field"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about the video..."
            disabled={loading}
          />
        </div>
        <button
          className="btn-primary"
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{ padding: "12px 20px", fontSize: "0.9rem" }}
        >
          {loading ? (
            <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <Send size={18} />
          )}
        </button>
      </div>

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 14px",
            background: "rgba(248, 113, 113, 0.1)",
            border: "1px solid rgba(248, 113, 113, 0.3)",
            borderRadius: "var(--radius-md)",
            color: "var(--error)",
            fontSize: "0.83rem",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}