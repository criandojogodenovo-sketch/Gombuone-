// GOMBUONE — Fase 2 — POST /api/attributions
//
// Registra a atribuição de um clique num link de distribuidor
// (/oportunidades/<slug>?ref=<refCode>) e emite o cookie de atribuição.
//
// COMPORTAMENTO:
// 1. Valida o corpo (Zod): { opportunitySlug, ref }.
// 2. A oportunidade tem de existir, estar ACTIVE e não expirada (validUntil).
//    Rascunhos, expiradas e inexistentes devolvem a MESMA resposta 404
//    (não há enumeração de oportunidades não publicadas).
// 3. O `ref` tem de corresponder a um utilizador DISTRIBUTOR existente
//    (comparação case-insensitive; formato rígido antes da consulta).
//    Ref inexistente e ref malformado devolvem a MESMA resposta 400
//    (não há enumeração de códigos de distribuidor).
// 4. Desduplicação: mesmo (oportunidade, distribuidor, IP) dentro de 7 dias
//    reutiliza o registo existente (não há spam de linhas).
// 5. Cookie `gombu_attr` = mapa JSON { opportunityId: attributionId }
//    (HttpOnly, SameSite=Lax, 30 dias) — o mapa preserva atribuições de
//    MÚLTIPLAS oportunidades sem sobreposição.
//
// O ATACANTE NÃO PODE (regras testáveis — ver testes 13–23 e 34–45):
// - criar atribuições para oportunidades inexistentes/rascunho/expiradas;
// - descobrir códigos de referência válidos pelas respostas (400 uniforme);
// - ler ou modificar o cookie via JavaScript (HttpOnly — servidor valida
//   sempre o attributionId contra a base de dados no resgate);
// - inundar a rota além do limite de taxa (429);
// - injetar SQL (Prisma parametriza todas as consultas).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { attributionSchema } from "@/lib/validators";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import {
  ATTR_COOKIE_MAX_AGE_SECONDS,
  ATTR_DEDUPE_WINDOW_MS,
  ATTR_COOKIE_NAME,
  attrCookieOptions,
  parseAttrMap,
  serializeAttrMap,
} from "@/lib/attribution";

export const runtime = "nodejs";

// Limite de taxa: 60 cliques por 10 minutos por IP
const ATTR_MAX = 60;
const ATTR_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  // 1) Limite de taxa (barato — rejeita antes de tocar a base de dados)
  const ip = getClientIp(req);
  const rl = rateLimit(`attr:${ip}`, ATTR_MAX, ATTR_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiados pedidos. Aguarde alguns minutos e tente novamente." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
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
  const parsed = attributionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 }
    );
  }
  const { opportunitySlug, ref } = parsed.data;

  // 4) Oportunidade: pública = ACTIVE + validade futura.
  //    Resposta uniforme (404) para inexistente/rascunho/expirada.
  const opportunity = await db.opportunity.findFirst({
    where: {
      slug: opportunitySlug,
      status: "ACTIVE",
      validUntil: { gt: new Date() },
    },
    select: { id: true },
  });
  if (!opportunity) {
    return NextResponse.json(
      { error: "Oportunidade não disponível" },
      { status: 404 }
    );
  }

  // 5) Distribuidor: ref válido = utilizador DISTRIBUTOR existente.
  //    Mesma resposta (400) para formato inválido e código inexistente.
  const distributor = await db.user.findFirst({
    where: {
      refCode: { equals: ref, mode: "insensitive" },
      role: "DISTRIBUTOR",
    },
    select: { id: true },
  });
  if (!distributor) {
    return NextResponse.json({ error: "Referência inválida" }, { status: 400 });
  }

  // 6) Desduplicação (mesmo IP + mesmo distribuidor + mesma oportunidade
  //    dentro da janela de 7 dias → reutiliza o registo)
  const dedupeSince = new Date(Date.now() - ATTR_DEDUPE_WINDOW_MS);
  let attribution = await db.attribution.findFirst({
    where: {
      opportunityId: opportunity.id,
      distributorId: distributor.id,
      ip,
      createdAt: { gte: dedupeSince },
    },
    select: { id: true },
  });

  if (!attribution) {
    attribution = await db.attribution.create({
      data: {
        opportunityId: opportunity.id,
        distributorId: distributor.id,
        source: "whatsapp", // canal primário de partilha dos distribuidores
        ip: ip.slice(0, 64),
        userAgent: req.headers.get("user-agent")?.slice(0, 255) ?? null,
      },
      select: { id: true },
    });
  }

  // 7) Atualiza o cookie-mapa (preserva entradas de outras oportunidades)
  const map = parseAttrMap(req.cookies.get(ATTR_COOKIE_NAME)?.value);
  map[opportunity.id] = attribution.id;

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ATTR_COOKIE_NAME,
    value: serializeAttrMap(map),
    ...attrCookieOptions(ATTR_COOKIE_MAX_AGE_SECONDS),
  });
  return res;
}
