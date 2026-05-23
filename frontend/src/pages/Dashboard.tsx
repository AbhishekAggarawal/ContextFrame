import { useNavigate } from "react-router-dom";
import {
  Video,
  FileAudio,
  MessageSquare,
  FileText,
  Zap,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import HeroAnimation from "../components/HeroAnimation";

const features = [
  {
    icon: Video,
    title: "YouTube Processing",
    desc: "Paste any YouTube URL and get instant AI analysis of the video content — summaries, key points, and more.",
  },
  {
    icon: FileAudio,
    title: "File Upload",
    desc: "Upload local video or audio files for processing. Supports all major formats.",
  },
  {
    icon: MessageSquare,
    title: "RAG Chat",
    desc: "Ask questions about your video content using RAG-powered contextual search.",
  },
  {
    icon: FileText,
    title: "Smart Summaries",
    desc: "Get auto-generated titles, summaries, key points, action items, and open questions.",
  },
];

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <div style={{ animation: "fadeInUp 0.6s ease forwards" }}>
      {/* Hero — two-column layout */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 40,
          marginBottom: 48,
          flexWrap: "wrap",
        }}
      >
        {/* Left: Text content */}
        <div style={{ flex: "1 1 400px", minWidth: 300 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(99, 102, 241, 0.1)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              padding: "6px 14px",
              borderRadius: 20,
              fontSize: "0.8rem",
              color: "var(--accent-secondary)",
              marginBottom: 20,
            }}
          >
            <Sparkles size={14} />
            AI-Powered Video Intelligence
          </div>

          <h1
            style={{
              fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
              fontWeight: 800,
              lineHeight: 1.2,
              marginBottom: 16,
              maxWidth: 600,
            }}
          >
            Transform Videos into{" "}
            <span className="gradient-text">Actionable Insights</span>
          </h1>
          <p
            style={{
              fontSize: "1.1rem",
              color: "var(--text-secondary)",
              maxWidth: 520,
              lineHeight: 1.6,
              marginBottom: 32,
            }}
          >
            Upload a video or paste a YouTube link. Our AI transcribes, summarizes,
            extracts key information, and lets you chat with your content.
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button className="btn-primary" onClick={() => navigate("/upload")}>
              <Zap size={18} />
              Start New Analysis
              <ArrowRight size={16} />
            </button>
            <button className="btn-secondary" onClick={() => navigate("/history")}>
              View Past Analyses
            </button>
          </div>
        </div>

        {/* Right: Animated visual */}
        <div
          style={{
            flex: "1 1 340px",
            minWidth: 280,
            minHeight: 360,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <HeroAnimation />
        </div>
      </div>

      {/* Feature Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 20,
        }}
      >
        {features.map(({ icon: Icon, title, desc }, i) => (
          <div
            key={title}
            className="card"
            style={{
              animation: `fadeInUp 0.5s ease forwards`,
              animationDelay: `${i * 0.1}s`,
              opacity: 0,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "var(--radius-md)",
                background: "rgba(99, 102, 241, 0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <Icon size={22} color="var(--accent-secondary)" />
            </div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: 8 }}>
              {title}
            </h3>
            <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              {desc}
            </p>
          </div>
        ))}
      </div>

      {/* Stats / Info Section */}
      <div
        style={{
          marginTop: 48,
          padding: "32px",
          background: "var(--gradient-card)",
          border: "1px solid var(--border-color)",
          borderRadius: "var(--radius-lg)",
          display: "flex",
          alignItems: "center",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--accent-secondary)" }}>
            Mistral + Whisper
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: 4 }}>
            Powered by state-of-the-art AI models
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--success)" }}>
            RAG-Enabled
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: 4 }}>
            Chat with your videos using retrieval-augmented generation
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#a78bfa" }}>
            Multi-Language
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: 4 }}>
            English & Hinglish transcription support
          </div>
        </div>
      </div>
    </div>
  );
}