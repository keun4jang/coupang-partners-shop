import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { optionalEnv } from "./env";

/**
 * 나레이션 TTS.
 * 자막 줄(후킹/공감/장점1/장점2/CTA)을 각각 오디오로 합성해
 * data URI + 실측 길이(초)로 돌려준다.
 * → Remotion <Audio src=data:...> 로 장면별 재생하고,
 *   길이는 워커가 장면 컷 타이밍을 나레이션에 맞추는 데 쓴다.
 *
 * 음성 품질 체인:
 *  1) GOOGLE_TTS_API_KEY 가 있으면 Google Cloud TTS (Chirp3-HD, 훨씬 자연스러움)
 *     - 프로젝트에서 Text-to-Speech API 를 활성화해야 동작. 미활성/오류 시 자동 폴백.
 *  2) Microsoft Edge 무료 음성 (ko-KR-SunHiNeural)
 *
 * - 실패해도 영상 생성은 멈추지 않는다: 실패한 줄은 null(무음).
 * - TTS_DISABLED=1 이면 전체 비활성화.
 * - GOOGLE_TTS_VOICE / TTS_VOICE 로 각각 목소리 변경 가능.
 */

const DEFAULT_VOICE = "ko-KR-SunHiNeural";
/** 쇼츠 톤에 맞게 경쾌하게 (구글 TTS 폴백용 Edge 음성도 동일 체감 속도로) */
const DEFAULT_RATE = "+15%";
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

async function synthesizeLineEdge(
  tts: MsEdgeTTS,
  text: string
): Promise<NarrationLine | null> {
  try {
    const { audioStream } = await tts.toStream(naturalizePhrasing(ttsReadable(text)), {
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
    console.warn(`Edge TTS 합성 실패 (무음으로 진행): ${(e as Error).message}`);
    return null;
  }
}

/* ── Google Cloud TTS (자연스러운 Chirp3-HD 음성) ───────────────────── */

const GOOGLE_SAMPLE_RATE = 24_000;
/**
 * 선호 순서대로 시도. 앞이 안 되면(미지원 등) 다음으로 넘어간다.
 * "동네 아줌마"처럼 따뜻하고 편안한 톤을 위해 warm/gentle 계열을 앞에 둔다.
 */
const GOOGLE_VOICE_FALLBACKS = [
  "ko-KR-Chirp3-HD-Vindemiatrix", // Gentle - 부드러운 여성 (사장님 선택)
  "ko-KR-Chirp3-HD-Callirrhoe", // Easy-going - 편안한 여성
  "ko-KR-Chirp3-HD-Sulafat", // Warm
  "ko-KR-Chirp3-HD-Aoede", // Breezy
  "ko-KR-Chirp3-HD-Kore",
  "ko-KR-Neural2-A",
];
/** 나레이션 말 속도 - 쇼츠 시청자가 지루하지 않게 경쾌하게 (1.0=기본, 사장님 피드백: 느리다 → 상향) */
const GOOGLE_SPEAKING_RATE = 1.08;

/**
 * 억양 안정화용 텍스트 정리.
 * - 문장 끝에 종결 부호가 없으면 붙여 종결 억양(내림/올림)을 또렷하게 만든다.
 * - 쉼표 뒤 공백을 정리해 호흡(짧은 쉼)이 자연스럽게 들어가게 한다.
 * Chirp3-HD 는 SSML 을 못 받으므로, 문장부호로 유도할 수 있는 범위에서 다듬는다.
 */
export function naturalizePhrasing(text: string): string {
  let t = text.trim().replace(/\s*,\s*/g, ", ");
  if (t && !/[.?!…~]$/.test(t)) {
    const isQuestion =
      /[?]/.test(t) || /(까요?|나요|ㄹ까요?|을까요?|가요|어때요?)\s*$/.test(t);
    t += isQuestion ? "?" : ".";
  }
  return t;
}

async function synthesizeLineGoogle(
  apiKey: string,
  voice: string,
  text: string
): Promise<NarrationLine> {
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: naturalizePhrasing(ttsReadable(text)) },
        voice: { languageCode: "ko-KR", name: voice },
        audioConfig: {
          audioEncoding: "LINEAR16",
          sampleRateHertz: GOOGLE_SAMPLE_RATE,
          speakingRate: GOOGLE_SPEAKING_RATE,
        },
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`구글 TTS ${res.status}: ${body.slice(0, 160)}`);
  }
  const { audioContent } = (await res.json()) as { audioContent?: string };
  if (!audioContent) throw new Error("구글 TTS 빈 응답");
  const buf = Buffer.from(audioContent, "base64");
  // LINEAR16 응답은 WAV 헤더(44바이트) 포함 → 정확한 길이 계산 가능
  const seconds = Math.max(0, buf.length - 44) / (GOOGLE_SAMPLE_RATE * 2);
  return {
    uri: `data:audio/wav;base64,${audioContent}`,
    seconds: Math.max(0.5, seconds - 0.15),
  };
}

/**
 * 여러 줄을 순서대로 합성. 전부 실패하면 null (나레이션 없음).
 * 구글 TTS(자연스러움) 우선 → 실패 시 Edge 무료 음성 폴백.
 */
export async function generateNarration(
  lines: string[]
): Promise<(NarrationLine | null)[] | null> {
  if (optionalEnv("TTS_DISABLED") === "1") return null;

  // 1) Google Cloud TTS 시도
  // [결제 안전장치] 영상당 합성 글자 수 상한. 무료 한도(월 100만 자) 대비
  // 하루 10편을 만들어도 월 60만 자를 넘을 수 없는 수준으로 제한한다.
  const GOOGLE_CHAR_CAP_PER_VIDEO = 2000;
  const totalChars = lines.join("").length;
  const googleKey =
    totalChars <= GOOGLE_CHAR_CAP_PER_VIDEO
      ? optionalEnv("GOOGLE_TTS_API_KEY")
      : undefined;
  if (totalChars > GOOGLE_CHAR_CAP_PER_VIDEO) {
    console.warn(
      `나레이션 ${totalChars}자 > 상한 ${GOOGLE_CHAR_CAP_PER_VIDEO}자 - 구글 TTS 건너뜀(무료 한도 보호)`
    );
  }
  if (googleKey) {
    const preferred = optionalEnv("GOOGLE_TTS_VOICE");
    const voices = preferred
      ? [preferred, ...GOOGLE_VOICE_FALLBACKS]
      : GOOGLE_VOICE_FALLBACKS;
    for (const voice of voices) {
      try {
        const out: (NarrationLine | null)[] = [];
        for (const line of lines) {
          out.push(
            line.trim()
              ? await synthesizeLineGoogle(googleKey, voice, line.trim())
              : null
          );
        }
        console.log(`구글 TTS 사용 (${voice})`);
        return out.some((x) => x !== null) ? out : null;
      } catch (e) {
        const msg = (e as Error).message;
        console.warn(`구글 TTS(${voice}) 실패: ${msg.slice(0, 120)}`);
        // API 미활성/권한 문제면 다른 목소리를 시도해도 소용없음 → Edge 로
        if (msg.includes("403") || msg.includes("PERMISSION_DENIED")) break;
      }
    }
    console.warn("구글 TTS 사용 불가 → Edge 음성으로 폴백");
  }

  // 2) Edge 무료 음성 폴백
  const voice = optionalEnv("TTS_VOICE") ?? DEFAULT_VOICE;
  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const out: (NarrationLine | null)[] = [];
    for (const line of lines) {
      out.push(line.trim() ? await synthesizeLineEdge(tts, line.trim()) : null);
    }
    return out.some((x) => x !== null) ? out : null;
  } catch (e) {
    console.warn(`TTS 초기화 실패 (나레이션 없이 진행): ${(e as Error).message}`);
    return null;
  }
}
