// Auto-detect environment: production = Render backend, dev = localhost
const API_BASE = import.meta.env.PROD
  ? "https://contextframe.onrender.com/api"
  : "http://localhost:8000/api";

// Vercel serverless functions (same origin when deployed to Vercel)
const EDGE_BASE = "/api";

export interface JobStatus {
  job_id: string;
  status: string;
  progress: number;
  message: string;
  error?: string;
  result?: {
    title: string;
    transcript: string;
    summary: string;
    action_items: string;
    key_decisions: string;
    open_questions: string;
  };
}

export interface JobListItem {
  job_id: string;
  status: string;
  title: string | null;
  message: string;
}

export async function checkHealth(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

/**
 * Fetch YouTube captions via Vercel edge function.
 * The edge function uses its own IP (not Render's blocked datacenter IP).
 * Returns transcript text or null if unavailable.
 */
export async function fetchTranscript(
  videoId: string,
  language: string = "english"
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const res = await fetch(`${EDGE_BASE}/fetch-transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, language }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`Transcript fetch failed: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    if (data.error) {
      console.warn(`Transcript fetch error: ${data.error}`);
      return null;
    }

    console.log(
      `Transcript fetched via edge: ${data.transcript.split(/\s+/).length} words`
    );
    return data.transcript;
  } catch (err) {
    console.warn("Transcript fetch exception:", err);
    return null;
  }
}

export async function processYouTube(
  url: string,
  language: string,
  transcript?: string | null
): Promise<{ job_id: string; status: string }> {
  const form = new FormData();
  form.append("url", url);
  form.append("language", language);
  if (transcript) {
    form.append("transcript", transcript);
  }
  const res = await fetch(`${API_BASE}/process/youtube`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Failed to start processing");
  return res.json();
}

export async function processFile(
  file: File,
  language: string
): Promise<{ job_id: string; status: string; filename: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("language", language);
  const res = await fetch(`${API_BASE}/process/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Failed to start processing");
  return res.json();
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`);
  if (!res.ok) throw new Error("Job not found");
  return res.json();
}

export async function getJobResults(jobId: string): Promise<{ job_id: string; result: JobStatus["result"] }> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}/results`);
  if (!res.ok) throw new Error("Failed to fetch results");
  return res.json();
}

export async function askQuestion(
  jobId: string,
  question: string
): Promise<{ question: string; answer: string }> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error("Failed to get answer");
  return res.json();
}

export async function listJobs(): Promise<JobListItem[]> {
  const res = await fetch(`${API_BASE}/jobs`);
  if (!res.ok) return [];
  return res.json();
}

/** Extract 11-char YouTube video ID from any URL format. */
export function extractVideoId(url: string): string | null {
  const match = url.match(
    /(?:v=|youtu\.be\/|embed\/|v\/|e\/|watch\?v=)([0-9A-Za-z_-]{11})/
  );
  return match ? match[1] : null;
}