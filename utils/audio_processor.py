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

def download_youtube_audio(url: str) -> str:
    import yt_dlp
    import re

    safe_id = uuid.uuid4().hex[:8]
    output_template = os.path.join(DOWNLOAD_DIR, f"{safe_id}_%(title).100s.%(ext)s")
    output_template = output_template.encode('ascii', errors='replace').decode('ascii')

    _BASE_OPTS = {
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "ffmpeg_location": FFMPEG_PATH,
        "postprocessors": [
            {"key": "FFmpegExtractAudio", "preferredcodec": "wav", "preferredquality": "192"}
        ],
        "quiet": True,
        "no_warnings": True,
        "http_headers": {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "en-US,en;q=0.9",
        },
        "extractor_retries": 2,
    }

    # ── Strategy 1: Direct YouTube ────────────────────────────────────────
    _direct_opts = {
        **_BASE_OPTS,
        "extractor_args": {
            "youtube": {
                "player_client": ["ios", "web_embedded"],
                "player_skip": ["webpage", "configs", "js"],
                "js_runtimes": ["none"],
            }
        },
    }

    _bot_markers = [r"sign in to confirm", r"not a bot", r"automated query"]

    try:
        with yt_dlp.YoutubeDL(_direct_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info).replace(".webm", ".wav").replace(".m4a", ".wav")
        print("Downloaded directly from YouTube.")
        return filename
    except Exception as _err:
        _err_str = str(_err).lower()
        if not any(re.search(m, _err_str) for m in _bot_markers):
            raise   # genuine error, not anti-bot
        print("YouTube anti-bot block detected → switching to Invidious proxy …")

    # ── Strategy 2: Invidious proxy fallback ──────────────────────────────
    # Public Invidious instances — free, no auth, worldwide IPs
    _INVIDIOUS = os.getenv(
        "INVIDIOUS_INSTANCES",
        "yewtu.be,inv.nadeko.net,inv.tux.pizza,inv.zzls.xyz,vid.puffyan.us",
    ).split(",")

    # Parse YouTube video ID
    _vid = re.search(
        r"(?:v=|/watch\?v=|youtu\.be/|/embed/|/v/|/e/|watch\?v=)([0-9A-Za-z_-]{11})",
        url,
    )
    if not _vid:
        raise RuntimeError(f"Could not extract video ID from URL: {url}")
    _vid = _vid.group(1)

    _invidious_opts = {
        **_BASE_OPTS,
        # Don't add extractor_args — Invidious extractor doesn't need anti-bot tricks
    }

    _last_err = None
    for _instance in _INVIDIOUS:
        _instance = _instance.strip()
        if not _instance:
            continue
        _proxy_url = f"https://{_instance}/watch?v={_vid}"
        print(f"  → Trying Invidious: {_instance} …")
        try:
            with yt_dlp.YoutubeDL(_invidious_opts) as ydl:
                info = ydl.extract_info(_proxy_url, download=True)
                filename = ydl.prepare_filename(info).replace(".webm", ".wav").replace(".m4a", ".wav")
            print(f"Downloaded via Invidious ({_instance}).")
            return filename
        except Exception as _e2:
            _last_err = _e2
            print(f"  ✗ {_instance} failed — {str(_e2)[:100]}")
            continue

    raise RuntimeError(
        f"All download methods exhausted. Direct YouTube blocked (anti-bot), "
        f"and all Invidious proxies failed. Last error: {_last_err}"
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

def process_input(source: str) -> list:
    if source.startswith("http://") or source.startswith("https://"):
        print("Detected YouTube URL. Downloading audio...")
        wav_path = download_youtube_audio(source)
    else:
        print("Detected local file. Converting to WAV...")
        wav_path = convert_to_wav(source)

    print("Chunking audio...")
    chunks = chunk_audio(wav_path)
    print(f"Audio ready — {len(chunks)} chunk(s) created.")
    return chunks