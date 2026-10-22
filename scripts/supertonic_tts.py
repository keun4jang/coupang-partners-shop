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
            # wav(44.1kHz)는 줄마다 수백 KB 라 렌더 props 가 커진다(롱폼 9줄) → mp3 로 약 1/4
            path = os.path.join(out_dir, f"line{i}.mp3")
            sf.write(path, wav.squeeze(), tts.sample_rate, format="MP3")
            files.append(path)
            seconds.append(float(sum(dur)) if hasattr(dur, "__len__") else float(dur))
        except Exception as e:  # noqa: BLE001 - 줄 하나 실패는 무음으로
            print(f"supertonic 줄 {i} 실패: {e}", file=sys.stderr)
            files.append(None)
            seconds.append(None)
    print(json.dumps({"files": files, "seconds": seconds}))


if __name__ == "__main__":
    main()
