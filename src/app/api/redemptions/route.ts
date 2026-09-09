// GOMBUONE — Fase 2 (CORRIGIDA) — POST /api/redemptions
//
// Fluxo do consumidor: pede o código de resgate ANG-XXXX de uma oferta.
//
// POLÍTICA FINAL (fonte de verdade — comando mestre Fase 2):
// 1. consumerName e consumerWhatsapp são OPCIONAIS (resgate sem nome e
//    sem WhatsApp é permitido).
// 2. O WhatsApp NUNCA é mecanismo de deduplicação/identidade.
// 3. A identidade do consumidor é o cookie anónimo gombu_consumer (UUID v4
//    gerado SEMPRE pelo servidor; nunca aceite do corpo JSON).
// 4. Deduplicação/idempotência = (consumerDevice, opportunityId):
//    - 1ª requisição → HTTP 201 + código ANG-XXXX
//    - repetição (mesmo cookie + mesma oportunidade) → HTTP 200 com o MESMO
//      código/status (nunca 409, nunca segundo código)
// 5. Concorrência: duas requisições simultâneas para o mesmo par
//    (consumerDevice, opportunityId) nunca geram dois códigos — o insert é
//    serializado por pg_advisory_xact_lock dentro de uma transação, com
//    re-checagem (e hardening opcional por índice único parcial — ver
//    scripts/db-hardening.mjs).
// 6. A Attribution é derivada SEMPRE do cookie HttpOnly gombu_attr e
//    revalidada no banco (existe + mesma oportunidade). Inválida →
//    attributionId = null e o resgate CONTINUA (nunca é bloqueado por
//    cookie de atribuição inválido). O cliente NUNCA envia attributionId.
// 7. Rate limiting por IP (20/h) — o IP limita abuso, nunca decide
//    identidade.
//
// O ATACANTE NÃO PODE:
// - escolher nem prever o código (crypto.randomInt no servidor; UNIQUE na BD
//   com retry em colisão P2002);
// - escolher a própria identidade (consumerDevice só vem do cookie HttpOnly
//   validado como UUID v4; lixo → nova identidade gerada no servidor);
// - injetar campos server-side via corpo (Zod descarta chaves desconhecidas:
//   code, status, attributionId, consumerDevice, id são ignorados);
// - resgatar em nome da atribuição de outrem (o crédito só sai do cookie
//   HttpOnly revalidado no servidor);
// - listar resgates (GET → 405; não existe endpoint de listagem pública);
// - inundar a rota (429);
// - guardar payloads XSS no nome (charset restrito quando fornecido).

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
  isValidConsumerId,
  parseAttrMap,
} from "@/lib/attribution";

export const runtime = "nodejs";

// Limite de taxa: 20 resgates por hora por IP.
// O IP LIMITA abuso — NUNCA decide identidade/deduplicação.
const RED_MAX = 20;
const RED_WINDOW_MS = 60 * 60 * 1000;

// Tentativas de geração em caso de colisão do código único (P2002 em code)
const CODE_ATTEMPTS = 5;

/** Dados relevantes devolvidos ao consumidor (1ª vez e repetições). */
type RedemptionPublic = {
  code: string;
  status: RedemptionStatus;
};

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

  // 3) Validação Zod — consumerName/consumerWhatsapp OPCIONAIS;
  //    chaves desconhecidas (code, status, consumerDevice, attributionId…)
  //    são descartadas silenciosamente (anti mass-assignment).
  const parsed = redemptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 }
    );
  }
  const { opportunitySlug, consumerName, consumerWhatsapp } = parsed.data;

  // 4) Oportunidade pública (ACTIVE + validade futura) — 404 uniforme
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
  //    Nunca confiar no valor do cookie — forjado/obsoleto/outro-oportunidade
  //    → resgate direto (attributionId null, sem crédito). O resgate NUNCA é
  //    bloqueado por cookie de atribuição inválido (spec §15).
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

  // 6) Identidade anónima do consumidor — SEMPRE estabelecida pelo servidor:
  //    o cookie só é aceite se for um UUID v4 válido; caso contrário (ausente,
  //    incógnito, apagado, lixo forjado) o servidor gera uma NOVA identidade.
  //    O corpo JSON nunca fornece consumerDevice (Zod descarta).
  const rawConsumerCookie = req.cookies.get(CONSUMER_COOKIE_NAME)?.value;
  const consumerDevice = isValidConsumerId(rawConsumerCookie)
    ? (rawConsumerCookie as string)
    : randomUUID();

  // 7) IDEMPOTÊNCIA (consumerDevice + opportunityId):
  //    repetição → HTTP 200 com o MESMO código (nunca 409, nunca 2º código).
  const existing = await db.redemption.findFirst({
    where: { consumerDevice, opportunityId: opportunity.id },
    select: { code: true, status: true },
  });
  if (existing) {
    const res = NextResponse.json(
      {
        redemption: {
          code: existing.code,
          status: existing.status,
          validUntil: opportunity.validUntil.toISOString(),
        },
      },
      { status: 200 }
    );
    res.cookies.set({
      name: CONSUMER_COOKIE_NAME,
      value: consumerDevice,
      ...consumerCookieOptions(CONSUMER_COOKIE_MAX_AGE),
    });
    return res;
  }

  // 8) Criação com proteção de CONCORRÊNCIA:
  //    pg_advisory_xact_lock serializa criadores simultâneos do mesmo par
  //    (consumerDevice, opportunityId) — o perdedor da corrida re-checa,
  //    encontra o resgate do vencedor e devolve 200 com o mesmo código.
  //    Geração do código com retry em colisão P2002 (UNIQUE(code)).
  let outcome:
    | { created: true; redemption: RedemptionPublic }
    | { created: false; redemption: RedemptionPublic }
    | null = null;
  try {
    outcome = await db.$transaction(
      async (tx) => {
        // Mutex por par (dispositivo, oportunidade) — hash de 32 bits;
        // colisões de hash apenas serializam mais, nunca afetam correção.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${consumerDevice}), hashtext(${opportunity.id}))`;

        // Re-checagem DENTRO do lock+transação (vencedores concorrentes)
        const raced = await tx.redemption.findFirst({
          where: { consumerDevice, opportunityId: opportunity.id },
          select: { code: true, status: true },
        });
        if (raced) {
          return { created: false as const, redemption: raced };
        }

        for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
          try {
            const created = await tx.redemption.create({
              data: {
                code: generateAngCode(),
                opportunityId: opportunity.id,
                attributionId,
                consumerName: consumerName ?? null,
                consumerWhatsapp: consumerWhatsapp ?? null,
                consumerDevice,
                status: "REDEEMED", // emitido — aguarda validação (Fase 3)
              },
              select: { code: true, status: true },
            });
            return { created: true as const, redemption: created };
          } catch (e) {
            const err = e as {
              code?: string;
              meta?: { target?: string[] | string };
            };
            if (err.code !== "P2002") throw e; // erro inesperado → 500
            // P2002 em `code` → colisão de código: regenera e tenta de novo.
            // P2002 em (consumerDevice, opportunityId) (índice parcial de
            // hardening, se aplicado) → criado concorrentemente: re-checa.
            const target = Array.isArray(err.meta?.target)
              ? err.meta.target.join(",")
              : String(err.meta?.target ?? "");
            if (target.includes("consumerDevice") || target.includes("consumer")) {
              const raced2 = await tx.redemption.findFirst({
                where: { consumerDevice, opportunityId: opportunity.id },
                select: { code: true, status: true },
              });
              if (raced2) {
                return { created: false as const, redemption: raced2 };
              }
            }
            // colisão de código → próxima tentativa
          }
        }
        throw new Error("CODE_EXHAUSTED");
      },
      { timeout: 10_000 }
    );
  } catch (e) {
    const err = e as { message?: string };
    if (err.message === "CODE_EXHAUSTED") {
      return NextResponse.json(
        { error: "Não foi possível gerar um código único. Tente novamente." },
        { status: 500 }
      );
    }
    console.error("[redemptions] Erro ao criar:", e);
    return NextResponse.json(
      { error: "Erro interno ao processar o resgate" },
      { status: 500 }
    );
  }

  // 9) Resposta: 201 (criado) ou 200 (já existia/criado concorrentemente) —
  //    sempre o MESMO código para o mesmo (dispositivo, oportunidade).
  const res = NextResponse.json(
    {
      redemption: {
        code: outcome.redemption.code,
        status: outcome.redemption.status,
        validUntil: opportunity.validUntil.toISOString(),
      },
    },
    { status: outcome.created ? 201 : 200 }
  );
  res.cookies.set({
    name: CONSUMER_COOKIE_NAME,
    value: consumerDevice,
    ...consumerCookieOptions(CONSUMER_COOKIE_MAX_AGE),
  });
  return res;
}
