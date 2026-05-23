import os
import sys
import shutil
import uuid

DOWNLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'downloades')
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# Locate ffmpeg binary (cross-platform)
_FFMPEG_CANDIDATES = [shutil.which("ffmpeg")]
# Windows-specific fallbacks
if sys.platform == "win32":
    _FFMPEG_CANDIDATES.append(r"C:\ffmpeg\bin\ffmpeg.exe")
FFMPEG_PATH = next((p for p in _FFMPEG_CANDIDATES if p and os.path.exists(p)), None)

if FFMPEG_PATH is None:
    print("WARNING: ffmpeg not found! Audio processing will fail.")
    FFMPEG_PATH = "ffmpeg"

# Enable UTF-8 output on Windows to handle Unicode filenames
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# ── pydub / yt-dlp are lazy-imported so the server starts quickly ──────────
_pydub_ready = False


def _ensure_pydub():
    """Lazy-import pydub and configure ffmpeg paths (called once on first use)."""
    global _pydub_ready
    if _pydub_ready:
        return
    from pydub import AudioSegment as _AudioSegment

    _ffprobe_path = (
        FFMPEG_PATH.replace("ffmpeg.exe", "ffprobe.exe")
        if FFMPEG_PATH != "ffmpeg"
        else "ffprobe"
    )
    _AudioSegment.converter = FFMPEG_PATH
    _AudioSegment.ffprobe = _ffprobe_path
    _pydub_ready = True


def _extract_video_id(url: str) -> str:
    """Extract 11-char YouTube video ID from any URL format."""
    import re
    _vid = re.search(
        r"(?:v=|/watch\?v=|youtu\.be/|/embed/|/v/|/e/|watch\?v=)([0-9A-Za-z_-]{11})",
        url,
    )
    if not _vid:
        raise RuntimeError(f"Could not extract video ID from URL: {url}")
    return _vid.group(1)


def fetch_youtube_transcript(url: str, language: str = "english") -> str:
    """
    Fetch auto-generated captions from YouTube using youtube-transcript-api.
    This library handles the timedtext API authentication/anti-bot correctly.
    Returns the transcript text, or raises an exception if not available.
    """
    from youtube_transcript_api import YouTubeTranscriptApi

    _vid = _extract_video_id(url)

    _lang_map = {
        "english": "en",
        "hinglish": "hi",
        "hindi": "hi",
        "spanish": "es",
        "french": "fr",
        "german": "de",
        "japanese": "ja",
        "korean": "ko",
        "portuguese": "pt",
        "russian": "ru",
        "chinese": "zh",
        "arabic": "ar",
    }
    _lang_code = _lang_map.get(language.lower(), "en")

    print(f"  → Checking YouTube captions ({_lang_code}) for {_vid} ...")

    try:
        _api = YouTubeTranscriptApi()
        _fetched = _api.fetch(_vid, languages=(_lang_code,))
        _transcript = " ".join(s.text for s in _fetched)
        _transcript = _transcript.strip()

        if not _transcript:
            print("  ✗ Empty transcript returned")
            raise RuntimeError("Empty transcript")

        _words = len(_transcript.split())
        print(f"  ✓ Transcript fetched: {_words} words, {len(_transcript)} chars")
        return _transcript

    except Exception as _e:
        print(f"  ✗ Transcript fetch failed: {str(_e)[:100]}")
        raise


def download_youtube_audio(url: str) -> str:
    """
    Download YouTube audio via the Invidious API (fetches direct CDN URL).
    Completely bypasses anti-bot — Invidious servers have normal IPs.
    """
    import requests
    import re

    _safe_id = uuid.uuid4().hex[:8]
    _vid = _extract_video_id(url)

    _UA = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    )
    _HEADERS = {"User-Agent": _UA, "Accept-Language": "en-US,en;q=0.9"}

    # Public Invidious instances that are currently known to work
    _INVIDIOUS = os.getenv(
        "INVIDIOUS_INSTANCES",
        "inv.nadeko.net,inv.tux.pizza,inv.zzls.xyz,vid.puffyan.us,inv.us.projectsegfau.lt,iv.ggtyler.dev,inv.vern.cc",
    ).split(",")

    _last_err = None
    for _instance in _INVIDIOUS:
        _instance = _instance.strip()
        if not _instance:
            continue

        _api_url = f"https://{_instance}/api/v1/videos/{_vid}?fields=title,adaptiveFormats"
        print(f"  → Invidious API: {_instance} …")

        try:
            _r = requests.get(_api_url, headers=_HEADERS, timeout=25)
            if _r.status_code == 403:
                print(f"  ✗ {_instance} — 403 (geo-blocked)")
                continue
            _r.raise_for_status()
        except Exception as _e:
            _last_err = _e
            print(f"  ✗ {_instance} — {str(_e)[:60]}")
            continue

        try:
            _meta = _r.json()
        except Exception:
            print(f"  ✗ {_instance} — invalid JSON response")
            continue

        if not _meta or not isinstance(_meta, dict):
            print(f"  ✗ {_instance} — empty response")
            continue

        _title = _meta.get("title", _vid)
        _title = re.sub(r'[\\/*?:"<>|]', "", _title)
        _title = _title.encode("ascii", errors="replace").decode("ascii")

        # Find best audio stream
        _best_audio = None
        _best_bitrate = 0
        for _fmt in _meta.get("adaptiveFormats", []):
            _fmt_type = _fmt.get("type", "")
            if _fmt_type.startswith("audio") and _fmt.get("url"):
                _br = int(_fmt.get("bitrate", "0") or "0")
                if _br > _best_bitrate:
                    _best_bitrate = _br
                    _best_audio = _fmt

        if not _best_audio:
            print(f"  ✗ {_instance} — no audio stream")
            continue

        _ext = _best_audio.get("container") or "m4a"
        if _ext not in ("m4a", "webm", "opus", "mp4", "aac"):
            _ext = "m4a"

        _raw_path = os.path.join(DOWNLOAD_DIR, f"{_safe_id}_{_title}_raw.{_ext}")
        _raw_path = _raw_path.encode("ascii", errors="replace").decode("ascii")

        print(f"  → Downloading {_best_bitrate // 1000}kbps {_ext} …")
        try:
            _dl = requests.get(_best_audio["url"], headers=_HEADERS, timeout=300, stream=True)
            _dl.raise_for_status()
            _downloaded = 0
            with open(_raw_path, "wb") as _f:
                for _chunk in _dl.iter_content(chunk_size=32768):
                    _f.write(_chunk)
                    _downloaded += len(_chunk)
            _size_mb = _downloaded / (1024 * 1024)
            print(f"  ✓ Downloaded {_size_mb:.1f} MB via {_instance}")
        except Exception as _e:
            _last_err = _e
            print(f"  ✗ {_instance} download — {str(_e)[:60]}")
            continue

        # Convert to 16kHz mono WAV
        print("  → Converting to 16kHz mono WAV …")
        _ensure_pydub()
        from pydub import AudioSegment
        _wav_path = os.path.splitext(_raw_path)[0] + ".wav"
        _audio = AudioSegment.from_file(_raw_path)
        _audio = _audio.set_channels(1).set_frame_rate(16000)
        _audio.export(_wav_path, format="wav")
        os.remove(_raw_path)
        print(f"  → WAV ready: {_wav_path}")
        return _wav_path

    raise RuntimeError(
        f"All Invidious proxies failed. Last error: {_last_err}"
    )


def convert_to_wav(input_path: str) -> str:
    """Convert any audio/video file to WAV format using pydub."""
    _ensure_pydub()
    from pydub import AudioSegment

    output_path = os.path.splitext(input_path)[0] + "_converted.wav"
    audio = AudioSegment.from_file(input_path)
    audio = audio.set_channels(1).set_frame_rate(16000)  # 16khz
    audio.export(output_path, format="wav")
    return output_path


def chunk_audio(wav_path: str, chunk_minutes: int = 10) -> list:
    _ensure_pydub()
    from pydub import AudioSegment

    audio = AudioSegment.from_wav(wav_path)
    chunk_ms = chunk_minutes * 60 * 1000

    chunks = []

    for i, start in enumerate(range(0, len(audio), chunk_ms)):
        chunk = audio[start: start + chunk_ms]
        chunk_path = f"{wav_path}_chunk_{i}.wav"
        chunk.export(chunk_path, format="wav")
        chunks.append(chunk_path)

    return chunks


def process_input(source: str, language: str = "english") -> tuple:
    """
    Process input and return (chunks list or None, transcript_text or None).
    
    Two paths:
    1. YouTube URL → try transcript API first; if unavailable, download audio
    2. Local file → convert to WAV + chunk
    
    Returns: (chunks, transcript_text)
      - If transcript fetched: (None, transcript_text)  → skip STT
      - If audio downloaded:  (chunks, None)            → run STT
      - If local file:        (chunks, None)            → run STT
    """
    if source.startswith("http://") or source.startswith("https://"):
        print("Detected YouTube URL.")
        
        # ── Try transcript first (free, fast, no anti-bot) ──────────
        try:
            transcript = fetch_youtube_transcript(source, language=language)
            print(f"Using YouTube transcript — skipping audio download + STT.")
            return (None, transcript)
        except Exception:
            print("Transcript unavailable → downloading audio …")
        
        # ── Fallback: download audio via Invidious proxy ─────────────
        wav_path = download_youtube_audio(source)
    else:
        print("Detected local file. Converting to WAV...")
        wav_path = convert_to_wav(source)

    print("Chunking audio...")
    chunks = chunk_audio(wav_path)
    print(f"Audio ready — {len(chunks)} chunk(s) created.")
    return (chunks, None)