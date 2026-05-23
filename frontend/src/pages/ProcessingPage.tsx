import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Download,
  FileText,
  Volume2,
  ListChecks,
  Lightbulb,
  HelpCircle,
  Brain,
} from "lucide-react";
import { getJobStatus, type JobStatus } from "../api";
import { useJob } from "../context/JobContext";

const stageLabels: Record<string, { label: string; icon: typeof Loader2 }> = {
  queued: { label: "Queued", icon: Loader2 },
  processing: { label: "Processing Audio", icon: Volume2 },
  transcribing: { label: "Transcribing", icon: FileText },
  summarizing: { label: "Generating Summary", icon: Brain },
  extracting: { label: "Extracting Insights", icon: Lightbulb },
  done: { label: "Complete", icon: CheckCircle2 },
  error: { label: "Error", icon: XCircle },
};

export default function ProcessingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setJobStatus: setCtxStatus, setChatJobId, setActiveJobId } = useJob();
  const jobId = searchParams.get("job") || "";
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!jobId) {
      navigate("/upload");
      return;
    }

    setActiveJobId(jobId);

    const poll = async () => {
      try {
        const status = await getJobStatus(jobId);
        setJob(status);
        setCtxStatus(status);

        if (status.status === "done" || status.status === "error") {
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (status.status === "done") {
            setChatJobId(jobId);
          }
        }
      } catch {
        setError("Failed to fetch job status");
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [jobId, navigate, setCtxStatus, setChatJobId]);

  const stageInfo = job ? stageLabels[job.status] || stageLabels.queued : stageLabels.queued;
  const StageIcon = stageInfo.icon;
  const isDone = job?.status === "done";
  const isError = job?.status === "error";

  return (
    <div style={{ animation: "fadeInUp 0.5s ease forwards", maxWidth: 600 }}>
      <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: 8 }}>Processing</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 32, fontSize: "0.95rem" }}>
        {isDone
          ? "Your video is ready! Explore the results."
          : isError
          ? "Something went wrong during processing."
          : "Analyzing your video — this may take a few minutes for longer content."}
      </p>

      {/* Progress Card */}
      <div
        className="card"
        style={{
          textAlign: "center",
          padding: "40px 32px",
          marginBottom: 24,
        }}
      >
        <div style={{ marginBottom: 20 }}>
          {isDone ? (
            <CheckCircle2 size={56} color="var(--success)" />
          ) : isError ? (
            <XCircle size={56} color="var(--error)" />
          ) : (
            <div style={{ position: "relative", display: "inline-block" }}>
              <StageIcon size={48} color="var(--accent-secondary)" />
              <Loader2
                size={56}
                color="var(--accent-secondary)"
                style={{
                  position: "absolute",
                  top: -4,
                  left: -4,
                  animation: "spin 2s linear infinite",
                  opacity: 0.3,
                }}
              />
            </div>
          )}
        </div>

        <div
          style={{
            fontSize: "1.2rem",
            fontWeight: 600,
            marginBottom: 8,
            color: isError ? "var(--error)" : isDone ? "var(--success)" : "var(--text-primary)",
          }}
        >
          {isDone ? "Analysis Complete!" : isError ? "Processing Failed" : stageInfo.label}
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: 20 }}>
          {job?.message || "Initializing..."}
        </p>

        {/* Progress bar */}
        {!isDone && !isError && (
          <div className="progress-bar" style={{ marginBottom: 8 }}>
            <div
              className="progress-bar-fill"
              style={{ width: `${job?.progress || 0}%` }}
            />
          </div>
        )}
        {job && !isDone && !isError && (
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            {job.progress}% complete
          </div>
        )}

        {isError && job?.error && (
          <div
            style={{
              marginTop: 16,
              padding: "12px 16px",
              background: "rgba(248, 113, 113, 0.1)",
              borderRadius: "var(--radius-md)",
              color: "var(--error)",
              fontSize: "0.85rem",
            }}
          >
            {job.error}
          </div>
        )}
      </div>

      {/* Pipeline Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
        {[
          { key: "processing", label: "Audio Download / Conversion", icon: Download },
          { key: "transcribing", label: "Speech-to-Text Transcription", icon: Volume2 },
          { key: "summarizing", label: "AI Summary Generation", icon: FileText },
          { key: "extracting", label: "Key Insights & Action Items Extraction", icon: ListChecks },
          { key: "done", label: "RAG Index Build for Q&A", icon: HelpCircle },
        ].map((step) => {
          const isStepDone = job
            ? stageOrder[job.status] >= stageOrder[step.key]
            : false;
          const isActive = job?.status === step.key;
          return (
            <div
              key={step.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 16px",
                borderRadius: "var(--radius-md)",
                background: isActive
                  ? "rgba(99, 102, 241, 0.08)"
                  : "transparent",
                border: isActive ? "1px solid var(--accent-primary)" : "1px solid transparent",
                opacity: job ? 1 : 0.5,
                transition: "all 0.3s ease",
              }}
            >
              {isStepDone ? (
                <CheckCircle2 size={20} color="var(--success)" />
              ) : isActive ? (
                <Loader2
                  size={20}
                  color="var(--accent-secondary)"
                  style={{ animation: "spin 1s linear infinite" }}
                />
              ) : (
                <step.icon size={20} color="var(--text-muted)" />
              )}
              <span
                style={{
                  fontSize: "0.88rem",
                  color: isStepDone
                    ? "var(--success)"
                    : isActive
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      {isDone && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button className="btn-primary" onClick={() => navigate("/results")}>
            View Results
            <ArrowRight size={18} />
          </button>
          <button className="btn-secondary" onClick={() => navigate("/chat")}>
            Chat with Video
          </button>
        </div>
      )}
      {isError && (
        <button className="btn-primary" onClick={() => navigate("/upload")}>
          Try Again
        </button>
      )}
    </div>
  );
}

// Stage ordering for pipeline visualization
const stageOrder: Record<string, number> = {
  queued: 0,
  processing: 1,
  transcribing: 2,
  summarizing: 3,
  extracting: 4,
  done: 5,
  error: -1,
};