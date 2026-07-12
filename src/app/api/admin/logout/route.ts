import { NextRequest, NextResponse } from "next/server";
import { adminCookieName } from "@/lib/adminAuth";

export async function POST(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/admin", request.url), 303);
  res.cookies.delete(adminCookieName());
  return res;
}
