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
