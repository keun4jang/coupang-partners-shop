"""
문장 목록을 운영과 같은 Supertonic 목소리로 녹음한다 (2026-11-24 사장님 "목소리가 굉장히 부자연스러워 바꿔").
실제 영상(허락받은 공장 영상) 샘플을 PC 에서 편집할 때 쓴다. render-demo mode=ttslines 에서만 돈다.
입력: docs/research/tts-lines.json {"voice": "M1", "speed": 1.15, "lines": ["...", ...]}
출력: renders/tts/줄녹음.mp4 (화면 단색, 소리 = 줄마다 녹음 + 0.5초 쉼). 로그에 "TTSLEN i 초" 로 줄별 길이를 남긴다.
"""
import json
import os
import subprocess

import numpy as np
import soundfile as sf
from supertonic import TTS

req = json.load(open("docs/research/tts-lines.json", encoding="utf-8"))
tts = TTS()
sr = tts.sample_rate
style = tts.get_voice_style(req.get("voice") or "M1")
gap = np.zeros(int(sr * 0.5), dtype=np.float32)
parts = []
for i, text in enumerate(req["lines"]):
    wav, _ = tts.synthesize(text, voice_style=style, lang="ko", speed=float(req.get("speed") or 1.15))
    w = wav.squeeze().astype(np.float32)
    a = np.abs(w)
    idx = np.where(a > max(1e-4, float(a.max()) * 0.01))[0]
    if len(idx):
        p = int(sr * 0.05)
        w = w[max(0, idx[0] - p): min(len(w), idx[-1] + p)]
    print(f"TTSLEN {i} {len(w) / sr:.3f}")
    parts += [w, gap]
out_dir = "renders/tts"
os.makedirs(out_dir, exist_ok=True)
wav_path = os.path.join(out_dir, "lines.wav")
sf.write(wav_path, np.concatenate(parts), sr)
subprocess.run(
    ["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=360x640:r=10",
     "-i", wav_path, "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
     os.path.join(out_dir, "줄녹음.mp4")],
    check=True,
)
print("줄 녹음 완료")
