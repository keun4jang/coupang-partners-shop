import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";
import { selectProductForVideo } from "@/lib/productSelector";
import { createVideoItem, fillVideoCopy } from "@/lib/videoItems";
import { formatDisplayNumber } from "@/lib/format";
import { optionalEnv, requireEnv } from "@/lib/env";
import type { Product, TemplateType, VideoItemWithProduct } from "@/types/db";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id?: number };
  };
}

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

  const item = await createVideoItem(product, templateType);
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
      `템플릿: ${filled.template_type}`,
      `후킹: ${filled.hook_text ?? "-"}`,
      "",
      "영상 렌더링은 워커가 처리해요. 완료되면 링크페이지와 구글드라이브 링크를 보내드릴게요.",
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
  const text = update.message?.text?.trim();
  if (!chatId || !text) {
    return NextResponse.json({ ok: true });
  }

  const allowedChatId = requireEnv("TELEGRAM_ALLOWED_CHAT_ID");
  if (String(chatId) !== allowedChatId) {
    // 허용되지 않은 채팅은 조용히 무시
    return NextResponse.json({ ok: true });
  }

  // "영상" 또는 "영상A"~"영상D" (템플릿 지정: D = 실사용 스톡영상 배경 포맷)
  const videoMatch = text.match(/^영상\s*([ABCDabcd])?$/);

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
            "영상 - 상품 선택 후 새 번호로 영상 생성 (A/B/C 자동 로테이션)",
            "영상D - 실사용 스톡영상 배경 포맷으로 생성",
            "상품목록 - 후보 상품 보기",
            "최근영상 - 최근 생성된 영상과 드라이브 링크",
            "상태 - 전체 현황 요약",
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
