"use client";

import { useEffect, useState } from "react";

/**
 * 스튜디오 - 직접 소재로 영상 만들기.
 *
 * 흐름:
 *  1) 소재 목록: 추천 받거나 직접 검색해서 추가. 영상으로 만들 때까지 계속 남는다.
 *     ("그만 보기"로 숨기면 다시 추천되지 않음)
 *  2) 사용자가 도우인 검색 → tikvideo.app 으로 영상 다운로드
 *  3) 여기에 영상 업로드 (여러 개 가능)
 *  4) 제작 시작 → 기존 파이프라인(대본→렌더→유튜브/인스타→텔레그램 알림)
 */

interface StudioIdea {
  id?: string;
  productId: number | null;
  productName: string;
  category: string;
  price: string;
  imageUrl: string | null;
  coupangUrl: string;
  douyinKeywords: string[];
  reason: string;
}

interface SearchResult {
  productId: number;
  productName: string;
  price: string;
  imageUrl: string | null;
  coupangUrl: string;
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
  const [ideas, setIdeas] = useState<StudioIdea[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [selected, setSelected] = useState<StudioIdea | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // 직접 찾기
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<number | null>(null);

  // 업로드/제작
  const [files, setFiles] = useState<FileState[]>([]);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // 페이지 진입 시 저장된 소재 목록 로드
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/studio/ideas");
        const data = await res.json();
        if (res.ok) setIdeas(data.ideas);
      } catch {
        // 목록 로드 실패는 조용히 (추천 버튼으로 재시도 가능)
      }
    })();
  }, []);

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

  async function hideIdea(idea: StudioIdea) {
    if (!idea.id) return;
    setIdeas((prev) => prev.filter((i) => i.id !== idea.id));
    if (selected?.id === idea.id) setSelected(null);
    try {
      await fetch("/api/admin/studio/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "hide", id: idea.id }),
      });
    } catch {
      // 실패해도 다음 로드에서 되살아나는 정도 - 치명적이지 않음
    }
  }

  async function runSearch() {
    if (!searchKeyword.trim()) return;
    setSearching(true);
    setSearchError(null);
    setSearchResults([]);
    try {
      const res = await fetch("/api/admin/studio/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: searchKeyword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `오류 (${res.status})`);
      setSearchResults(data.results);
      if (data.results.length === 0) setSearchError("검색 결과가 없어요.");
    } catch (e) {
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function addFromSearch(r: SearchResult) {
    setAddingId(r.productId);
    setSearchError(null);
    try {
      const res = await fetch("/api/admin/studio/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ add: r }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `오류 (${res.status})`);
      setIdeas((prev) => [
        data.idea,
        ...prev.filter((i) => i.id !== data.idea.id),
      ]);
      setSelected(data.idea);
      setSearchResults((prev) => prev.filter((x) => x.productId !== r.productId));
    } catch (e) {
      setSearchError((e as Error).message);
    } finally {
      setAddingId(null);
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

  /** 도우인 앱 바로 열기 (안드로이드: 인텐트 / iOS: 앱 스킴, 실패 시 웹 폴백) */
  function openDouyinApp() {
    if (/android/i.test(navigator.userAgent)) {
      window.location.href =
        "intent://#Intent;scheme=snssdk1128;package=com.ss.android.ugc.aweme;" +
        "S.browser_fallback_url=https%3A%2F%2Fwww.douyin.com;end";
    } else {
      window.location.href = "snssdk1128://";
      setTimeout(() => window.open("https://www.douyin.com", "_blank"), 1500);
    }
  }

  /** tikvideo.app 을 크롬으로 바로 열기 (크롬 없으면 기본 브라우저 폴백) */
  function openTikvideoChrome() {
    if (/android/i.test(navigator.userAgent)) {
      window.location.href =
        "intent://tikvideo.app/ko#Intent;scheme=https;package=com.android.chrome;" +
        "S.browser_fallback_url=https%3A%2F%2Ftikvideo.app%2Fko;end";
    } else {
      window.location.href = "googlechromes://tikvideo.app/ko";
      setTimeout(() => window.open("https://tikvideo.app/ko", "_blank"), 1500);
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
    next.forEach((f, i) => {
      if (f.status === "대기") void uploadOne(f, i);
    });
  }

  async function uploadOne(f: FileState, index: number) {
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
  }

  async function startCreate() {
    if (!selected) return;
    const paths = files
      .filter((f) => f.status === "완료" && f.path)
      .map((f) => f.path as string);
    if (paths.length === 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/admin/studio/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ideaId: selected.id,
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
      setIdeas((prev) => prev.filter((i) => i.id !== selected.id));
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
          도우인에서 직접 받은 영상으로 우리 영상을 만들어요. 소재는 영상으로
          만들 때까지 목록에 계속 남아요.
        </p>
      </header>

      {/* 1단계: 소재 목록 */}
      <section className="bg-card rounded-2xl p-5 border border-accent-soft shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-bold text-lg">1. 소재 고르기</h2>
          <button
            onClick={fetchIdeas}
            disabled={loadingIdeas}
            className="bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-bold rounded-xl px-4 py-2 text-sm"
          >
            {loadingIdeas ? "추천 뽑는 중..." : "+ 소재 추천 받기"}
          </button>
        </div>
        <p className="text-sub text-xs mt-2">
          중국어 키워드를 복사해서 도우인에 검색하고, 영상 링크를
          tikvideo.app 에 붙여넣어 다운로드하세요.
        </p>
        <div className="flex gap-2 mt-3">
          <button
            onClick={openDouyinApp}
            className="flex-1 bg-ink text-white font-bold rounded-xl py-2.5 text-sm"
          >
            🎵 도우인 앱 열기
          </button>
          <button
            onClick={openTikvideoChrome}
            className="flex-1 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl py-2.5 text-sm"
          >
            ⬇️ tikvideo (크롬)
          </button>
        </div>

        {/* 직접 찾기 */}
        <div className="mt-4 rounded-xl border border-accent-soft bg-cream p-3">
          <div className="flex gap-2">
            <input
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="직접 찾기 - 쿠팡 검색어 (예: 갤럭시 S25 울트라)"
              className="flex-1 rounded-lg border border-accent px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={runSearch}
              disabled={searching || !searchKeyword.trim()}
              className="bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-bold rounded-lg px-4 text-sm"
            >
              {searching ? "검색 중..." : "검색"}
            </button>
          </div>
          {searchError && (
            <p className="text-red-600 text-xs mt-2">{searchError}</p>
          )}
          {searchResults.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {searchResults.map((r) => (
                <li
                  key={r.productId}
                  className="flex items-center gap-3 rounded-lg bg-white border border-accent-soft p-2"
                >
                  {r.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.imageUrl}
                      alt=""
                      className="w-10 h-10 rounded object-cover shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium leading-snug line-clamp-2">
                      {r.productName}
                    </div>
                    <div className="text-sub text-xs">{r.price}</div>
                  </div>
                  <button
                    onClick={() => addFromSearch(r)}
                    disabled={addingId === r.productId}
                    className="shrink-0 text-xs font-bold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 rounded-lg px-3 py-2"
                  >
                    {addingId === r.productId ? "추가 중..." : "소재로 추가"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {ideasError && <p className="text-red-600 text-sm mt-3">{ideasError}</p>}

        {ideas.length === 0 && !loadingIdeas && (
          <p className="text-sub text-sm mt-4 text-center">
            아직 소재가 없어요. &quot;소재 추천 받기&quot;를 누르거나 직접
            검색해서 추가해보세요.
          </p>
        )}

        {ideas.length > 0 && (
          <ul className="mt-4 flex flex-col gap-3">
            {ideas.map((idea) => (
              <li
                key={idea.id ?? idea.coupangUrl}
                className={`rounded-xl border p-4 flex gap-4 items-start cursor-pointer transition-colors ${
                  selected?.id === idea.id
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
                  {idea.reason && (
                    <div className="text-xs text-sub mt-1">{idea.reason}</div>
                  )}
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
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div
                    className={`text-xs font-bold ${
                      selected?.id === idea.id ? "text-primary-dark" : "text-sub"
                    }`}
                  >
                    {selected?.id === idea.id ? "선택됨 ✓" : "선택"}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void hideIdea(idea);
                    }}
                    className="text-xs text-sub hover:text-red-600"
                    title="이 상품은 다시 추천되지 않아요"
                  >
                    ✕ 그만 보기
                  </button>
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
