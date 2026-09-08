// GOMBUONE — POST /api/admin/logout
// Limpa o cookie de sessão administrativa.

import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, adminCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: "",
    ...adminCookieOptions(0),
  });
  return res;
}
