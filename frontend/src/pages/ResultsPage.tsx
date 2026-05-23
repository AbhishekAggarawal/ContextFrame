import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  ListChecks,
  Lightbulb,
  HelpCircle,
  MessageSquare,
  ArrowLeft,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import { getJobStatus, getJobResults, type JobStatus } from "../api";
import { useJob } from "../context/JobContext";
import { renderMarkdown } from "../utils/markdown";

type Tab = "summary" | "action_items" | "decisions" | "questions" | "transcript";

export default function ResultsPage() {
  const navigate = useNavigate();
  const { activeJobId, jobStatus, setJobStatus } = useJob();
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!activeJobId) {
      // Try loading from context
      return;
    }
    if (jobStatus?.status === "done" && jobStatus.result) return;

    const fetchResults = async () => {
      setLoading(true);
      try {
        const res = await getJobResults(activeJobId);
        if (res.result) {
          setJobStatus({
            job_id: activeJobId,
            status: "done",
            result: res.result,
            progress: 100,
            message: "Complete",
          });
        }
      } catch {
        // Fallback to polling
        try {
          const status = await getJobStatus(activeJobId);
          setJobStatus(status);
        } catch {
          // ignore
        }
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, [activeJobId]);

  const result = jobStatus?.result;

  if (!activeJobId || (!result && !loading)) {
    return (
      <div style={{ animation: "fadeInUp 0.5s ease forwards", textAlign: "center", paddingTop: 80 }}>
        <FileText size={48} color="var(--text-muted)" style={{ marginBottom: 16 }} />
        <h2 style={{ marginBottom: 8 }}>No results available</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
          Process a video first to see results.
        </p>
        <button className="btn-primary" onClick={() => navigate("/upload")}>
          Start New Analysis
        </button>
      </div>
    );
  }

  if (loading || !result) {
    return (
      <div style={{ textAlign: "center", paddingTop: 80 }}>
        <Loader2 size={40} color="var(--accent-secondary)" style={{ animation: "spin 1s linear infinite", marginBottom: 16 }} />
        <p style={{ color: "var(--text-secondary)" }}>Loading results...</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof FileText }[] = [
    { key: "summary", label: "Summary", icon: FileText },
    { key: "action_items", label: "Action Items", icon: ListChecks },
    { key: "decisions", label: "Key Decisions", icon: Lightbulb },
    { key: "questions", label: "Open Questions", icon: HelpCircle },
    { key: "transcript", label: "Transcript", icon: FileText },
  ];

  const tabContent: Record<Tab, string> = {
    summary: result.summary || "No summary generated.",
    action_items: result.action_items || "No action items found.",
    decisions: result.key_decisions || "No key decisions found.",
    questions: result.open_questions || "No open questions found.",
    transcript: result.transcript || "Transcript not available.",
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(tabContent[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ animation: "fadeInUp 0.5s ease forwards" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <button
            onClick={() => navigate(-1)}
            className="btn-secondary"
            style={{ marginBottom: 12, padding: "6px 14px", fontSize: "0.82rem" }}
          >
            <ArrowLeft size={14} />
            Back
          </button>
          <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: 4 }}>
            {result.title || "Video Analysis"}
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            AI-generated insights from your video content
          </p>
        </div>
        <button className="btn-primary" onClick={() => navigate("/chat")}>
          <MessageSquare size={16} />
          Chat with Video
        </button>
      </div>

      {/* Tab Bar */}
      <div
        style={{
          display: "flex",
          gap: 4,
          background: "var(--bg-input)",
          borderRadius: "var(--radius-md)",
          padding: 4,
          marginBottom: 24,
          marginTop: 20,
          overflowX: "auto",
          border: "1px solid var(--border-color)",
        }}
      >
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 18px",
              borderRadius: "var(--radius-sm)",
              border: "none",
              cursor: "pointer",
              background: activeTab === key ? "var(--accent-primary)" : "transparent",
              color: activeTab === key ? "#fff" : "var(--text-secondary)",
              fontWeight: activeTab === key ? 600 : 400,
              fontSize: "0.85rem",
              whiteSpace: "nowrap",
              transition: "all 0.2s ease",
              flexShrink: 0,
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div
        className="card"
        style={{ position: "relative" }}
      >
        {/* Copy button */}
        <button
          onClick={handleCopy}
          className="btn-secondary"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            padding: "6px 12px",
            fontSize: "0.78rem",
          }}
        >
          {copied ? (
            <>
              <Check size={14} />
              Copied
            </>
          ) : (
            <>
              <Copy size={14} />
              Copy
            </>
          )}
        </button>

        <div
          className="markdown-content"
          style={{
            fontSize: "0.92rem",
            lineHeight: 1.8,
            wordBreak: "break-word",
            paddingRight: 80,
            maxHeight: "60vh",
            overflow: "auto",
          }}
          dangerouslySetInnerHTML={{
            __html: renderMarkdown(tabContent[activeTab]),
          }}
        />
      </div>
    </div>
  );
}