// GOMBUONE — Fase 2: cookie de atribuição (mapa por oportunidade)
//
// DESIGN (adenda aprovada — Secção "mapa por opportunityId"):
// O cookie `gombu_attr` guarda um MAPA { opportunityId: attributionId } em
// JSON (URL-encoded pelo cookies API do Next). Isto permite que um visitante
// clique em links de referência de MÚLTIPLAS oportunidades sem sobreposição:
// cada oportunidade tem a sua própria entrada de atribuição (último clique).
//
// SEGURANÇA:
// - HttpOnly: o JavaScript do cliente NUNCA lê o valor.
// - O valor NÃO é assinado, mas o servidor NUNCA confia nele: em cada resgate,
//   o attributionId do cookie é revalidado contra a base de dados (existência
//   + correspondência de oportunidade). Cookie forjado/obsoleto = tratado
//   como resgate direto (sem crédito a distribuidor).
// - O mapa é limitado a ATTR_MAP_LIMIT entradas (evita crescimento ilimitado).

export const ATTR_COOKIE_NAME = "gombu_attr";
export const ATTR_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 dias (janela de atribuição)
export const ATTR_COOKIE_MAX_AGE_SECONDS = ATTR_COOKIE_MAX_AGE;

/** Máximo de entradas guardadas no mapa do cookie (evita bloat). */
export const ATTR_MAP_LIMIT = 10;

/** Janela de desduplicação de cliques (mesmo IP + ref + oportunidade). */
export const ATTR_DEDUPE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

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
