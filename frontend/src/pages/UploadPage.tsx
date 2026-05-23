import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Play,
  UploadCloud,
  FileVideo,
  ArrowRight,
  Loader2,
  Globe,
  Check,
} from "lucide-react";
import { processYouTube, processFile, fetchTranscript, extractVideoId } from "../api";
import { useJob } from "../context/JobContext";

type InputMode = "youtube" | "file";

export default function UploadPage() {
  const navigate = useNavigate();
  const { setActiveJobId, setChatJobId } = useJob();
  const [mode, setMode] = useState<InputMode>("youtube");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("english");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let response: { job_id: string; status: string };

      if (mode === "youtube") {
        if (!url.trim()) {
          setError("Please enter a YouTube URL");
          setLoading(false);
          return;
        }
        
        const trimmedUrl = url.trim();
        
        // ── Try fetching transcript via Vercel edge function (uses edge IP, not Render's blocked IP) ──
        const videoId = extractVideoId(trimmedUrl);
        let transcript: string | null = null;
        
        if (videoId) {
          transcript = await fetchTranscript(videoId, language);
        }
        
        // Pass transcript (may be null) to backend — backend uses it if available,
        // otherwise falls back to its own youtube-transcript-api attempt
        response = await processYouTube(trimmedUrl, language, transcript);
      } else {
        if (!file) {
          setError("Please select a file");
          setLoading(false);
          return;
        }
        response = await processFile(file, language);
      }

      setActiveJobId(response.job_id);
      setChatJobId(response.job_id);
      navigate(`/processing?job=${response.job_id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start processing";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  return (
    <div style={{ animation: "fadeInUp 0.5s ease forwards", maxWidth: 680 }}>
      <h1
        style={{
          fontSize: "2rem",
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        New Analysis
      </h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 32, fontSize: "0.95rem" }}>
        Provide a YouTube link or upload a video/audio file to get started.
      </p>

      {/* Mode Toggle */}
      <div
        style={{
          display: "flex",
          gap: 4,
          background: "var(--bg-input)",
          borderRadius: "var(--radius-md)",
          padding: 4,
          marginBottom: 28,
          width: "fit-content",
          border: "1px solid var(--border-color)",
        }}
      >
        {(["youtube", "file"] as InputMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              borderRadius: "var(--radius-sm)",
              border: "none",
              cursor: "pointer",
              background: mode === m ? "var(--accent-primary)" : "transparent",
              color: mode === m ? "#fff" : "var(--text-secondary)",
              fontWeight: mode === m ? 600 : 400,
              fontSize: "0.88rem",
              transition: "all 0.2s ease",
            }}
          >
            {m === "youtube" ? <Play size={16} /> : <UploadCloud size={16} />}
            {m === "youtube" ? "YouTube URL" : "Upload File"}
          </button>
        ))}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        {/* YouTube Input */}
        {mode === "youtube" && (
          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 8,
              }}
            >
              YouTube Video URL
            </label>
            <div style={{ position: "relative" }}>
              <Play
                size={18}
                color="var(--text-muted)"
                style={{ position: "absolute", top: 14, left: 14 }}
              />
              <input
                type="url"
                className="input-field"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                style={{ paddingLeft: 42 }}
              />
            </div>
          </div>
        )}

        {/* File Upload */}
        {mode === "file" && (
          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 8,
              }}
            >
              Video or Audio File
            </label>
            <div
              onDrop={handleFileDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${file ? "var(--success)" : "var(--border-color)"}`,
                borderRadius: "var(--radius-lg)",
                padding: "40px 24px",
                textAlign: "center",
                cursor: "pointer",
                transition: "all 0.3s ease",
                background: file ? "rgba(52, 211, 153, 0.05)" : "var(--bg-input)",
              }}
            >
              {file ? (
                <div>
                  <Check size={32} color="var(--success)" style={{ marginBottom: 8 }} />
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{file.name}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {(file.size / (1024 * 1024)).toFixed(1)} MB — Click to change
                  </div>
                </div>
              ) : (
                <div>
                  <FileVideo size={40} color="var(--text-muted)" style={{ marginBottom: 12 }} />
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>
                    Drop your file here or click to browse
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Supports MP4, AVI, MKV, MP3, WAV, M4A
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,audio/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setFile(f);
                }}
              />
            </div>
          </div>
        )}

        {/* Language Selector */}
        <div style={{ marginBottom: 28 }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: "0.85rem",
              fontWeight: 500,
              color: "var(--text-secondary)",
              marginBottom: 8,
            }}
          >
            <Globe size={14} />
            Transcription Language
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { value: "english", label: "English" },
              { value: "hinglish", label: "Hinglish (Hindi → English)" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setLanguage(opt.value)}
                style={{
                  padding: "10px 18px",
                  borderRadius: "var(--radius-md)",
                  border:
                    language === opt.value
                      ? "1px solid var(--accent-primary)"
                      : "1px solid var(--border-color)",
                  background:
                    language === opt.value
                      ? "rgba(99, 102, 241, 0.12)"
                      : "var(--bg-input)",
                  color:
                    language === opt.value
                      ? "var(--accent-secondary)"
                      : "var(--text-secondary)",
                  fontWeight: language === opt.value ? 600 : 400,
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  transition: "all 0.2s ease",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              padding: "12px 16px",
              background: "rgba(248, 113, 113, 0.1)",
              border: "1px solid rgba(248, 113, 113, 0.3)",
              borderRadius: "var(--radius-md)",
              color: "var(--error)",
              fontSize: "0.88rem",
              marginBottom: 20,
            }}
          >
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          className="btn-primary"
          disabled={loading}
          style={{ padding: "14px 32px", fontSize: "1rem" }}
        >
          {loading ? (
            <>
              <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
              Starting...
            </>
          ) : (
            <>
              Start Processing
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </form>
    </div>
  );
}