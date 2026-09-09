// GOMBUONE — Fase 2 (CORRIGIDA) — POST /api/attributions
//
// Registra a atribuição de um clique num link de distribuidor
// (/oportunidades/<slug>?ref=<refCode>) e emite o cookie de atribuição.
//
// POLÍTICA FINAL (fonte de verdade — comando mestre Fase 2):
// O COOKIE é o ÚNICO mecanismo de desduplicação de Attribution na V1.
// O IP NUNCA decide se uma Attribution já existe — é capturado apenas para
// rate limiting, auditoria e investigação de abuso.
//
// ORDEM DA LÓGICA (obrigatória):
//  1. Validar oportunidade (pública: ACTIVE + validUntil futura) → 404 uniforme
//  2. Validar distribuidor (role DISTRIBUTOR) → 400 uniforme
//  3. Ler cookie gombu_attr (mapa { opportunityId: attributionId })
//  4. Procurar o attributionId correspondente a ESTA oportunidade
//  5. Revalidar no banco: existe + oportunidade corresponde + distribuidor
//     corresponde (validação tripla — um cookie adulterado nunca gera
//     crédito para outro distribuidor)
//  6. Válida → REUTILIZAR | inválida/inexistente → CRIAR nova
//  7. Atualizar gombu_attr preservando as outras oportunidades
//  8. Retornar resultado
//
// CASOS COBERTOS (spec §4):
//  A) mesmo cookie + mesma oportunidade          → reutiliza (nunca duplica)
//  B) novo cookie + mesmo IP + mesma oportunidade → CRIA nova (IP irrelevante)
//  C) cookies diferentes + IPs diferentes         → CRIA nova
//  D) cookie ausente/inválido                     → CRIA nova (IP nunca é fallback)
//  E) cookie aponta para Attribution inexistente  → CRIA nova (não quebra)
//  F) cookie aponta para Attribution de outra oportunidade → ignora, CRIA nova
//  G) cookie aponta para Attribution de outro distribuidor → NÃO reutiliza,
//     CRIA nova válida (anti-manipulação de crédito)
//
// O ATACANTE NÃO PODE:
// - criar atribuições para oportunidades inexistentes/rascunho/expiradas (404);
// - descobrir códigos de referência válidos pelas respostas (400 uniforme);
// - ler/modificar o cookie via JavaScript (HttpOnly);
// - obter crédito para outro distribuidor com cookie forjado (validação
//   tripla no banco: id + oportunidade + distribuidor);
// - inundar a rota além do limite de taxa (429);
// - injetar SQL (Prisma parametriza todas as consultas).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { attributionSchema } from "@/lib/validators";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import {
  ATTR_COOKIE_MAX_AGE_SECONDS,
  ATTR_COOKIE_NAME,
  attrCookieOptions,
  parseAttrMap,
  serializeAttrMap,
} from "@/lib/attribution";

export const runtime = "nodejs";

// Limite de taxa: 60 cliques por 10 minutos por IP.
// O IP LIMITA abuso — NUNCA decide identidade/desduplicação.
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

  // 6) DESDUPLICAÇÃO — EXCLUSIVAMENTE POR COOKIE (nunca por IP).
  //    Lê o mapa e procura a entrada desta oportunidade.
  const map = parseAttrMap(req.cookies.get(ATTR_COOKIE_NAME)?.value);
  const cookieAttrId = map[opportunity.id];

  // 7) Revalidação tripla no banco (não confiar cegamente no cliente):
  //    a Attribution referenciada tem de existir E pertencer simultaneamente
  //    a esta oportunidade E a este distribuidor.
  let attribution: { id: string } | null = null;
  if (cookieAttrId) {
    attribution = await db.attribution.findFirst({
      where: {
        id: cookieAttrId,
        opportunityId: opportunity.id,
        distributorId: distributor.id,
      },
      select: { id: true },
    });
  }

  // 8) Inválida/inexistente/ausente → cria nova Attribution.
  //    (Casos B, C, D, E, F, G — o IP não entra na decisão.)
  if (!attribution) {
    attribution = await db.attribution.create({
      data: {
        opportunityId: opportunity.id,
        distributorId: distributor.id,
        source: "whatsapp", // canal primário de partilha dos distribuidores
        // IP/UA: APENAS auditoria e rate limiting — nunca identidade.
        ip: ip.slice(0, 64),
        userAgent: req.headers.get("user-agent")?.slice(0, 255) ?? null,
      },
      select: { id: true },
    });
  }

  // 9) Atualiza o cookie-mapa (preserva entradas de outras oportunidades).
  map[opportunity.id] = attribution.id;

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ATTR_COOKIE_NAME,
    value: serializeAttrMap(map),
    ...attrCookieOptions(ATTR_COOKIE_MAX_AGE_SECONDS),
  });
  return res;
}
