import { NextRequest, NextResponse } from "next/server";
import {
  adminCookieName,
  adminCookieValue,
  verifyAdminSecret,
} from "@/lib/adminAuth";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const secret = String(form.get("secret") ?? "");

  if (!verifyAdminSecret(secret)) {
    return NextResponse.redirect(new URL("/admin?error=1", request.url), 303);
  }

  const res = NextResponse.redirect(new URL("/admin", request.url), 303);
  res.cookies.set(adminCookieName(), adminCookieValue() ?? "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30일
  });
  return res;
}
