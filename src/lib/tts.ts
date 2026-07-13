import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { optionalEnv } from "./env";

/**
 * 나레이션 TTS (Microsoft Edge 무료 음성).
 * 자막 줄(후킹/공감/장점1/장점2/CTA)을 각각 mp3 로 합성해
 * data URI + 실측 길이(초)로 돌려준다.
 * → Remotion <Audio src=data:...> 로 장면별 재생하고,
 *   길이는 워커가 장면 컷 타이밍을 나레이션에 맞추는 데 쓴다.
 *
 * - 실패해도 영상 생성은 멈추지 않는다: 실패한 줄은 null(무음).
 * - TTS_DISABLED=1 이면 전체 비활성화.
 * - 목소리는 TTS_VOICE 로 변경 가능 (기본: ko-KR-SunHiNeural, 따뜻한 여성 톤).
 */

const DEFAULT_VOICE = "ko-KR-SunHiNeural";
/** 자막 장면 길이에 맞추기 위해 살짝 빠르게 */
const DEFAULT_RATE = "+8%";
/** OUTPUT_FORMAT 이 48kbps CBR mp3 → 길이(초) ≈ bytes*8/48000 */
const MP3_BITRATE = 48_000;
/**
 * Edge TTS 는 클립 끝에 ~0.9초의 무음을 붙인다(실측).
 * 장면 컷 계산에는 실제 발화 길이가 필요하므로 이만큼 빼서 돌려준다.
 * (재생 자체는 Sequence 가 장면 끝에서 잘라주므로 문제 없음)
 */
const TRAILING_SILENCE_SECONDS = 0.85;

export interface NarrationLine {
  /** data:audio/mpeg;base64,... */
  uri: string;
  /** 발화 길이(초) - 끝 무음 제외 추정치 */
  seconds: number;
}

const SINO_DIGITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];

/** 숫자 → 한자어 읽기 (금액/번호용). 9999까지 지원 */
export function sinoKorean(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  if (n === 0) return "영";
  let out = "";
  let rest = n;
  const units: Array<[number, string]> = [
    [1000, "천"],
    [100, "백"],
    [10, "십"],
  ];
  for (const [v, name] of units) {
    const q = Math.floor(rest / v);
    if (q > 0) {
      out += (q > 1 ? SINO_DIGITS[q] : "") + name;
      rest -= q * v;
    }
  }
  if (rest > 0) out += SINO_DIGITS[rest];
  return out;
}

/**
 * TTS 발음 교정: "3번"을 "세 번(횟수)"이 아니라 "삼번(번호)"으로 읽도록
 * 숫자+번 패턴을 한자어 표기로 치환한다. 자막 텍스트에는 영향 없음(TTS 입력 전용).
 */
export function ttsReadable(text: string): string {
  return text.replace(/(\d+)\s*번/g, (_, d: string) => `${sinoKorean(parseInt(d, 10))}번`);
}

async function synthesizeLine(
  tts: MsEdgeTTS,
  text: string
): Promise<NarrationLine | null> {
  try {
    const { audioStream } = await tts.toStream(ttsReadable(text), {
      rate: DEFAULT_RATE,
    });
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(chunk as Buffer);
    }
    const buf = Buffer.concat(chunks);
    if (buf.length === 0) return null;
    const rawSeconds = (buf.length * 8) / MP3_BITRATE;
    return {
      uri: `data:audio/mpeg;base64,${buf.toString("base64")}`,
      seconds: Math.max(0.5, rawSeconds - TRAILING_SILENCE_SECONDS),
    };
  } catch (e) {
    console.warn(`TTS 합성 실패 (무음으로 진행): ${(e as Error).message}`);
    return null;
  }
}

/**
 * 여러 줄을 순서대로 합성. 전부 실패하면 null (나레이션 없음).
 * 한 번의 연결 실패가 전체를 막지 않도록 줄 단위로 처리한다.
 */
export async function generateNarration(
  lines: string[]
): Promise<(NarrationLine | null)[] | null> {
  if (optionalEnv("TTS_DISABLED") === "1") return null;

  const voice = optionalEnv("TTS_VOICE") ?? DEFAULT_VOICE;
  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const out: (NarrationLine | null)[] = [];
    for (const line of lines) {
      out.push(line.trim() ? await synthesizeLine(tts, line.trim()) : null);
    }
    return out.some((x) => x !== null) ? out : null;
  } catch (e) {
    console.warn(`TTS 초기화 실패 (나레이션 없이 진행): ${(e as Error).message}`);
    return null;
  }
}
