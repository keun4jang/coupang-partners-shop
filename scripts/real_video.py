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
    # clips: [시작, 길이(없거나 0 이면 남은 시간), x, y] - x·y 는 그 장면만의 자르기 위치(없으면 문장의 x·y, 그것도 없으면 crop 값)
    fixed = sum(c[1] for c in ln["clips"] if len(c) > 1 and c[1])
    for c in ln["clips"]:
        segs.append((c[0], c[1] if len(c) > 1 and c[1] else dur - fixed,
                     c[2] if len(c) > 2 else ln.get("x"), c[3] if len(c) > 3 else ln.get("y")))

for i, ln in enumerate(spec["lines"]):
    open(f"{OUT}/t{i}.txt", "w", encoding="utf-8").write(ln["caption"])
open(f"{OUT}/disc.txt", "w", encoding="utf-8").write(DISC)
open(f"{OUT}/num.txt", "w", encoding="utf-8").write(f"{N}번")

# crop: [너비, 높이, x, y] (x·y 생략 시 0). 문장마다 "y" 로 세로 위치를 따로 줄 수 있다(662 - 장면마다 물건 높이가 다름)
cw, ch, cx, cy = (list(spec.get("crop", [720, 780])) + [0, 0])[:4]
# frame: "memo" 면 메모지 바탕 + 사진처럼 테두리 두른 틀 안에서 영상이 나오고 자막은 틀 밖 아래(2026-11-26 사장님 "틀 안에서 재생, 자막은 밖")
# 2026-11-26 사장님 "메모장 프레임 좋고, 자막은 인스타·유튜브에서 안 가리는 구간 안에" → 메모지 틀이 기본("frame": "none" 이면 예전 모양).
FRAME = os.environ.get("REAL_FRAME") or spec.get("frame", "memo")
if FRAME == "none":
    FRAME = ""
# 쇼츠·릴스 공통 안전 구간(1080x1920): 위 230 아래로, 아래 1430 위로(밑의 설명·버튼), 글자는 가운데 760 폭 안(x 160~920)(오른쪽 버튼 줄 피함)
SAFE_TOP, SAFE_BOTTOM, CAP_W, CAP_SIZE, CAP_LINE, PAD = 230, 1430, 760, 58, 74, 18
if FRAME:
    vy = SAFE_TOP
    vw = min(940, int((SAFE_BOTTOM - 2 * CAP_LINE - 50 - PAD - vy) * cw / ch) // 2 * 2)   # 자막 두 줄 자리를 남기고 틀 크기를 정한다
else:
    vw, vy = 1080, 140
vx = (1080 - vw) // 2
vh = round(vw * ch / cw)
if FRAME:
    vy += max(0, (SAFE_BOTTOM - 2 * CAP_LINE - 50 - PAD - SAFE_TOP - vh) // 2)   # 가로로 넓은 영상은 틀과 자막을 안전 구간 가운데로


def fit_caption(text):
    """자막을 안전 폭(CAP_W) 안에 넣는다: 한 줄로 안 되면 가운데 띄어쓰기에서 두 줄로, 그래도 넘치면 글자를 줄인다. [(글, 크기)]"""
    if not FRAME:
        return [(text, CAP_SIZE)]
    try:
        from PIL import ImageFont
        width = lambda t, z: ImageFont.truetype(FONT, z).getlength(t)
    except Exception:
        width = lambda t, z: len(t) * z * 0.9
    rows = [text]
    if width(text, CAP_SIZE) > CAP_W and " " in text:
        cuts = [m for m, c in enumerate(text) if c == " "]
        m = min(cuts, key=lambda q: abs(q - len(text) / 2))
        rows = [text[:m], text[m + 1:]]
    size = CAP_SIZE
    while size > 40 and max(width(r, size) for r in rows) > CAP_W:
        size -= 2
    return [(r, size) for r in rows]
INK, INK2 = ("0x3B2F2A", "0x7A6A5E") if FRAME else ("white", "0xDDDDDD")
vf = []
src = "[0:v]"
# blur: [x, y, 너비, 높이, 시작초, 끝초, (세기 - 생략 시 25)]. 세기를 낮게(4~6) 주면 물건은 보이고 글자만 못 읽게 된다(610 - 포장지 중국어)
for j, (x, y, w, h, a, b, *r) in enumerate(spec.get("blur", [])):
    vf += [f"{src}split[o{j}][q{j}]", f"[q{j}]crop={w}:{h}:{x}:{y},boxblur={r[0] if r else 25}:2[bl{j}]",
           f"[o{j}][bl{j}]overlay={x}:{y}:enable='between(t,{a},{b})'[u{j}]"]
    src = f"[u{j}]"
n = len(segs)
vf.append(f"{src}split={n}" + "".join(f"[s{m}]" for m in range(n)))
for m, (a, d, x, y) in enumerate(segs):
    vf.append(f"[s{m}]trim=start={a}:duration={d:.3f},setpts=PTS-STARTPTS,crop={cw}:{ch}:{cx if x is None else x}:{cy if y is None else y}[c{m}]")
cap_y = vy + vh + (PAD + 50 if FRAME else 45)
vf += [
    "".join(f"[c{m}]" for m in range(n)) + f"concat=n={n}:v=1:a=0,scale={vw}:{vh},setsar=1[v]",
    "[2:v]setsar=1[bg]",
    # 끝 화면이 시작되면 영상은 바로 감춘다(장면 길이 반올림 때문에 영상이 몇 장 더 남아 끝 화면 글자와 겹쳤다 - 644 에서 발견)
    f"[bg][v]overlay={vx}:{vy}:eof_action=pass:enable='lt(t,{E:.2f})'[b00]",
    (f"[b00][{k + 4}:v]overlay=0:0:enable='lt(t,{E:.2f})'[b0]" if FRAME else "[b00]null[b0]"),
]
last = "b0"
for i in range(k):
    a = 0 if i == 0 else start[i]
    b = start[i + 1] if i < k - 1 else E
    for j, (row, size) in enumerate(fit_caption(spec["lines"][i]["caption"])):
        open(f"{OUT}/t{i}_{j}.txt", "w", encoding="utf-8").write(row)
        vf.append(f"[{last}]drawtext=fontfile={FONT}:textfile={OUT}/t{i}_{j}.txt:fontsize={size}:fontcolor={INK}:"
                  f"x=(w-text_w)/2:y={cap_y + j * CAP_LINE}:enable='between(t,{a:.2f},{b:.2f})'[k{i}_{j}]")
        last = f"k{i}_{j}"
on = f"enable='gte(t,{E:.2f})'"
vf += [
    "[1:v]scale=600:600:force_original_aspect_ratio=decrease[pimg]",
    f"[{last}]null[k]",
    f"[k][pimg]overlay=(W-w)/2:500:{on}[p]",
    f"[p]drawtext=fontfile={FONT}:text='오늘의 추천 상품':fontsize=60:fontcolor={INK}:x=(w-text_w)/2:y=380:{on}[p2]",
    f"[p2]drawtext=fontfile={FONT}:text='프로필 링크에서':fontsize=50:fontcolor={INK2}:x=(w-text_w)/2:y=1150:{on}[p3]",
    f"[p3]drawtext=fontfile={FONT}:textfile={OUT}/num.txt:fontsize=120:fontcolor={INK}:x=(w-text_w)/2:y=1230:{on}[p4]",
    # 본인 상품("own": true)은 파트너스 상품이 아니므로 화면에 수수료 문구를 띄우지 않는다(CLAUDE.md - 본인 상품 고지는 캡션·설명에만)
    ("[p4]null[vout]" if spec.get("own") else
     f"[p4]drawtext=fontfile={FONT}:textfile={OUT}/disc.txt:fontsize=36:fontcolor={INK}:x=(w-text_w)/2:y={1385 if FRAME else 1420}:{on}[vout]"),
]
# 바탕: 그냥 검정은 성의 없어 보여서(2026-11-24 사장님) 원본 한 장면을 크게 흐리고 어둡게 한 은은한 바탕
BG = f"{OUT}/bg.png"
if FRAME:
    from PIL import Image, ImageDraw, ImageFilter
    PAPER = (247, 243, 234)
    Image.new("RGB", (1080, 1920), PAPER).save(BG)
    # 틀: 메모지 바탕에 둥근 창을 뚫고, 흰 테두리(사진 느낌)·옅은 그림자·마스킹 테이프를 얹는다. 영상 위에 덮는다.
    pad, rad = PAD, 34
    sh = Image.new("L", (1080, 1920), 0)
    ImageDraw.Draw(sh).rounded_rectangle([vx - pad + 6, vy - pad + 14, vx + vw + pad + 6, vy + vh + pad + 14], rad + pad, fill=90)
    sh = sh.filter(ImageFilter.GaussianBlur(16))
    fr = Image.new("RGBA", (1080, 1920), PAPER + (255,))
    fr.paste(Image.new("RGBA", (1080, 1920), (90, 70, 50, 255)), (0, 0), sh)
    d = ImageDraw.Draw(fr)
    d.rounded_rectangle([vx - pad, vy - pad, vx + vw + pad, vy + vh + pad], rad + pad, fill=(255, 255, 255, 255))
    hole = Image.new("L", (1080, 1920), 255)
    ImageDraw.Draw(hole).rounded_rectangle([vx, vy, vx + vw, vy + vh], rad, fill=0)
    fr.putalpha(hole)
    tape = Image.new("RGBA", (300, 64), (232, 196, 160, 215))
    td = ImageDraw.Draw(tape)
    for x in range(0, 300, 22):
        td.line([(x, 0), (x + 12, 64)], fill=(245, 222, 196, 215), width=6)
    tape = tape.rotate(-4, expand=True, resample=Image.BICUBIC)
    fr.alpha_composite(tape, ((1080 - tape.width) // 2, vy - pad - tape.height // 2 - 4))
    fr.save(f"{OUT}/frame.png")
else:
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
if FRAME:
    inputs += ["-loop", "1", "-t", f"{TOTAL:.2f}", "-i", f"{OUT}/frame.png"]
out = f"{OUT}/{N}번_실제영상.mp4"
run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(vf + af), "-map", "[vout]", "-map", "[aout]",
     "-t", f"{TOTAL:.2f}", "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-c:a", "aac", "-b:a", "160k", out])
print(f"실제 영상 완료: {out} · {TOTAL:.1f}초 · 문장 시작 {[round(s, 2) for s in starts]}")
