import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTelegramMessage, telegramFileDownloadUrl } from "@/lib/telegram";
import { selectProductForVideo } from "@/lib/productSelector";
import { createVideoItem, fillVideoCopy } from "@/lib/videoItems";
import {
  makeFilePublic,
  driveDirectDownloadUrl,
  uploadBufferToDrive,
} from "@/lib/drive";
import { formatDisplayNumber } from "@/lib/format";
import { optionalEnv, requireEnv } from "@/lib/env";
import type { Product, TemplateType, VideoItemWithProduct } from "@/types/db";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

interface TelegramFile {
  file_id: string;
  file_size?: number;
  mime_type?: string;
}

interface TelegramUpdate {
  message?: {
    text?: string;
    caption?: string;
    chat?: { id?: number };
    video?: TelegramFile;
    document?: TelegramFile;
    animation?: TelegramFile;
  };
}

/** 봇 API getFile 다운로드 한도 */
const TELEGRAM_MAX_FILE_BYTES = 20 * 1024 * 1024;

const STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  generating: "생성 중",
  completed: "완료",
  failed: "실패",
};

/**
 * GitHub Actions 렌더 워크플로를 즉시 깨운다 (선택 기능).
 * GH_DISPATCH_TOKEN(actions:write 권한 PAT)과 GH_REPOSITORY(owner/repo)가
 * 설정된 경우에만 동작하며, 실패해도 15분 주기 스케줄이 처리하므로 무시한다.
 */
async function triggerRenderWorkflow(): Promise<void> {
  const token = optionalEnv("GH_DISPATCH_TOKEN");
  const repo = optionalEnv("GH_REPOSITORY");
  if (!token || !repo) return;
  const ref = optionalEnv("GH_BRANCH") ?? "claude/coupang-partners-shortform-hinfcb";
  try {
    await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/render.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref }),
      }
    );
  } catch {
    // best-effort: 스케줄 실행이 결국 처리한다
  }
}

async function handleVideoCommand(
  chatId: number,
  templateType?: TemplateType
): Promise<void> {
  const product = await selectProductForVideo();
  if (!product) {
    await sendTelegramMessage(
      "후보 상품이 없어요. 관리자 페이지에서 상품을 먼저 등록해주세요.",
      chatId
    );
    return;
  }

  // 수동 요청이므로 manual=true → 업로드 슬롯 게이트를 우회해 즉시 처리된다.
  const item = await createVideoItem(product, templateType, { manual: true });
  const filled = await fillVideoCopy(item, product);
  const number = formatDisplayNumber(filled.display_number);

  // 클라우드 렌더 즉시 시작 (설정된 경우)
  await triggerRenderWorkflow();

  // 링크페이지는 워커가 렌더를 완료해야 노출되므로(landing_visible=true),
  // 지금 시점의 링크는 아직 열리지 않는다 - 완료 메시지에서만 안내한다.
  await sendTelegramMessage(
    [
      "영상 생성 시작",
      "",
      `번호: ${number}`,
      `상품: ${product.product_name}`,
      `후킹: ${filled.hook_text ?? "-"}`,
      "",
      "완료되면 웹사이트에 등록되고 유튜브·인스타에 업로드된 뒤 링크를 보내드릴게요.",
    ].join("\n"),
    chatId
  );
}

/**
 * 사용자가 보낸 동영상을 그 상품의 배경 소스로 등록한다.
 * 캡션에 "13번"처럼 번호가 있으면 그 아이템의 상품에, 없으면 가장 최근
 * 대기/생성 중인 아이템의 상품에 붙인다. 렌더 워커가 products.source_video_url 을
 * 최우선으로 읽어 3~4.5초 컷으로 잘라 배경에 쓴다.
 *
 * ⚠️ 사용자가 "직접 고른" 영상만 받는다(자동 수집 아님). 저작권 판단·대응은
 *    업로드한 사람 책임 — 판매자/브랜드 영상, 본인 촬영본, 라이선스 확보분에 쓰세요.
 */
async function handleSourceVideo(
  chatId: number,
  file: TelegramFile,
  caption: string | undefined
): Promise<void> {
  if (file.file_size && file.file_size > TELEGRAM_MAX_FILE_BYTES) {
    await sendTelegramMessage(
      "영상이 20MB를 넘어서 봇이 못 받아요. 더 짧게 잘라서(또는 화질 낮춰) 보내주세요.",
      chatId
    );
    return;
  }

  const db = supabaseAdmin();

  // 대상 상품 찾기: 캡션의 번호 → 그 아이템, 없으면 가장 최근 대기/생성 중 아이템
  type Target = { product_id: string; display_number: number };
  const numMatch = caption?.match(/(\d+)\s*번?/);
  let target: Target | null = null;
  if (numMatch) {
    const { data } = await db
      .from("video_items")
      .select("product_id, display_number")
      .eq("display_number", Number(numMatch[1]))
      .maybeSingle();
    target = (data as Target | null) ?? null;
    if (!target) {
      await sendTelegramMessage(
        `${numMatch[1]}번 영상을 못 찾았어요. '최근영상'으로 번호를 확인해주세요.`,
        chatId
      );
      return;
    }
  } else {
    const { data } = await db
      .from("video_items")
      .select("product_id, display_number")
      .in("video_status", ["pending", "generating"])
      .order("display_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    target = (data as Target | null) ?? null;
    if (!target) {
      await sendTelegramMessage(
        "지금 대기 중인 영상이 없어요. 먼저 '업로드'로 영상을 만든 뒤, 캡션에 번호를 붙여 보내주세요.",
        chatId
      );
      return;
    }
  }

  const downloadUrl = await telegramFileDownloadUrl(file.file_id);
  if (!downloadUrl) {
    await sendTelegramMessage("영상 다운로드 링크를 못 만들었어요. 다시 보내주세요.", chatId);
    return;
  }
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    await sendTelegramMessage("영상 내려받기에 실패했어요. 다시 보내주세요.", chatId);
    return;
  }
  const buffer = Buffer.from(await res.arrayBuffer());

  // 드라이브에 보관 후 공개 URL 을 상품 소스로 등록 (워커가 여기서 받아 컷 추출)
  const folderId = requireEnv("GOOGLE_DRIVE_FOLDER_ID");
  const uploaded = await uploadBufferToDrive(
    folderId,
    `source-${target.display_number}-${Date.now()}.mp4`,
    "video/mp4",
    buffer
  );
  await makeFilePublic(uploaded.id);
  const publicUrl = driveDirectDownloadUrl(uploaded.id);

  await db
    .from("products")
    .update({
      source_video_url: publicUrl,
      source_video_origin: "직접 업로드",
      source_video_checked_at: new Date().toISOString(),
    })
    .eq("id", target.product_id);

  await sendTelegramMessage(
    [
      `✅ ${target.display_number}번 배경 영상으로 등록했어요`,
      "",
      "렌더할 때 이 영상을 잘라서 배경으로 써요.",
      "아직 렌더 전이면 그대로 반영되고, 이미 만들어졌으면 '업로드'로 다시 만들면 적용돼요.",
    ].join("\n"),
    chatId
  );
}

async function handleProductListCommand(chatId: number): Promise<void> {
  const { data } = await supabaseAdmin()
    .from("products")
    .select("*")
    .eq("status", "candidate")
    .order("created_at", { ascending: false })
    .limit(20);
  const products = (data as Product[] | null) ?? [];

  if (products.length === 0) {
    await sendTelegramMessage("등록된 후보 상품이 없어요.", chatId);
    return;
  }

  const lines = products.map(
    (p, i) => `${i + 1}. ${p.product_name} (${p.category})`
  );
  await sendTelegramMessage(
    ["후보 상품 목록", "", ...lines].join("\n"),
    chatId
  );
}

async function handleRecentVideosCommand(chatId: number): Promise<void> {
  const { data } = await supabaseAdmin()
    .from("video_items")
    .select("*, products(*)")
    .order("display_number", { ascending: false })
    .limit(10);
  const items = (data as VideoItemWithProduct[] | null) ?? [];

  if (items.length === 0) {
    await sendTelegramMessage("아직 생성된 영상이 없어요.", chatId);
    return;
  }

  const lines = items.map((v) => {
    const status = STATUS_LABEL[v.video_status] ?? v.video_status;
    const drive = v.drive_video_url ? `\n   ${v.drive_video_url}` : "";
    return `${formatDisplayNumber(v.display_number)} ${v.products.product_name} [${status}]${drive}`;
  });
  await sendTelegramMessage(["최근 영상", "", ...lines].join("\n"), chatId);
}

async function handleStatusCommand(chatId: number): Promise<void> {
  const db = supabaseAdmin();
  const [
    { count: productCount },
    { count: candidateCount },
    { count: videoCount },
    { data: latest },
  ] = await Promise.all([
    db.from("products").select("*", { count: "exact", head: true }),
    db
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("status", "candidate"),
    db.from("video_items").select("*", { count: "exact", head: true }),
    db
      .from("video_items")
      .select("*, products(*)")
      .order("display_number", { ascending: false })
      .limit(3),
  ]);

  const latestLines = ((latest as VideoItemWithProduct[] | null) ?? []).map(
    (v) =>
      `- ${formatDisplayNumber(v.display_number)} ${v.products.product_name}: ${
        STATUS_LABEL[v.video_status] ?? v.video_status
      }`
  );

  await sendTelegramMessage(
    [
      "현재 상태",
      "",
      `전체 상품: ${productCount ?? 0}개`,
      `후보 상품: ${candidateCount ?? 0}개`,
      `생성된 영상: ${videoCount ?? 0}개`,
      "",
      "최근 생성:",
      ...(latestLines.length > 0 ? latestLines : ["- 없음"]),
    ].join("\n"),
    chatId
  );
}

/**
 * Telegram Bot webhook.
 * - setWebhook 시 등록한 secret_token 을 헤더로 검증한다 (필수).
 *   TELEGRAM_WEBHOOK_SECRET 이 없으면 요청 출처를 검증할 방법이 없으므로
 *   (chat id 만으로는 추측 가능해 안전하지 않음) 요청을 거부한다.
 * - TELEGRAM_ALLOWED_CHAT_ID 에서 온 메시지만 처리한다.
 */
export async function POST(request: NextRequest) {
  const webhookSecret = optionalEnv("TELEGRAM_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error(
      "TELEGRAM_WEBHOOK_SECRET 이 설정되지 않아 요청을 거부합니다. .env.example 을 참고해 설정하세요."
    );
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const header = request.headers.get("x-telegram-bot-api-secret-token");
  if (header !== webhookSecret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const chatId = update.message?.chat?.id;
  if (!chatId) {
    return NextResponse.json({ ok: true });
  }

  const allowedChatId = requireEnv("TELEGRAM_ALLOWED_CHAT_ID");
  if (String(chatId) !== allowedChatId) {
    // 허용되지 않은 채팅은 조용히 무시
    return NextResponse.json({ ok: true });
  }

  // 동영상 파일 업로드 → 상품 배경 소스로 등록
  const videoFile =
    update.message?.video ??
    update.message?.animation ??
    (update.message?.document?.mime_type?.startsWith("video/")
      ? update.message?.document
      : undefined);
  if (videoFile) {
    try {
      await handleSourceVideo(chatId, videoFile, update.message?.caption);
    } catch (error) {
      console.error("소스 영상 처리 실패:", error);
      try {
        await sendTelegramMessage(
          `영상 등록 중 오류가 났어요: ${error instanceof Error ? error.message : String(error)}`,
          chatId
        );
      } catch {
        // 무시
      }
    }
    return NextResponse.json({ ok: true });
  }

  const text = update.message?.text?.trim();
  if (!text) {
    return NextResponse.json({ ok: true });
  }

  // "업로드"/"영상" 또는 "영상A"~"영상D" (템플릿 지정: D = 실사용 스톡영상 배경 포맷)
  const videoMatch = text.match(/^(?:영상|업로드)\s*([ABCDabcd])?$/);

  try {
    if (videoMatch) {
      const t = videoMatch[1]?.toUpperCase() as TemplateType | undefined;
      await handleVideoCommand(chatId, t);
      return NextResponse.json({ ok: true });
    }
    switch (text) {
      case "상품목록":
        await handleProductListCommand(chatId);
        break;
      case "최근영상":
        await handleRecentVideosCommand(chatId);
        break;
      case "상태":
        await handleStatusCommand(chatId);
        break;
      default:
        await sendTelegramMessage(
          [
            "사용할 수 있는 명령이에요:",
            "",
            "업로드 - 새 상품 하나 골라 웹사이트 등록 + 영상 생성·업로드 (즉시)",
            "영상 - 업로드와 같음 (영상D 처럼 템플릿 지정 가능)",
            "상품목록 - 후보 상품 보기",
            "최근영상 - 최근 생성된 영상과 드라이브 링크",
            "상태 - 전체 현황 요약",
            "",
            "🎥 동영상을 보내면 배경 소스로 등록돼요 (캡션에 '13번'처럼 번호).",
            "   번호 없으면 가장 최근 대기 중인 영상에 붙어요.",
          ].join("\n"),
          chatId
        );
    }
  } catch (error) {
    console.error("텔레그램 명령 처리 실패:", error);
    try {
      await sendTelegramMessage(
        `처리 중 오류가 발생했어요: ${error instanceof Error ? error.message : String(error)}`,
        chatId
      );
    } catch {
      // 알림 실패는 무시
    }
  }

  return NextResponse.json({ ok: true });
}
