"""
허락받은 실제 제품 영상 → 우리 쇼츠/릴스 (2026-11-24 사장님 확정 틀, 686 샘플 5판).
- 검은 바탕 1080x1920, 원본은 아래쪽(중국어 자막 자리)을 잘라 y=140 에 배치
- 흰 자막 한 줄(인스타·쇼츠 가림 영역 밖), 말에 맞는 장면만 잘라 이어 붙임, 문장 사이 0.12초
- 목소리 Supertonic(운영과 같음), 원본 소리 제거, 중국어 스티커는 흐림
- 끝 화면: 오늘의 추천 상품 · 사진 · "프로필 링크에서 N번" · 파트너스 고지(끝 화면 내내만 - 사장님 11/24 결정)
사용: python3 scripts/real_video.py 686 <원본 mp4 경로> <상품 사진 경로>
설정: docs/real-videos/{번호}.json. 렌더 서버(render-demo mode=real)에서 돈다. 게시는 하지 않는다.
"""
import json
import os
import subprocess
import sys

import numpy as np

N, SRC, IMG = sys.argv[1], sys.argv[2], sys.argv[3]
spec = json.load(open(f"docs/real-videos/{N}.json", encoding="utf-8"))
OUT = "renders/real"
os.makedirs(OUT, exist_ok=True)
# PC(윈도우)에서는 REAL_FONT 로 맑은 고딕 굵게를 준다 (2026-11-24 사장님 "일단 PC에서 다 해도 될 것 같은데")
FONT = os.environ.get("REAL_FONT", "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc")
GAP = 0.12
DISC = "쿠팡파트너스 활동으로 수수료를 받아요"


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[-2000:])
        sys.exit(1)


# 1) 목소리: 서버에서는 직접 녹음, PC 에서는 서버 녹음(줄녹음.mp4 + 줄 길이)을 받아 자른다(REAL_VOICE_MP4, REAL_VOICE_LENS)
says = [ln["say"] for ln in spec["lines"]] + [spec["end"]]
lens = []
if os.environ.get("REAL_VOICE_MP4"):
    lens = [float(x) for x in os.environ["REAL_VOICE_LENS"].split(",")]
    pos = 0.0
    for i, L in enumerate(lens):
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{pos:.3f}", "-t", f"{L:.3f}", "-i", os.environ["REAL_VOICE_MP4"], "-vn", f"{OUT}/v{i}.wav"])
        pos += L + 0.5
    says = []
else:
    import soundfile as sf
    from supertonic import TTS
    tts = TTS()
    sr = tts.sample_rate
    style = tts.get_voice_style(spec.get("voice") or "M1")
for i, text in enumerate(says):
    wav, _ = tts.synthesize(text, voice_style=style, lang="ko", speed=float(spec.get("speed") or 1.15))
    w = wav.squeeze().astype(np.float32)
    idx = np.where(np.abs(w) > max(1e-4, float(np.abs(w).max()) * 0.01))[0]
    if len(idx):
        p = int(sr * 0.05)
        w = w[max(0, idx[0] - p): min(len(w), idx[-1] + p)]
    sf.write(f"{OUT}/v{i}.wav", w, sr)
    lens.append(len(w) / sr)

# 2) 시간표
k = len(spec["lines"])
start, t = [], 0.15
for i in range(k):
    start.append(t)
    t += lens[i] + GAP
E = t
TOTAL = E + max(lens[k] + 0.5, 5.5)

segs = []
for i, ln in enumerate(spec["lines"]):
    dur = lens[i] + GAP + (0.15 if i == 0 else 0)
    fixed = sum(c[1] for c in ln["clips"] if len(c) > 1)
    for c in ln["clips"]:
        segs.append((c[0], c[1] if len(c) > 1 else dur - fixed))

for i, ln in enumerate(spec["lines"]):
    open(f"{OUT}/t{i}.txt", "w", encoding="utf-8").write(ln["caption"])
open(f"{OUT}/disc.txt", "w", encoding="utf-8").write(DISC)
open(f"{OUT}/num.txt", "w", encoding="utf-8").write(f"{N}번")

cw, ch = spec.get("crop", [720, 780])
vh = round(1080 * ch / cw)
vf = []
src = "[0:v]"
for j, (x, y, w, h, a, b) in enumerate(spec.get("blur", [])):
    vf += [f"{src}split[o{j}][q{j}]", f"[q{j}]crop={w}:{h}:{x}:{y},boxblur=25:2[bl{j}]",
           f"[o{j}][bl{j}]overlay={x}:{y}:enable='between(t,{a},{b})'[u{j}]"]
    src = f"[u{j}]"
n = len(segs)
vf.append(f"{src}split={n}" + "".join(f"[s{m}]" for m in range(n)))
for m, (a, d) in enumerate(segs):
    vf.append(f"[s{m}]trim=start={a}:duration={d:.3f},setpts=PTS-STARTPTS[c{m}]")
cap_y = 140 + vh + 45
vf += [
    "".join(f"[c{m}]" for m in range(n)) + f"concat=n={n}:v=1:a=0,crop={cw}:{ch}:0:0,scale=1080:{vh},setsar=1[v]",
    "[2:v]setsar=1[bg]",
    "[bg][v]overlay=0:140:eof_action=pass[b0]",
]
last = "b0"
for i in range(k):
    a = 0 if i == 0 else start[i]
    b = start[i + 1] if i < k - 1 else E
    vf.append(f"[{last}]drawtext=fontfile={FONT}:textfile={OUT}/t{i}.txt:fontsize=58:fontcolor=white:"
              f"x=(w-text_w)/2:y={cap_y}:enable='between(t,{a:.2f},{b:.2f})'[k{i}]")
    last = f"k{i}"
on = f"enable='gte(t,{E:.2f})'"
vf += [
    "[1:v]scale=600:600:force_original_aspect_ratio=decrease[pimg]",
    f"[{last}]null[k]",
    f"[k][pimg]overlay=(W-w)/2:500:{on}[p]",
    f"[p]drawtext=fontfile={FONT}:text='오늘의 추천 상품':fontsize=60:fontcolor=white:x=(w-text_w)/2:y=380:{on}[p2]",
    f"[p2]drawtext=fontfile={FONT}:text='프로필 링크에서':fontsize=50:fontcolor=0xDDDDDD:x=(w-text_w)/2:y=1150:{on}[p3]",
    f"[p3]drawtext=fontfile={FONT}:textfile={OUT}/num.txt:fontsize=120:fontcolor=white:x=(w-text_w)/2:y=1230:{on}[p4]",
    f"[p4]drawtext=fontfile={FONT}:textfile={OUT}/disc.txt:fontsize=36:fontcolor=white:x=(w-text_w)/2:y=1420:{on}[vout]",
]
# 바탕: 그냥 검정은 성의 없어 보여서(2026-11-24 사장님) 원본 한 장면을 크게 흐리고 어둡게 한 은은한 바탕
BG = f"{OUT}/bg.png"
run(["ffmpeg", "-v", "error", "-y", "-ss", "1", "-i", SRC, "-frames:v", "1", "-vf",
     "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=45,eq=brightness=-0.32:saturation=0.75", BG])
inputs = ["-i", SRC, "-loop", "1", "-t", f"{TOTAL:.2f}", "-i", IMG, "-loop", "1", "-t", f"{TOTAL:.2f}", "-i", BG]
af = []
starts = start + [E + 0.05]
for i in range(k + 1):
    inputs += ["-i", f"{OUT}/v{i}.wav"]
    ms = int(starts[i] * 1000)
    af.append(f"[{i + 3}:a]adelay={ms}|{ms},apad[a{i}]")
af.append("".join(f"[a{i}]" for i in range(k + 1)) + f"amix=inputs={k + 1}:normalize=0,atrim=0:{TOTAL:.2f}[aout]")
out = f"{OUT}/{N}번_실제영상.mp4"
run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(vf + af), "-map", "[vout]", "-map", "[aout]",
     "-t", f"{TOTAL:.2f}", "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-c:a", "aac", "-b:a", "160k", out])
print(f"실제 영상 완료: {out} · {TOTAL:.1f}초 · 문장 시작 {[round(s, 2) for s in starts]}")
