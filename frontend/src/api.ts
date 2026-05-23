// Auto-detect environment: production = Render backend, dev = localhost
const API_BASE = import.meta.env.PROD
  ? "https://contextframe-api.onrender.com/api"
  : "http://localhost:8000/api";

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

export async function processYouTube(
  url: string,
  language: string
): Promise<{ job_id: string; status: string }> {
  const form = new FormData();
  form.append("url", url);
  form.append("language", language);
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