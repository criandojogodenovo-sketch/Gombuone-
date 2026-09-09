// GOMBUONE — Fase 2: cookie de atribuição (mapa por oportunidade)
//
// DESIGN (adenda aprovada — Secção "mapa por opportunityId"):
// O cookie `gombu_attr` guarda um MAPA { opportunityId: attributionId } em
// JSON (URL-encoded pelo cookies API do Next). Isto permite que um visitante
// clique em links de referência de MÚLTIPLAS oportunidades sem sobreposição:
// cada oportunidade tem a sua própria entrada de atribuição (último clique).
//
// CORREÇÃO FASE 2 (política final — cookie é o ÚNICO mecanismo de
// desduplicação de Attribution):
// - O IP NUNCA participa da decisão de reutilizar/criar uma Attribution.
// - A antiga ATTR_DEDUPE_WINDOW_MS (7 dias, dedup por IP) foi REMOVIDA:
//   a janela de deduplicação passa a ser a própria vida do cookie (30 dias).
// - O IP continua a ser capturado, mas APENAS para rate limiting, auditoria
//   e investigação de abuso (nunca como identidade).
//
// SEGURANÇA:
// - HttpOnly: o JavaScript do cliente NUNCA lê o valor.
// - O valor NÃO é assinado, mas o servidor NUNCA confia nele: em cada clique
//   o attributionId do cookie é revalidado contra a base de dados (existência
//   + correspondência de oportunidade E distribuidor); no resgate, existência
//   + correspondência de oportunidade. Cookie forjado/obsoleto = ignorado.
// - O mapa é limitado a ATTR_MAP_LIMIT entradas (evita crescimento ilimitado).

export const ATTR_COOKIE_NAME = "gombu_attr";
export const ATTR_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 dias (janela de atribuição)
export const ATTR_COOKIE_MAX_AGE_SECONDS = ATTR_COOKIE_MAX_AGE;

/** Máximo de entradas guardadas no mapa do cookie (evita bloat). */
export const ATTR_MAP_LIMIT = 10;

// NOTA: ATTR_DEDUPE_WINDOW_MS (7 dias) foi REMOVIDO na correção da Fase 2.
// A desduplicação de Attribution é exclusivamente por cookie (gombu_attr):
// o cookie vive 30 dias e a referência nele contida é revalidada no banco a
// cada clique. IP e User-Agent são apenas auditoria/rate limiting.

// IDs Prisma (cuid): "c" + 20+ caracteres [a-z0-9]
const CUID_PATTERN = /^c[a-z0-9]{8,40}$/;

type AttrMap = Record<string, string>;

/**
 * Parse seguro do cookie: qualquer anomalia (JSON inválido, tipos errados,
 * IDs com formato inválido, mapa demasiado grande) devolve mapa vazio.
 * Nunca lança — cookie corrompido é tratado como "sem atribuição".
 */
export function parseAttrMap(raw: string | undefined | null): AttrMap {
  if (!raw || raw.length > 4096) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  const out: AttrMap = {};
  let count = 0;
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (count >= ATTR_MAP_LIMIT) break;
    if (typeof value !== "string") continue;
    if (!CUID_PATTERN.test(key) || !CUID_PATTERN.test(value)) continue;
    out[key] = value;
    count += 1;
  }
  return out;
}

/** Serializa o mapa para o valor do cookie (JSON compacto). */
export function serializeAttrMap(map: AttrMap): string {
  // Mantém apenas as últimas ATTR_MAP_LIMIT entradas (FIFO: as mais antigas saem)
  const entries = Object.entries(map).slice(-ATTR_MAP_LIMIT);
  return JSON.stringify(Object.fromEntries(entries));
}

/** Opções do cookie de atribuição (alinhadas com as da sessão admin). */
export function attrCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

// ---------- Cookie do consumidor ----------

export const CONSUMER_COOKIE_NAME = "gombu_consumer";
export const CONSUMER_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 ano

/**
 * Identidade anónima do consumidor: UUID v4 gerado SEMPRE pelo servidor
 * (crypto.randomUUID). O valor do cookie só é aceite se cumprir este
 * formato — qualquer lixo enviado pelo cliente gera uma NOVA identidade
 * no servidor (nunca é armazenado como está). A identidade NUNCA é
 * aceite do corpo JSON (mass assignment bloqueado pelo Zod).
 */
export const CONSUMER_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Valida o valor do cookie do consumidor (UUID v4, 36 chars).
 * Inválido/ausente → false → o servidor gera nova identidade (randomUUID).
 */
export function isValidConsumerId(value: string | undefined | null): boolean {
  if (!value || value.length !== 36) return false;
  return CONSUMER_UUID_PATTERN.test(value);
}

/** Opções do cookie anónimo do consumidor. */
export function consumerCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
