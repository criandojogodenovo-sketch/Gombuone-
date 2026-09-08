// GOMBUONE — /api/admin/opportunities
//
// POST: cria uma oportunidade (validação Zod + verificações no banco).
// GET : lista as últimas oportunidades (uso do painel administrativo).
//
// SEGURANÇA:
// - Requer sessão administrativa (cookie assinado HMAC) — verificado aqui
//   e também no middleware (dupla verificação).
// - imageUrl: apenas URLs do Vercel Blob (https://...blob.vercel-storage.com).
//   URLs arbitrárias do cliente são rejeitadas (HTTP 400).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { createOpportunitySchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authed = await verifySessionToken(
    req.cookies.get(ADMIN_COOKIE_NAME)?.value
  );
  if (!authed) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const opportunities = await db.opportunity.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      company: { select: { name: true, slug: true } },
    },
  });

  return NextResponse.json({ opportunities });
}

export async function POST(req: NextRequest) {
  // 1) Autenticação (verificação completa, independente do middleware)
  const authed = await verifySessionToken(
    req.cookies.get(ADMIN_COOKIE_NAME)?.value
  );
  if (!authed) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // 2) Corpo JSON
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Corpo do pedido inválido (JSON esperado)" },
      { status: 400 }
    );
  }

  // 3) Validação Zod
  const parsed = createOpportunitySchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return NextResponse.json(
      { error: issues[0]?.message ?? "Dados inválidos", issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // 4) A empresa tem de existir no banco
  const company = await db.company.findUnique({
    where: { id: data.companyId },
    select: { id: true, name: true },
  });
  if (!company) {
    return NextResponse.json(
      { error: "Empresa não encontrada" },
      { status: 400 }
    );
  }

  // 5) Criação (slug duplicado → P2002 → HTTP 400)
  try {
    const opportunity = await db.opportunity.create({
      data: {
        companyId: data.companyId,
        title: data.title,
        slug: data.slug,
        description: data.description,
        imageUrl: data.imageUrl, // já validada: apenas Vercel Blob
        location: data.location ?? null,
        status: data.status,
        validUntil: data.validUntil,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        imageUrl: true,
        validUntil: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ opportunity }, { status: 201 });
  } catch (e) {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === "P2002" && err.meta?.target?.includes("slug")) {
      return NextResponse.json(
        { error: "Slug já existente — escolha outra slug" },
        { status: 400 }
      );
    }
    console.error("[opportunities] Erro ao criar:", e);
    return NextResponse.json(
      { error: "Erro interno ao criar a oportunidade" },
      { status: 500 }
    );
  }
}
