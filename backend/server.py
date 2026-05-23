"""
FastAPI server for the AI Video Assistant.
Exposes the processing pipeline as REST endpoints for the React frontend.
"""

import os
import sys
import json
import uuid
import threading
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="AI Video Assistant API", version="1.0.0")

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory job store ───────────────────────────────────────────────────────
jobs: dict = {}
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


class ChatRequest(BaseModel):
    question: str


class JobStatus:
    def __init__(self, job_id: str):
        self.job_id = job_id
        self.status = "queued"          # queued | processing | transcribing | summarizing | extracting | done | error
        self.progress = 0               # 0-100
        self.message = "Waiting to start..."
        self.result: Optional[dict] = None
        self.rag_chain = None
        self.error: Optional[str] = None


import re

def _sanitize_output(text: str) -> str:
    """Strip 'meeting' language and markdown formatting from LLM outputs."""
    text = re.sub(r'\bMeeting\b', 'Video', text)
    text = re.sub(r'\bmeeting\b', 'video', text)
    # Strip ### headings
    text = re.sub(r'^#{1,3}\s+', '', text, flags=re.MULTILINE)
    # Strip **bold** markers but keep content
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    return text

def _run_pipeline(job: JobStatus, source: str, language: str, prefetched_transcript: Optional[str] = None):
    """Run the full pipeline in a background thread.

    If prefetched_transcript is provided (e.g. fetched by Vercel edge function),
    skip YouTube entirely — no Render IP ever touches YouTube.
    """
    # ── Lazy imports: loaded inside the background thread so the server
    #     can start and bind the port immediately. No heavy ML deps needed —
    #     STT uses Sarvam cloud API, RAG uses BM25 (pure Python).
    from utils.audio_processor import process_input
    from core.transcriber import transcribe_all
    from core.summarizer import summarize, generate_title
    from core.extractor import extract_action_items, extract_key_decisions, extract_questions
    from core.rag_engine import build_rag_chain

    try:
        if prefetched_transcript and prefetched_transcript.strip():
            # ── Path A: Transcript was pre-fetched by Vercel edge function ──────
            #     Render never touches YouTube — no anti-bot IP blocking.
            job.progress = 40
            job.message = "Using pre-fetched transcript — skipping YouTube..."
            transcript = prefetched_transcript.strip()
        else:
            # ── Path B: Fetch transcript via Render's IP (legacy/fallback) ──────
            job.status = "processing"
            job.progress = 5
            job.message = "Downloading / converting audio..."

            chunks, transcript = process_input(source, language)

            if transcript is None:
                # No transcript from YouTube captions — transcribe audio chunks via Sarvam STT
                job.status = "transcribing"
                job.progress = 20
                job.message = f"Transcribing {len(chunks)} audio chunk(s)..."
                transcript = transcribe_all(chunks, language)
            else:
                # Transcript was fetched directly from YouTube captions — skip STT
                job.progress = 40
                job.message = "Using YouTube captions — skipping transcription..."

        job.progress = 45
        job.message = "Generating title..."

        title = generate_title(transcript)

        job.status = "summarizing"
        job.progress = 55
        job.message = "Summarizing transcript..."

        summary = summarize(transcript)

        job.progress = 70
        job.message = "Extracting action items, decisions, and questions..."

        action_items = extract_action_items(transcript)
        decisions = extract_key_decisions(transcript)
        questions = extract_questions(transcript)

        job.progress = 85
        job.message = "Building RAG index for Q&A..."

        rag_chain = build_rag_chain(transcript)

        job.progress = 100
        job.status = "done"
        job.message = "Processing complete!"

        # Safety-net: sanitize all text outputs
        title = _sanitize_output(title)
        summary = _sanitize_output(summary)
        action_items = _sanitize_output(action_items)
        decisions = _sanitize_output(decisions)
        questions = _sanitize_output(questions)

        job.result = {
            "title": title,
            "transcript": transcript,
            "summary": summary,
            "action_items": action_items,
            "key_decisions": decisions,
            "open_questions": questions,
        }
        job.rag_chain = rag_chain

    except Exception as e:
        job.status = "error"
        job.error = str(e)
        job.message = f"Error: {str(e)}"


# ── API Routes ────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "AI Video Assistant API is running"}


@app.post("/api/process/youtube")
async def process_youtube(url: str = Form(...), language: str = Form("english"), transcript: Optional[str] = Form(None)):
    """Start processing a YouTube video URL.

    If 'transcript' is provided (pre-fetched by Vercel edge function),
    the pipeline skips YouTube entirely — no Render IP touches YouTube.
    """
    job_id = str(uuid.uuid4())
    job = JobStatus(job_id)
    jobs[job_id] = job

    thread = threading.Thread(
        target=_run_pipeline,
        args=(job, url, language, transcript),
        daemon=True,
    )
    thread.start()

    return {"job_id": job_id, "status": "queued"}


@app.post("/api/process/upload")
async def process_upload(file: UploadFile = File(...), language: str = Form("english")):
    """Start processing an uploaded video/audio file."""
    # Save uploaded file
    ext = Path(file.filename).suffix or ".mp4"
    safe_name = f"{uuid.uuid4()}{ext}"
    file_path = UPLOAD_DIR / safe_name
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    job_id = str(uuid.uuid4())
    job = JobStatus(job_id)
    jobs[job_id] = job

    thread = threading.Thread(
        target=_run_pipeline,
        args=(job, str(file_path.resolve()), language),
        daemon=True,
    )
    thread.start()

    return {"job_id": job_id, "status": "queued", "filename": file.filename}


@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str):
    """Poll job status and progress."""
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    response = {
        "job_id": job.job_id,
        "status": job.status,
        "progress": job.progress,
        "message": job.message,
    }
    if job.error:
        response["error"] = job.error
    if job.result:
        response["result"] = job.result
    return response


@app.get("/api/jobs/{job_id}/results")
async def get_job_results(job_id: str):
    """Get full results for a completed job."""
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "done":
        raise HTTPException(status_code=400, detail="Job not yet completed")
    return {"job_id": job_id, "result": job.result}


@app.post("/api/jobs/{job_id}/chat")
async def chat_with_video(job_id: str, req: ChatRequest):
    """Ask a question about the processed video using RAG."""
    from core.rag_engine import ask_question

    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "done" or not job.rag_chain:
        raise HTTPException(status_code=400, detail="Video processing not complete, cannot chat yet")

    try:
        answer = ask_question(job.rag_chain, req.question)
        answer = _sanitize_output(answer)
        return {"question": req.question, "answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/jobs")
async def list_jobs():
    """List all jobs (for history sidebar)."""
    return [
        {
            "job_id": j.job_id,
            "status": j.status,
            "title": j.result["title"] if j.result else None,
            "message": j.message,
        }
        for j in jobs.values()
    ]


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)