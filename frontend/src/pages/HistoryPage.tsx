import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  FileText,
  Activity,
} from "lucide-react";
import { listJobs, type JobListItem } from "../api";
import { useJob } from "../context/JobContext";

export default function HistoryPage() {
  const navigate = useNavigate();
  const { setActiveJobId, setChatJobId } = useJob();
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await listJobs();
        setJobs(data.reverse());
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetch();
    const interval = setInterval(fetch, 10000);
    return () => clearInterval(interval);
  }, []);

  const statusIcon = (status: string) => {
    switch (status) {
      case "done":
        return <CheckCircle2 size={18} color="var(--success)" />;
      case "error":
        return <XCircle size={18} color="var(--error)" />;
      default:
        return <Loader2 size={18} color="var(--accent-secondary)" style={{ animation: "spin 1s linear infinite" }} />;
    }
  };

  const handleClick = (job: JobListItem) => {
    setActiveJobId(job.job_id);
    if (job.status === "done") {
      setChatJobId(job.job_id);
      navigate("/results");
    } else if (job.status === "error") {
      navigate(`/processing?job=${job.job_id}`);
    } else {
      navigate(`/processing?job=${job.job_id}`);
    }
  };

  return (
    <div style={{ animation: "fadeInUp 0.5s ease forwards" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <Activity size={24} color="var(--accent-secondary)" />
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700 }}>History</h1>
      </div>
      <p style={{ color: "var(--text-secondary)", marginBottom: 28, fontSize: "0.95rem" }}>
        All your processed videos and their analysis status.
      </p>

      {loading && (
        <div style={{ textAlign: "center", padding: 60 }}>
          <Loader2 size={32} color="var(--accent-secondary)" style={{ animation: "spin 1s linear infinite", marginBottom: 12 }} />
          <p style={{ color: "var(--text-muted)" }}>Loading history...</p>
        </div>
      )}

      {!loading && jobs.length === 0 && (
        <div style={{ textAlign: "center", padding: 60 }}>
          <Clock size={48} color="var(--text-muted)" style={{ marginBottom: 16, opacity: 0.4 }} />
          <h3 style={{ marginBottom: 8, color: "var(--text-secondary)" }}>No analyses yet</h3>
          <p style={{ color: "var(--text-muted)", marginBottom: 24, fontSize: "0.9rem" }}>
            Start by processing a YouTube video or uploading a file.
          </p>
          <button className="btn-primary" onClick={() => navigate("/upload")}>
            Start New Analysis
          </button>
        </div>
      )}

      {!loading && jobs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {jobs.map((job, i) => (
            <div
              key={job.job_id}
              onClick={() => handleClick(job)}
              className="card"
              style={{
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "18px 22px",
                animation: `fadeInUp 0.4s ease forwards`,
                animationDelay: `${i * 0.05}s`,
                opacity: 0,
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: "var(--radius-md)",
                  background: job.status === "done"
                    ? "rgba(52, 211, 153, 0.1)"
                    : job.status === "error"
                    ? "rgba(248, 113, 113, 0.1)"
                    : "rgba(99, 102, 241, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {job.status === "done" ? (
                  <FileText size={20} color="var(--success)" />
                ) : (
                  statusIcon(job.status)
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, marginBottom: 2, fontSize: "0.95rem" }}>
                  {job.title || "Untitled Analysis"}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                  {statusIcon(job.status)}
                  <span style={{ textTransform: "capitalize" }}>{job.status}</span>
                  <span>·</span>
                  <span>{job.message}</span>
                </div>
              </div>
              <ArrowRight size={18} color="var(--text-muted)" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}