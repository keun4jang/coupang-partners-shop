"""
무료 오픈소스 음성 Supertonic 으로 나레이션 줄들을 합성한다 (2026-10-13, src/lib/tts.ts 가 호출).

구글 TTS(결제 필요)·Edge 무료 음성(403 차단)이 10/12 부터 막혀 사장님 승인으로 1순위 음성이 됐다.
비용 0원 - 렌더 서버 CPU 에서 직접 돈다. 코드 MIT · 모델 OpenRAIL-M(사람 사칭·기만 용도 금지).

입력(stdin JSON): {"lines": ["...", ...], "outDir": "...", "voice": "M1", "speed": 1.25}
출력(stdout 마지막 줄 JSON): {"files": ["...mp3" | null, ...], "seconds": [float | null, ...]}
빈 줄은 null. 한 줄이 실패해도 나머지는 계속한다.
"""
import json
import os
import sys


def trim_silence(wav, sr: int, pad: float = 0.06):
    """앞뒤 무음 자르기 - 대화형 드라마는 대사 사이가 비면 말이 뚝뚝 끊겨 들린다 (2026-10-31 사장님 "멘트가 끊긴다")"""
    import numpy as np

    a = np.abs(wav)
    thr = max(1e-4, float(a.max()) * 0.02)
    idx = np.where(a > thr)[0]
    if len(idx) == 0:
        return wav
    p = int(sr * pad)
    return wav[max(0, idx[0] - p): min(len(wav), idx[-1] + p)]


def main() -> None:
    req = json.loads(sys.stdin.buffer.read().decode("utf-8"))  # 윈도우 기본 인코딩(cp949) 회피
    import soundfile as sf
    from supertonic import TTS

    tts = TTS()
    style = tts.get_voice_style(req.get("voice") or "M1")
    speed = float(req.get("speed") or 1.25)
    out_dir = req["outDir"]
    os.makedirs(out_dir, exist_ok=True)
    files, seconds = [], []
    for i, line in enumerate(req["lines"]):
        if not line.strip():
            files.append(None)
            seconds.append(None)
            continue
        try:
            wav, dur = tts.synthesize(line, voice_style=style, lang="ko", speed=speed)
            if req.get("trim"):
                wav = trim_silence(wav.squeeze(), tts.sample_rate)
                dur = float(wav.shape[-1]) / float(tts.sample_rate)
            # wav(44.1kHz)는 줄마다 수백 KB 라 렌더 props 가 커진다(롱폼 9줄) → mp3 로 약 1/4
            path = os.path.join(out_dir, f"line{i}.mp3")
            sf.write(path, wav.squeeze(), tts.sample_rate, format="MP3")
            files.append(path)
            # 실제 소리 길이로 잰다 - 엔진이 알려 주는 dur 가 실제보다 짧아 영상에서 말끝이 잘렸다 (2026-10-31 사장님 "마지막쯤 멘트가 끊긴다")
            reported = float(sum(dur)) if hasattr(dur, "__len__") else float(dur)
            actual = float(wav.squeeze().shape[-1]) / float(tts.sample_rate)
            seconds.append(max(reported, actual))
        except Exception as e:  # noqa: BLE001 - 줄 하나 실패는 무음으로
            print(f"supertonic 줄 {i} 실패: {e}", file=sys.stderr)
            files.append(None)
            seconds.append(None)
    print(json.dumps({"files": files, "seconds": seconds}))


if __name__ == "__main__":
    main()
