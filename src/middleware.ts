// GOMBUONE — Middleware de proteção administrativa
//
// Este middleware (Edge Runtime) faz a PRIMEIRA barreira:
//  - /admin/* sem sessão válida (formato/expiração) → redirect /admin/login
//  - /api/admin/* sem sessão → HTTP 401
//  - /admin/login com sessão → redirect /admin
//
// A verificação criptográfica completa (HMAC) é feita em runtime Node
// nas páginas de servidor e rotas de API (ver src/lib/auth.ts).
// Esta divisão evita depender de segredos no Edge Runtime.

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, isValidSessionFormat } from "@/lib/auth";

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // A rota de login da API está sempre acessível (é ela que emite a sessão)
  if (pathname === "/api/admin/login") {
    return NextResponse.next();
  }

  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const looksAuthed = isValidSessionFormat(token);

  // APIs administrativas → 401 JSON (sem redirect)
  if (pathname.startsWith("/api/admin")) {
    if (!looksAuthed) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // Páginas /admin/*
  if (pathname === "/admin/login") {
    if (looksAuthed) {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
    return NextResponse.next();
  }

  if (!looksAuthed) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  return NextResponse.next();
}
