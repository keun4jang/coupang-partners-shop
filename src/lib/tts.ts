import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { optionalEnv } from "./env";

/**
 * 나레이션 TTS (Microsoft Edge 무료 음성).
 * 자막 줄(후킹/공감/장점1/장점2/CTA)을 각각 mp3 로 합성해
 * data URI 배열로 돌려준다 → Remotion <Audio src=data:...> 로 장면별 재생.
 *
 * - 실패해도 영상 생성은 멈추지 않는다: 실패한 줄은 null(무음).
 * - TTS_DISABLED=1 이면 전체 비활성화.
 * - 목소리는 TTS_VOICE 로 변경 가능 (기본: ko-KR-SunHiNeural, 따뜻한 여성 톤).
 */

const DEFAULT_VOICE = "ko-KR-SunHiNeural";
/** 자막 장면 길이에 맞추기 위해 살짝 빠르게 */
const DEFAULT_RATE = "+8%";

async function synthesizeLine(
  tts: MsEdgeTTS,
  text: string
): Promise<string | null> {
  try {
    const { audioStream } = await tts.toStream(text, { rate: DEFAULT_RATE });
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(chunk as Buffer);
    }
    const buf = Buffer.concat(chunks);
    if (buf.length === 0) return null;
    return `data:audio/mpeg;base64,${buf.toString("base64")}`;
  } catch (e) {
    console.warn(`TTS 합성 실패 (무음으로 진행): ${(e as Error).message}`);
    return null;
  }
}

/**
 * 여러 줄을 순서대로 합성. 전부 실패하면 null (나레이션 없음).
 * 한 번의 연결 실패가 전체를 막지 않도록 줄 단위로 재시도한다.
 */
export async function generateNarration(
  lines: string[]
): Promise<(string | null)[] | null> {
  if (optionalEnv("TTS_DISABLED") === "1") return null;

  const voice = optionalEnv("TTS_VOICE") ?? DEFAULT_VOICE;
  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const out: (string | null)[] = [];
    for (const line of lines) {
      out.push(line.trim() ? await synthesizeLine(tts, line.trim()) : null);
    }
    return out.some((x) => x !== null) ? out : null;
  } catch (e) {
    console.warn(`TTS 초기화 실패 (나레이션 없이 진행): ${(e as Error).message}`);
    return null;
  }
}
