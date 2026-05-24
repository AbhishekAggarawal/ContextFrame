# ContextFrame — Project Summary

## Overview

**ContextFrame** is an AI-powered video analysis web application that transcribes, summarizes, extracts insights from, and enables conversational Q&A with video content. Users can input a YouTube URL or upload a local video/audio file, and the system produces: a descriptive title, a comprehensive summary, extracted action items, key decisions, open questions, and a RAG-powered chat interface for asking follow-up questions about the content.

---

## Architecture

The project follows a **two-component deployment architecture**:

| Component | Technology | Hosting |
|-----------|-----------|---------|
| **Backend API** | Python + FastAPI + Uvicorn | Render.com (free tier, 512 MB) |
| **Frontend SPA** | React 18 + TypeScript + Vite | Vercel |
| **Edge Proxy** | Node.js serverless function | Vercel Edge |

```
┌──────────────┐     ┌──────────────────┐     ┌──────────┐
│  Browser     │ ──→ │  Vercel Edge Fn  │ ──→ │ YouTube  │
│  (React SPA) │     │  fetch-transcript │     │ InnerTube│
│              │ ←── │  (bypasses CORS)  │ ←── │ API      │
└──────┬───────┘     └──────────────────┘     └──────────┘
       │ transcript text (plain)
       ▼
┌──────────────────┐     ┌──────────────┐     ┌──────────────┐
│  Render Backend  │ ──→ │  Mistral AI  │     │  Sarvam AI   │
│  /api/process/*  │     │  (LLM)       │     │  (STT)       │
│  /api/jobs/*     │ ←── │  summarizer  │ ←── │  transcriber │
│  /api/*/chat     │     │  extractor   │     │              │
└──────────────────┘     │  RAG Q&A     │     └──────────────┘
                         └──────────────┘
```

---

## Core Pipeline (`main.py` → `run_pipeline()`)

The processing pipeline runs in 6 stages, orchestrated either via the CLI entry point [`main.py`](main.py:11) or the FastAPI server's background thread [`backend/server.py`](backend/server.py:70):

### Stage 1 — Input Acquisition
**File:** [`utils/audio_processor.py`](utils/audio_processor.py)  

Two input modes:
- **YouTube URL:** First attempts to fetch auto-generated captions via the `youtube-transcript-api` Python library ([`fetch_youtube_transcript()`](utils/audio_processor.py:73)). If unavailable, falls back to downloading audio through public Invidious proxy instances ([`download_youtube_audio()`](utils/audio_processor.py:100)), which avoids YouTube's anti-bot blocking of datacenter IPs.
- **Local file:** Converts the uploaded file to 16kHz mono WAV using `pydub` ([`convert_to_wav()`](utils/audio_processor.py:213)), then splits into 10-minute chunks ([`chunk_audio()`](utils/audio_processor.py:225)).

The function [`process_input()`](utils/audio_processor.py:243) returns either `(None, transcript_text)` if captions were found (skip STT) or `(chunks_list, None)` if audio needs transcription.

### Stage 2 — Transcription (STT)
**File:** [`core/transcriber.py`](core/transcriber.py)

Uses the **Sarvam AI cloud STT API** (no local Whisper/torch). Audio chunks are split into 25-second pieces (API limit: 30s) and sent to `https://api.sarvam.ai/speech-to-text-translate` using the `saaras:v2.5` model. 

Key functions:
- [`transcribe_chunk()`](core/transcriber.py:58) — splits a WAV chunk into ≤25s pieces, sends each to Sarvam, concatenates results
- [`transcribe_all()`](core/transcriber.py:87) — iterates all chunks

### Stage 3 — Title Generation
**File:** [`core/summarizer.py`](core/summarizer.py), function [`generate_title()`](core/summarizer.py:63)

Uses Mistral AI (`open-mistral-nemo` model) via LangChain to generate a short descriptive title (max 8 words) from the first 2000 characters of the transcript.

### Stage 4 — Summarization (Map-Reduce)
**File:** [`core/summarizer.py`](core/summarizer.py), function [`summarize()`](core/summarizer.py:21)

Uses a **map-reduce** strategy with Mistral AI:
1. **Map:** Split transcript into 3000-character overlapping chunks via [`RecursiveCharacterTextSplitter`](core/summarizer.py:13). Each chunk is independently summarized.
2. **Reduce:** All chunk summaries are combined and fed into a final prompt that produces clean, plain-text bullet points.

Strict prompt rules enforce: no "meeting" language, no markdown formatting, no headings/titles.

### Stage 5 — Extraction
**File:** [`core/extractor.py`](core/extractor.py)

Three parallel Mistral AI LLM calls extract structured information:
- [`extract_action_items()`](core/extractor.py:24) — tasks with responsible person and deadline
- [`extract_key_decisions()`](core/extractor.py:40) — key decisions/conclusions
- [`extract_questions()`](core/extractor.py:52) — unresolved questions needing further exploration

Each uses a shared [`build_chain()`](core/extractor.py:15) factory that constructs a LangChain LCEL pipeline with system prompts enforcing no-meeting and no-markdown rules.

### Stage 6 — RAG Q&A Engine
**Files:** [`core/vector_store.py`](core/vector_store.py) + [`core/rag_engine.py`](core/rag_engine.py)

Uses **BM25 keyword retrieval** (pure Python, zero GPU/ML dependencies) instead of vector embeddings:
- [`build_retriever()`](core/vector_store.py:11) — splits transcript into 500-character chunks with 50-char overlap, creates `BM25Retriever` from `langchain_community`
- [`build_rag_chain()`](core/rag_engine.py:26) — constructs a LangChain LCEL chain: BM25 retriever → format docs → Mistral prompt → answer
- [`ask_question()`](core/rag_engine.py:58) — invokes the chain and sanitizes output (strips "meeting" language, markdown formatting)

---

## Backend API (`backend/server.py`)

**File:** [`backend/server.py`](backend/server.py)

A FastAPI server with the following endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/process/youtube` | Start YouTube video processing (accepts optional pre-fetched `transcript` field) |
| `POST` | `/api/process/upload` | Start file upload processing |
| `GET` | `/api/jobs/{job_id}` | Poll job status/progress |
| `GET` | `/api/jobs/{job_id}/results` | Get full results of completed job |
| `POST` | `/api/jobs/{job_id}/chat` | Ask a RAG question about processed video |
| `GET` | `/api/jobs` | List all jobs (for history) |

**Job lifecycle:** Each processing request creates a [`JobStatus`](backend/server.py:47) object stored in an in-memory dictionary. A daemon thread runs the pipeline ([`_run_pipeline()`](backend/server.py:70)), updating `status`, `progress`, and `message` fields as stages complete. The frontend polls `/api/jobs/{job_id}` to track progress.

**Vercel transcript proxy integration:** The `/api/process/youtube` endpoint accepts an optional `transcript` form field. When provided (pre-fetched by the Vercel edge function), the pipeline skips YouTube entirely — Render's IP never touches YouTube, avoiding anti-bot blocking. See the [vercel-transcript-proxy plan](plans/vercel-transcript-proxy.md) for architecture details.

---

## Frontend (React + TypeScript + Vite)

### Technology Stack
- **React 18** with TypeScript
- **React Router v6** for client-side routing
- **Vite 5** for build tooling
- **Lucide React** for icons
- **CSS Modules** (inline styles in TSX)

### Component Tree

```
App.tsx
├── JobProvider (Context)
├── Sidebar
└── Routes
    ├── / → Dashboard
    ├── /upload → UploadPage
    ├── /processing → ProcessingPage
    ├── /chat → ChatPage
    ├── /results → ResultsPage
    └── /history → HistoryPage
```

### Pages

- **[Dashboard (`/`)](frontend/src/pages/Dashboard.tsx):** Landing page with hero animation, feature cards (YouTube Processing, File Upload, RAG Chat, Smart Summaries), and CTA buttons.
- **[UploadPage (`/upload`)](frontend/src/pages/UploadPage.tsx):** YouTube URL input or file drag-and-drop upload. Language selector (english, hinglish, hindi, spanish, french, german, japanese, korean, portuguese, russian, chinese, arabic). On submit, attempts to pre-fetch YouTube captions via the Vercel edge function before sending to Render backend.
- **[ProcessingPage (`/processing`)](frontend/src/pages/ProcessingPage.tsx):** Polls job status and displays a progress bar with stage messages.
- **[ResultsPage (`/results`)](frontend/src/pages/ResultsPage.tsx):** Displays the generated title, summary (bullet points), action items, key decisions, and open questions in tabbed or sectioned layout.
- **[ChatPage (`/chat`)](frontend/src/pages/ChatPage.tsx):** Conversational interface for asking RAG-powered questions about the processed video content.
- **[HistoryPage (`/history`)](frontend/src/pages/HistoryPage.tsx):** Lists all previously processed jobs from the backend's in-memory store.

### State Management

**[`JobContext`](frontend/src/context/JobContext.tsx)** provides shared state across pages:
- `activeJobId` / `setActiveJobId` — tracks the currently processing job
- `jobStatus` / `setJobStatus` — the latest polled status of the active job
- `chatJobId` / `setChatJobId` — which job to chat with

### API Integration (`frontend/src/api.ts`)

**[`api.ts`](frontend/src/api.ts)** is the API client layer:

- **`API_BASE`:** Auto-detects environment — points to `https://contextframe.onrender.com/api` in production, `http://localhost:8000/api` in development.
- **`EDGE_BASE`:** Points to `/api` on the same Vercel origin for the edge functions.
- **`fetchTranscript(videoId, language)`:** Calls the Vercel edge function at `/api/fetch-transcript` to get YouTube captions using a residential/edge IP.
- **`processYouTube(url, language, transcript?)`:** Sends the URL and optional pre-fetched transcript to Render backend.
- **`processFile(file, language)`:** Uploads local files.
- **`getJobStatus(jobId)`:** Polls job progress.
- **`getJobResults(jobId)`:** Fetches completed results.
- **`askQuestion(jobId, question)`:** Sends RAG chat queries.
- **`listJobs()`:** Lists all historical jobs.
- **`extractVideoId(url)`:** Regex utility to extract 11-char YouTube video ID.

---

## Vercel Edge Proxy (`frontend/api/fetch-transcript.js`)

**File:** [`frontend/api/fetch-transcript.js`](frontend/api/fetch-transcript.js)  
**Plan:** [`plans/vercel-transcript-proxy.md`](plans/vercel-transcript-proxy.md)

A Vercel serverless function that solves the YouTube anti-bot problem. Render's datacenter IPs are frequently blocked by YouTube, but Vercel's edge infrastructure has distributed residential-like IPs.

**4-step mechanism:**
1. **GET** YouTube watch page → extract `INNERTUBE_API_KEY` from embedded JS config
2. **POST** InnerTube API (`/youtubei/v1/player`) with ANDROID client context
3. Extract caption track `baseUrl` from InnerTube response (filtered by language code)
4. **GET** the `baseUrl` → parse XML `<text>` elements → return concatenated plain text

**Language mapping:** Same 12-language map as the Python backend ([`LANG_MAP`](frontend/api/fetch-transcript.js:16)).

---

## Key Design Decisions

### 1. Zero Heavy Dependencies
The backend deliberately avoids **torch, Whisper, ChromaDB, sentence-transformers, and HuggingFace**. This keeps the deployment footprint tiny enough for Render's free tier (512 MB RAM):
- STT → Sarvam AI cloud API (no local GPU needed)
- RAG retrieval → BM25 keyword search (pure Python, ~0 MB RAM)
- LLM → Mistral AI cloud API

### 2. YouTube Anti-Bot Mitigation
Three layers of defense against YouTube's datacenter IP blocking:
1. **Vercel edge function** (primary): Pre-fetches transcripts using edge IPs, passes plain text to Render
2. **youtube-transcript-api** (fallback): Python library running on Render; works for some videos
3. **Invidious proxy** (last resort): Downloads audio through public Invidious instances

### 3. Map-Reduce Summarization
Long transcripts (>3000 chars) are split, individually summarized, then merged. This avoids hitting LLM context limits and produces more thorough summaries.

### 4. BM25 Over Vector Embeddings
Using BM25 for RAG retrieval instead of embedding-based vector search means:
- No embedding model to load/download
- No vector database to manage
- Works entirely in-memory with pure Python
- Sufficient quality for keyword-based transcript search

### 5. Prompt Engineering Guardrails
All LLM prompts enforce strict rules:
- Never use the word "meeting" (content is always a video)
- No markdown formatting in output
- No headings or titles prepended to results
- Output is always clean plain text

---

## Project Structure

```
video agent/
├── main.py                          # CLI entry point
├── Requirements.txt                 # Python dependencies
├── render.yaml                      # Render.com deployment config
├── .env.example                     # Environment variables template
├── .gitignore
├── .python-version                  # Python 3.12
├── README.md
│
├── core/                            # Core pipeline modules
│   ├── transcriber.py               # Sarvam AI STT integration
│   ├── summarizer.py                # Map-reduce summarization + title generation
│   ├── extractor.py                 # Action items, decisions, questions extraction
│   ├── rag_engine.py                # BM25-based RAG Q&A chain
│   └── vector_store.py              # BM25 retriever builder
│
├── utils/
│   └── audio_processor.py           # YouTube download, audio conversion, chunking
│
├── backend/
│   └── server.py                    # FastAPI server with REST endpoints
│
├── frontend/                        # React + TypeScript + Vite SPA
│   ├── package.json
│   ├── vercel.json                  # Vercel deployment config
│   ├── vite.config.ts
│   ├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
│   ├── index.html
│   ├── api/
│   │   └── fetch-transcript.js      # Vercel edge function for YouTube captions
│   ├── public/
│   │   ├── favicon.svg
│   │   └── icons.svg
│   └── src/
│       ├── main.tsx                 # React entry point
│       ├── App.tsx                  # Router + layout
│       ├── App.css / index.css      # Global styles
│       ├── api.ts                   # API client layer
│       ├── context/
│       │   └── JobContext.tsx        # Shared job state context
│       ├── components/
│       │   ├── Sidebar.tsx
│       │   └── HeroAnimation.tsx
│       ├── pages/
│       │   ├── Dashboard.tsx
│       │   ├── UploadPage.tsx
│       │   ├── ProcessingPage.tsx
│       │   ├── ResultsPage.tsx
│       │   ├── ChatPage.tsx
│       │   └── HistoryPage.tsx
│       ├── utils/
│       │   └── markdown.ts
│       └── assets/
│           └── hero.png
│
├── plans/
│   └── vercel-transcript-proxy.md   # Architecture plan for edge transcript proxy
│
├── uploads/                         # Uploaded file storage
├── downloades/                      # Downloaded YouTube audio cache
└── vector_db/                       # (reserved for future vector DB)
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MISTRAL_API_KEY` | Yes | Mistral AI API key for summarization, extraction, RAG |
| `SARVAM_API_KEY` | Yes | Sarvam AI API key for speech-to-text |
| `SARVAM_STT_MODEL` | No | Sarvam STT model (default: `saaras:v2.5`) |
| `INVIDIOUS_INSTANCES` | No | Comma-separated Invidious proxy URLs (for audio download fallback) |

---

## Running Locally

### Backend
```bash
pip install -r Requirements.txt
cp .env.example .env          # Fill in API keys
python main.py                # CLI mode
# OR
uvicorn backend.server:app --host 0.0.0.0 --port 8000   # API server
```

### Frontend
```bash
cd frontend
npm install
npm run dev                   # Vite dev server at localhost:5173
```

---

## Deployment

- **Backend:** Push to GitHub → Render.com auto-deploys via [`render.yaml`](render.yaml). Runs `pip install -r Requirements.txt` then `uvicorn backend.server:app`.
- **Frontend:** Push to GitHub → Vercel auto-deploys via [`vercel.json`](frontend/vercel.json). The `api/fetch-transcript.js` file is deployed as a Vercel serverless function with 128 MB / 15s timeout.
- **CORS:** Backend allows all origins (`*`) for development simplicity.
