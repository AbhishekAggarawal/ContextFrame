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

    safe_id = uuid.uuid4().hex[:8]
    output_template = os.path.join(DOWNLOAD_DIR, f"{safe_id}_%(title).100s.%(ext)s")
    output_template = output_template.encode("ascii", errors="replace").decode("ascii")

    # ── Client strategies ordered from most to least likely to bypass anti-bot ──
    # "tv" = YouTube on Smart TV — uses the /youtubei/v1/player endpoint
    #   with a TV client context; typically much lighter anti-bot filtering
    # "android_vr" = YouTube VR app — separate API path, less guarded
    # "web_embedded" = embedded player (no iframe check on this endpoint)
    _CLIENT_STRATEGIES = [
        # Strategy 1: TV client (smart TV — most lenient anti-bot)
        {
            "player_client": ["tv", "tv_embed"],
            "player_skip": ["webpage", "configs", "js"],
            "js_runtimes": ["none"],
        },
        # Strategy 2: Android VR + TV + Embedded
        {
            "player_client": ["android_vr", "tv", "web_embedded"],
            "player_skip": ["webpage", "configs", "js"],
            "js_runtimes": ["none"],
        },
        # Strategy 3: iOS + Android (mobile apps)
        {
            "player_client": ["ios", "android", "web_embedded"],
            "player_skip": ["webpage", "configs", "js"],
            "js_runtimes": ["none"],
        },
    ]

    _UA = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    )

    _last_err = None
    for _idx, _extractor_args in enumerate(_CLIENT_STRATEGIES):
        _strategy_name = f"yt-dlp #{_idx + 1}"
        print(f"  → {_strategy_name}: clients={_extractor_args['player_client']} …")
        try:
            ydl_opts = {
                "format": "bestaudio/best",
                "outtmpl": output_template,
                "ffmpeg_location": FFMPEG_PATH,
                "postprocessors": [
                    {"key": "FFmpegExtractAudio", "preferredcodec": "wav", "preferredquality": "192"}
                ],
                "quiet": True,
                "no_warnings": True,
                "http_headers": {
                    "User-Agent": _UA,
                    "Accept-Language": "en-US,en;q=0.9",
                },
                "extractor_args": {"youtube": _extractor_args},
                "extractor_retries": 1,
                "geo_bypass": True,
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                filename = ydl.prepare_filename(info).replace(".webm", ".wav").replace(".m4a", ".wav")
            print(f"  ✓ Downloaded via {_strategy_name}")
            return filename
        except Exception as _e:
            _last_err = _e
            _err_str = str(_e)
            if "Sign in to confirm" in _err_str or "not a bot" in _err_str.lower():
                print(f"  ✗ {_strategy_name} blocked by anti-bot, trying next …")
                continue
            else:
                print(f"  ✗ {_strategy_name} failed: {_err_str[:100]}")
                # Non-bot error — keep trying next strategy
                continue

    raise RuntimeError(
        f"All download strategies exhausted. Last error: {_last_err}"
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