import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

let adminClient: SupabaseClient | null = null;

/**
 * 서버 전용 Supabase 클라이언트 (service role).
 * RLS 를 우회하므로 절대 클라이언트 컴포넌트에서 import 하지 않는다.
 */
export function supabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } }
    );
  }
  return adminClient;
}
