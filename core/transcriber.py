"""
Transcriber — routes ALL audio through Sarvam AI (free sync STT-translate API).
No local Whisper / torch needed — works on Render's 512MB free tier.

- English   → Sarvam transcribes as English
- Hinglish  → Sarvam translates in-place to English while transcribing
"""

import os
import sys
import shutil
import requests

# ── Ensure ffmpeg is on PATH (cross-platform) ───────────────────────────────
_ffmpeg_exe = shutil.which("ffmpeg")
if _ffmpeg_exe:
    _ffmpeg_dir = os.path.dirname(_ffmpeg_exe)
    if _ffmpeg_dir not in os.environ["PATH"].split(os.pathsep):
        os.environ["PATH"] = _ffmpeg_dir + os.pathsep + os.environ["PATH"]
if sys.platform == "win32":
    _FFMPEG_DIRS = [r"C:\ffmpeg\bin"]
    for _d in _FFMPEG_DIRS:
        if os.path.isdir(_d) and _d not in os.environ["PATH"].split(os.pathsep):
            os.environ["PATH"] = _d + os.pathsep + os.environ["PATH"]
            break

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# ── Sarvam config ───────────────────────────────────────────────────────────
# Sync STT-translate API rejects audio longer than 30s → slice into 25s pieces
SARVAM_PIECE_SECONDS = 25
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
SARVAM_STT_TRANSLATE_URL = "https://api.sarvam.ai/speech-to-text-translate"
SARVAM_MODEL = os.getenv("SARVAM_STT_MODEL", "saaras:v2.5")


def _send_to_sarvam(piece_path: str, language: str = "english") -> str:
    """Send one ≤30s WAV file to Sarvam and return the transcript."""
    headers = {"api-subscription-key": SARVAM_API_KEY}
    with open(piece_path, "rb") as f:
        files = {"file": (os.path.basename(piece_path), f, "audio/wav")}
        data = {"model": SARVAM_MODEL, "with_diarization": "false"}
        response = requests.post(
            SARVAM_STT_TRANSLATE_URL,
            headers=headers,
            files=files,
            data=data,
            timeout=120,
        )
    if not response.ok:
        print(f"\n❌ Sarvam returned {response.status_code}")
        print(f"Response body: {response.text}\n")
        response.raise_for_status()
    return response.json().get("transcript", "")


def transcribe_chunk(chunk_path: str, language: str = "english") -> str:
    """
    Transcribe one audio chunk via Sarvam AI (all languages).
    Splits into 25s pieces because the sync API rejects >30s.
    """
    from pydub import AudioSegment

    if not SARVAM_API_KEY:
        raise RuntimeError("SARVAM_API_KEY is not set — add it to .env or Render env vars")

    audio = AudioSegment.from_wav(chunk_path)
    piece_ms = SARVAM_PIECE_SECONDS * 1000
    full_text = ""
    total_pieces = (len(audio) + piece_ms - 1) // piece_ms

    for i, start in enumerate(range(0, len(audio), piece_ms)):
        piece = audio[start: start + piece_ms]
        piece_path = f"{chunk_path}_sv_{i}.wav"
        piece.export(piece_path, format="wav")
        try:
            print(f"  → Sarvam piece {i + 1}/{total_pieces} ...")
            full_text += _send_to_sarvam(piece_path, language) + " "
        finally:
            if os.path.exists(piece_path):
                os.remove(piece_path)

    return full_text.strip()


def transcribe_all(chunks: list, language: str = "english") -> str:
    """Transcribe every chunk via Sarvam and return the full transcript."""
    full_transcript = ""
    print(f"Using Sarvam AI for STT (language={language}).")
    for i, chunk in enumerate(chunks):
        print(f"Transcribing chunk {i + 1}/{len(chunks)}...")
        text = transcribe_chunk(chunk, language=language)
        full_transcript += text + " "
    print("Transcription complete.")
    return full_transcript.strip()
