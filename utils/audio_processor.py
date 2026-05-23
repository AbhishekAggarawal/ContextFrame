import yt_dlp
from pydub import AudioSegment
import os
import sys
import shutil

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

# Tell pydub where ffmpeg is (MUST be set before any pydub operations)
_FFPROBE_PATH = FFMPEG_PATH.replace("ffmpeg.exe", "ffprobe.exe") if FFMPEG_PATH != "ffmpeg" else "ffprobe"
AudioSegment.converter = FFMPEG_PATH
AudioSegment.ffprobe = _FFPROBE_PATH

# Enable UTF-8 output on Windows to handle Unicode filenames
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import uuid

def download_youtube_audio(url: str) -> str:
    safe_id = uuid.uuid4().hex[:8]
    output_template = os.path.join(DOWNLOAD_DIR, f"{safe_id}_%(title).100s.%(ext)s")
    # Sanitize the output template to ASCII to avoid Unicode issues on Windows
    output_template = output_template.encode('ascii', errors='replace').decode('ascii')

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "ffmpeg_location": FFMPEG_PATH,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "wav",
                "preferredquality": "192",
            }
        ],
        "quiet": True,
        "no_warnings": True,
        "extractor_args": {"youtube": {"js_runtimes": ["none"]}},
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filename = ydl.prepare_filename(info).replace(".webm", ".wav").replace(".m4a", ".wav")
    return filename



def convert_to_wav(input_path: str) -> str:
    """Convert any audio/video file to WAV format using pydub."""
    output_path = os.path.splitext(input_path)[0] + "_converted.wav"
    audio = AudioSegment.from_file(input_path)
    audio = audio.set_channels(1).set_frame_rate(16000) #16khz
    audio.export(output_path, format="wav")
    return output_path



def chunk_audio(wav_path : str , chunk_minutes : int = 10) -> list:
    audio = AudioSegment.from_wav(wav_path)
    chunk_ms = chunk_minutes * 60 * 1000 

    chunks = []

    for i, start in enumerate(range(0,len(audio),chunk_ms)):
        chunk = audio[start : start + chunk_ms]
        chunk_path = f"{wav_path}_chunk_{i}.wav"
        chunk.export(chunk_path , format = "wav")

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