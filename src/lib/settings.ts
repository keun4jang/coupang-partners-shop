import { supabaseAdmin } from "./supabase";

/**
 * app_settings 키-값 저장소 (Supabase).
 * 인스타 액세스 토큰처럼 "코드 배포 없이 갱신돼야 하는 값"을 보관한다.
 * 테이블이 아직 없으면(스키마 미적용) 조용히 null 을 돌려주고 경고만 남긴다
 * → 호출부는 환경변수 폴백으로 동작을 계속한다.
 */
export async function getSetting(key: string): Promise<string | null> {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) {
      console.warn(`설정 조회 실패(${key}): ${error.message}`);
      return null;
    }
    return (data?.value as string | undefined) ?? null;
  } catch (e) {
    console.warn(`설정 조회 실패(${key}): ${(e as Error).message}`);
    return null;
  }
}

/**
 * 여러 키를 한 번의 쿼리로 조회 + 일시 오류 재시도.
 *
 * 왜: GitHub Actions 러너 부팅 직후 Supabase 조회가 "JWT issued at future"
 * (시계 오차) 같은 일시 오류로 실패한 사례가 있다. 자격증명 로드처럼
 * "전부 있어야만 의미 있는" 조회는 키 하나만 실패해도 통째로 무효가 되므로,
 * 일괄 조회 + 백오프 재시도(2s/4s)로 견고하게 한다.
 */
export async function getSettings(
  keys: string[]
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const k of keys) out[k] = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const db = supabaseAdmin();
      const { data, error } = await db
        .from("app_settings")
        .select("key,value")
        .in("key", keys);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        out[row.key as string] = (row.value as string | undefined) ?? null;
      }
      return out;
    } catch (e) {
      console.warn(
        `설정 일괄 조회 실패(시도 ${attempt}/3): ${(e as Error).message}`
      );
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  return out;
}

export async function setSetting(key: string, value: string): Promise<boolean> {
  try {
    const db = supabaseAdmin();
    const { error } = await db
      .from("app_settings")
      .upsert({ key, value }, { onConflict: "key" });
    if (error) {
      console.warn(`설정 저장 실패(${key}): ${error.message}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`설정 저장 실패(${key}): ${(e as Error).message}`);
    return false;
  }
}
