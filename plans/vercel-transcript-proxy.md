# Plan: Client-IP Transcript Fetch via Vercel Serverless Function

## Problem
YouTube blocks all datacenter IPs (including Render's), but allows residential IPs. 
The browser has a residential IP but can't fetch YouTube directly due to CORS restrictions.
A Vercel edge function sits between the browser and YouTube — using Vercel's distributed edge IPs 
to fetch captions, then passing the plain text to Render's backend for LLM processing (which never touches YouTube).

## Architecture

```
┌──────────────┐    1. video URL    ┌──────────────────┐    2. fetch timedtext    ┌──────────┐
│  Browser     │ ─────────────────→ │  Vercel Edge Fn  │ ───────────────────────→ │ YouTube  │
│  (Res IP)    │                    │  /api/transcript  │                           │ API      │
│              │ ←─── 4. text ───── │  (Node.js)       │ ←──── 3. captions ────── │          │
└──────┬───────┘                    └──────────────────┘                           └──────────┘
       │
       │ 5. transcript text (NOT YouTube URL)
       ▼
┌──────────────────┐
│  Render Backend  │
│  /api/process/   │
│  youtube         │  ← summary, action items, decisions, questions, RAG
└──────────────────┘
```

## Files to Create/Modify

### 1. NEW: `frontend/api/fetch-transcript.js` — Vercel Serverless Function
- Input: `{ videoId: string, language: string }`
- Fetches `https://www.youtube.com/api/timedtext?v={vid}&lang={lang}` (public XML API)
- Parses XML → extracts plain text
- Returns `{ transcript: string }` or `{ error: string }`
- Same approach as `youtube-transcript-api` Python library but in Node.js

### 2. MODIFY: `frontend/src/api.ts`
- Add `fetchTranscript(videoId: string, language: string)` function
- Calls the Vercel serverless function at `/api/fetch-transcript`

### 3. MODIFY: `frontend/src/pages/UploadPage.tsx`
- Before calling `processYouTube()`, call `fetchTranscript()` to get captions from user's edge
- If transcript fetch succeeds: pass transcript text to backend
- If transcript fetch fails: pass URL only, let backend fall back (existing behavior)

### 4. MODIFY: `backend/server.py`
- `/api/process/youtube` endpoint: add optional `transcript` form field
- `_run_pipeline()`: accept optional `transcript` parameter
- If transcript provided: skip `process_input()` entirely, use the provided text
- If transcript not provided: use existing `process_input()` logic (URL → transcript)

### 5. MODIFY: `frontend/vercel.json`
- Add API route rewrite: `/api/fetch-transcript` → serverless function

## Fallback Behavior
1. Vercel function succeeds → transcript text flows to Render → full processing ✅
2. Vercel function fails → frontend sends URL only → Render tries `youtube-transcript-api` → may fail on Render ❌
3. If both fail → user sees error, can try locally where it works

## Edge Cases
- Videos with no captions: Vercel function returns error → backend tries audio download fallback
- Network timeout: Frontend sets 15s timeout on Vercel function call, falls back to URL-only mode
- Language mapping: Same lang_map logic from `audio_processor.py` ported to JS