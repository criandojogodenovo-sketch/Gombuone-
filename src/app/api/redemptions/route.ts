// GOMBUONE — Fase 2 — POST /api/redemptions
//
// Fluxo do consumidor: pede o código de resgate ANG-XXXX de uma oferta.
//
// COMPORTAMENTO:
// 1. Valida o corpo (Zod): { opportunitySlug, consumerName, consumerWhatsapp }.
// 2. A oportunidade tem de estar pública (ACTIVE + validade futura) — 404.
// 3. A ATRIBUIÇÃO é derivada SEMPRE do cookie HttpOnly `gombu_attr`
//    (mapa { opportunityId: attributionId }) e REVALIDADA na base de dados:
//    o attributionId tem de existir E pertencer à mesma oportunidade.
//    Cookie ausente/forjado/obsoleto → resgate direto (attributionId null,
//    sem crédito a distribuidor). O cliente NUNCA envia attributionId.
// 4. Um número de WhatsApp só pode ter UM código pendente (status REDEEMED)
//    por oportunidade → 409 com mensagem genérica (sem revelar o código).
// 5. Gera código criptográfico ANG-XXXX (charset sem ambiguidades) com
//    constraint UNIQUE — colisões repetem a geração.
// 6. Emite cookie anónimo `gombu_consumer` (UUID) guardado em consumerDevice
//    (base para métricas/anti-fraude de fases posteriores).
//
// O ATACANTE NÃO PODE (regras testáveis — ver testes 24–33 e 34–45):
// - escolher nem prever o código (gerado no servidor com aleatoriedade
//   criptográfica — nunca aceito do cliente);
// - resgatar em nome da atribuição de outrem: o crédito só sai do cookie
//   HttpOnly validado no servidor (portador do cookie = portador do crédito,
//   modelo documentado para a anti-fraude da Fase 3);
// - usar a resposta 409 para descobrir o código já emitido (mensagem genérica);
// - listar resgates de outros consumidores (não existe endpoint de listagem —
//   GET devolve 405);
// - inundar a rota além do limite de taxa (429);
// - guardar payloads XSS no nome (charset restrito a letras/espaços).

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import type { RedemptionStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { redemptionSchema } from "@/lib/validators";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { generateAngCode } from "@/lib/codes";
import {
  ATTR_COOKIE_NAME,
  CONSUMER_COOKIE_MAX_AGE,
  CONSUMER_COOKIE_NAME,
  consumerCookieOptions,
  parseAttrMap,
} from "@/lib/attribution";

export const runtime = "nodejs";

// Limite de taxa: 20 resgates por hora por IP
const RED_MAX = 20;
const RED_WINDOW_MS = 60 * 60 * 1000;

// Tentativas de geração em caso de colisão do código único
const CODE_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  // 1) Limite de taxa
  const ip = getClientIp(req);
  const rl = rateLimit(`red:${ip}`, RED_MAX, RED_WINDOW_MS);
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
  const parsed = redemptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 }
    );
  }
  const { opportunitySlug, consumerName, consumerWhatsapp } = parsed.data;

  // 4) Oportunidade pública (ACTIVE + validade futura)
  const opportunity = await db.opportunity.findFirst({
    where: {
      slug: opportunitySlug,
      status: "ACTIVE",
      validUntil: { gt: new Date() },
    },
    select: { id: true, validUntil: true },
  });
  if (!opportunity) {
    return NextResponse.json(
      { error: "Oportunidade não disponível" },
      { status: 404 }
    );
  }

  // 5) Atribuição: SEMPRE derivada do cookie HttpOnly e revalidada na BD.
  //    Nunca confiar no valor do cookie — forjado/obsoleto → resgate direto.
  let attributionId: string | null = null;
  const map = parseAttrMap(req.cookies.get(ATTR_COOKIE_NAME)?.value);
  const cookieAttrId = map[opportunity.id];
  if (cookieAttrId) {
    const attr = await db.attribution.findUnique({
      where: { id: cookieAttrId },
      select: { id: true, opportunityId: true },
    });
    if (attr && attr.opportunityId === opportunity.id) {
      attributionId = attr.id;
    }
  }

  // 6) Um único código pendente por (consumidor, oportunidade) → 409 genérico.
  //    A mensagem NÃO revela o código existente (anti-enumeração).
  const existing = await db.redemption.findFirst({
    where: {
      consumerWhatsapp,
      opportunityId: opportunity.id,
      status: "REDEEMED",
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      {
        error:
          "Já existe um código ativo para este número nesta oferta. Utilize o código já recebido.",
      },
      { status: 409 }
    );
  }

  // 7) Cookie anónimo do consumidor (para métricas de fases posteriores)
  const consumerCookie =
    req.cookies.get(CONSUMER_COOKIE_NAME)?.value ?? randomUUID();
  const consumerDevice = consumerCookie.slice(0, 64);

  // 8) Criação com geração de código único (repete em colisão rara)
  let redemption: { code: string; status: RedemptionStatus } | null = null;
  for (let attempt = 0; attempt < CODE_ATTEMPTS && !redemption; attempt++) {
    try {
      redemption = await db.redemption.create({
        data: {
          code: generateAngCode(),
          opportunityId: opportunity.id,
          attributionId,
          consumerName,
          consumerWhatsapp,
          consumerDevice,
          status: "REDEEMED", // emitido — aguarda validação do comerciante (Fase 3)
        },
        select: { code: true, status: true },
      });
    } catch (e) {
      const err = e as { code?: string };
      if (err.code !== "P2002") {
        // Erro inesperado (P2002 = colisão de código → tenta novamente)
        console.error("[redemptions] Erro ao criar:", e);
        return NextResponse.json(
          { error: "Erro interno ao processar o resgate" },
          { status: 500 }
        );
      }
    }
  }
  if (!redemption) {
    return NextResponse.json(
      { error: "Não foi possível gerar um código único. Tente novamente." },
      { status: 500 }
    );
  }

  // 9) Resposta + cookie do consumidor
  const res = NextResponse.json(
    {
      redemption: {
        code: redemption.code,
        status: redemption.status,
        validUntil: opportunity.validUntil.toISOString(),
      },
    },
    { status: 201 }
  );
  res.cookies.set({
    name: CONSUMER_COOKIE_NAME,
    value: consumerDevice,
    ...consumerCookieOptions(CONSUMER_COOKIE_MAX_AGE),
  });
  return res;
}
