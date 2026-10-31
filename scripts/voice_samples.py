"""
목소리 견본 (2026-10-31 사장님 "엄마랑 아들인데 전혀 목소리가 그렇지 않아").
Supertonic 무료 목소리 10개(M1~M5, F1~F5)가 각자 번호를 말한 뒤 엄마 대사·아들 대사를 읽는다 → 한 파일로 이어 붙여
renders/voices/목소리견본.mp4 (화면은 단색, 소리만 들으면 된다). 사장님이 귀로 고른다. 렌더 서버(render-demo mode=voices)에서만 돈다.
"""
import os
import subprocess

import numpy as np
import soundfile as sf
from supertonic import TTS

VOICES = ["M1", "M2", "M3", "M4", "M5", "F1", "F2", "F3", "F4", "F5"]
NUM = ["일", "이", "삼", "사", "오", "육", "칠", "팔", "구", "십"]
LINES = ["너 책상 밑 이게 다 뭐야?", "전선이지 뭐. 발에 자꾸 걸려"]

tts = TTS()
sr = tts.sample_rate
gap = np.zeros(int(sr * 0.5), dtype=np.float32)
parts = []
for i, v in enumerate(VOICES):
    style = tts.get_voice_style(v)
    for text in [f"{NUM[i]}번 목소리.", *LINES]:
        wav, _ = tts.synthesize(text, voice_style=style, lang="ko", speed=1.15)
        parts += [wav.squeeze().astype(np.float32), gap]
    parts.append(np.zeros(int(sr * 0.8), dtype=np.float32))
out_dir = "renders/voices"
os.makedirs(out_dir, exist_ok=True)
wav_path = os.path.join(out_dir, "voices.wav")
sf.write(wav_path, np.concatenate(parts), sr)
mp4 = os.path.join(out_dir, "목소리견본.mp4")
subprocess.run(
    ["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=0xFBF7EE:s=540x960:r=10",
     "-i", wav_path, "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", mp4],
    check=True,
)
print(f"목소리 견본: {mp4}")
