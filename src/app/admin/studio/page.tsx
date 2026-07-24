"use client";

import { useState } from "react";

/**
 * 스튜디오 - 직접 소재로 영상 만들기.
 *
 * 흐름:
 *  1) 소재 추천: 도우인에서 영상 찾기 쉬운 상품 + 복붙용 중국어 키워드
 *  2) 사용자가 도우인 검색 → tikvideo.app 으로 영상 다운로드
 *  3) 여기에 영상 업로드 (여러 개 가능)
 *  4) 제작 시작 → 기존 파이프라인(대본→렌더→유튜브/인스타→텔레그램 알림)
 */

interface StudioIdea {
  productName: string;
  category: string;
  price: string;
  imageUrl: string | null;
  coupangUrl: string;
  douyinKeywords: string[];
  reason: string;
}

type FileState = {
  file: File;
  status: "대기" | "업로드 중" | "완료" | "실패";
  path: string | null;
  error?: string;
};

const MAX_FILES = 6;
const MAX_FILE_MB = 50;

export default function StudioPage() {
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [ideas, setIdeas] = useState<StudioIdea[]>([]);
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [selected, setSelected] = useState<StudioIdea | null>(null);
  const [files, setFiles] = useState<FileState[]>([]);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function fetchIdeas() {
    setLoadingIdeas(true);
    setIdeasError(null);
    try {
      const res = await fetch("/api/admin/studio/suggest", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `오류 (${res.status})`);
      setIdeas(data.ideas);
    } catch (e) {
      setIdeasError((e as Error).message);
    } finally {
      setLoadingIdeas(false);
    }
  }

  async function copyKeyword(kw: string) {
    try {
      await navigator.clipboard.writeText(kw);
      setCopied(kw);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // 클립보드 권한 없으면 무시
    }
  }

  function onPickFiles(list: FileList | null) {
    if (!list) return;
    const next: FileState[] = [];
    for (const file of Array.from(list).slice(0, MAX_FILES)) {
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        next.push({
          file,
          status: "실패",
          path: null,
          error: `${MAX_FILE_MB}MB 초과`,
        });
      } else {
        next.push({ file, status: "대기", path: null });
      }
    }
    setFiles(next);
    setResult(null);
    setCreateError(null);
    // 선택 즉시 업로드 시작
    next.forEach((f, i) => {
      if (f.status === "대기") void uploadOne(f, i, next);
    });
  }

  async function uploadOne(f: FileState, index: number, all: FileState[]) {
    const update = (patch: Partial<FileState>) =>
      setFiles((prev) =>
        prev.map((p, i) => (i === index ? { ...p, ...patch } : p))
      );
    update({ status: "업로드 중" });
    try {
      const res = await fetch("/api/admin/studio/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: f.file.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `오류 (${res.status})`);

      // Vercel 을 거치지 않고 스토리지에 직접 PUT (대용량 가능)
      const put = await fetch(data.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": f.file.type || "video/mp4" },
        body: f.file,
      });
      if (!put.ok) throw new Error(`스토리지 업로드 실패 (${put.status})`);
      update({ status: "완료", path: data.path });
    } catch (e) {
      update({ status: "실패", error: (e as Error).message.slice(0, 120) });
    }
    void all;
  }

  async function startCreate() {
    if (!selected) return;
    const paths = files.filter((f) => f.status === "완료" && f.path).map((f) => f.path as string);
    if (paths.length === 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/admin/studio/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: selected.productName,
          category: selected.category,
          price: selected.price,
          imageUrl: selected.imageUrl,
          coupangUrl: selected.coupangUrl,
          douyinKeywords: selected.douyinKeywords,
          footagePaths: paths,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `오류 (${res.status})`);
      setResult(`${data.displayNumber}번 ${data.message}`);
      setFiles([]);
      setSelected(null);
    } catch (e) {
      setCreateError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const uploadedCount = files.filter((f) => f.status === "완료").length;
  const uploading = files.some((f) => f.status === "업로드 중");

  return (
    <main className="pt-6 flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold">스튜디오</h1>
        <p className="text-sub text-sm mt-1">
          도우인에서 직접 받은 영상으로 우리 영상을 만들어요. 소재 추천 → 도우인
          검색·다운로드 → 업로드 → 제작 시작.
        </p>
      </header>

      {/* 1단계: 소재 추천 */}
      <section className="bg-card rounded-2xl p-5 border border-accent-soft shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-bold text-lg">1. 소재 추천</h2>
          <button
            onClick={fetchIdeas}
            disabled={loadingIdeas}
            className="bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-bold rounded-xl px-4 py-2 text-sm"
          >
            {loadingIdeas ? "추천 뽑는 중..." : "소재 추천 받기"}
          </button>
        </div>
        <p className="text-sub text-xs mt-2">
          중국어 키워드를 복사해서{" "}
          <a
            href="https://www.douyin.com"
            target="_blank"
            rel="noreferrer"
            className="underline text-primary-dark"
          >
            도우인
          </a>
          에 검색하고, 마음에 드는 영상 링크를{" "}
          <a
            href="https://tikvideo.app/ko"
            target="_blank"
            rel="noreferrer"
            className="underline text-primary-dark"
          >
            tikvideo.app
          </a>
          에 붙여넣어 다운로드하세요.
        </p>
        {ideasError && (
          <p className="text-red-600 text-sm mt-3">{ideasError}</p>
        )}
        {ideas.length > 0 && (
          <ul className="mt-4 flex flex-col gap-3">
            {ideas.map((idea) => (
              <li
                key={idea.coupangUrl}
                className={`rounded-xl border p-4 flex gap-4 items-start cursor-pointer transition-colors ${
                  selected?.coupangUrl === idea.coupangUrl
                    ? "border-primary bg-cream"
                    : "border-accent-soft hover:border-accent"
                }`}
                onClick={() => setSelected(idea)}
              >
                {idea.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={idea.imageUrl}
                    alt=""
                    className="w-16 h-16 rounded-lg object-cover shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm leading-snug">
                    {idea.productName}
                  </div>
                  <div className="text-sub text-xs mt-0.5">
                    {idea.category} · {idea.price}
                  </div>
                  <div className="text-xs text-sub mt-1">{idea.reason}</div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {idea.douyinKeywords.map((kw) => (
                      <button
                        key={kw}
                        onClick={(e) => {
                          e.stopPropagation();
                          void copyKeyword(kw);
                        }}
                        className="bg-accent-soft hover:bg-accent rounded-full px-3 py-1 text-sm font-medium"
                        title="클릭하면 복사"
                      >
                        {copied === kw ? "복사됨 ✓" : `${kw} 📋`}
                      </button>
                    ))}
                  </div>
                </div>
                <div
                  className={`text-xs font-bold shrink-0 ${
                    selected?.coupangUrl === idea.coupangUrl
                      ? "text-primary-dark"
                      : "text-sub"
                  }`}
                >
                  {selected?.coupangUrl === idea.coupangUrl ? "선택됨 ✓" : "선택"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 2단계: 영상 업로드 */}
      <section
        className={`bg-card rounded-2xl p-5 border border-accent-soft shadow-sm ${
          selected ? "" : "opacity-50 pointer-events-none"
        }`}
      >
        <h2 className="font-bold text-lg">2. 받은 영상 올리기</h2>
        <p className="text-sub text-xs mt-1">
          {selected
            ? `"${selected.productName.slice(0, 40)}..." 소재 영상을 올려주세요 (여러 개 가능, 개당 ${MAX_FILE_MB}MB 이하).`
            : "먼저 위에서 소재를 선택하세요."}
        </p>
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          multiple
          onChange={(e) => onPickFiles(e.target.files)}
          className="mt-3 block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-primary file:text-white file:font-bold file:px-4 file:py-2"
        />
        {files.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="truncate flex-1">{f.file.name}</span>
                <span
                  className={
                    f.status === "완료"
                      ? "text-green-700 font-semibold"
                      : f.status === "실패"
                        ? "text-red-600 font-semibold"
                        : "text-sub"
                  }
                >
                  {f.status}
                  {f.error ? ` (${f.error})` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3단계: 제작 시작 */}
      <section className="bg-card rounded-2xl p-5 border border-accent-soft shadow-sm">
        <h2 className="font-bold text-lg">3. 영상 제작 시작</h2>
        <p className="text-sub text-xs mt-1">
          올린 영상을 배경으로 자막·나레이션을 입혀 렌더하고, 유튜브·인스타에
          자동 업로드해요. 완료되면 텔레그램으로 알려드려요.
        </p>
        <button
          onClick={startCreate}
          disabled={!selected || uploadedCount === 0 || uploading || creating}
          className="mt-3 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-bold rounded-xl px-5 py-3"
        >
          {creating
            ? "제작 시작 중..."
            : uploading
              ? "업로드 끝나면 시작할 수 있어요"
              : `영상 ${uploadedCount}개로 제작 시작`}
        </button>
        {createError && (
          <p className="text-red-600 text-sm mt-3">{createError}</p>
        )}
        {result && (
          <p className="text-green-700 font-semibold text-sm mt-3">{result}</p>
        )}
      </section>
    </main>
  );
}
