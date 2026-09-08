// GOMBUONE — POST /api/admin/login
// Autentica com a senha master (ADMIN_MASTER_PASSWORD) e emite o cookie de sessão.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_COOKIE_NAME,
  adminCookieOptions,
  createSessionToken,
  verifyAdminPassword,
} from "@/lib/auth";
import { loginSchema } from "@/lib/validators";

export const runtime = "nodejs";

// Rate limit simples em memória (melhor esforço — por instância de servidor).
// Para protótipo da Fase 1 é suficiente; na Fase 2 migrar para store partilhado.
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

function registerAttempt(ip: string): boolean {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || rec.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > MAX_ATTEMPTS;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  if (registerAttempt(ip)) {
    return NextResponse.json(
      { error: "Demasiadas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Corpo do pedido inválido (JSON esperado)" },
      { status: 400 }
    );
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 }
    );
  }

  const ok = await verifyAdminPassword(parsed.data.password);
  if (!ok) {
    return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
  }

  const { token, maxAge } = await createSessionToken();

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: token,
    ...adminCookieOptions(maxAge),
  });
  return res;
}
