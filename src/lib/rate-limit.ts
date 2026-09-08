// GOMBUONE — Fase 2: limites de taxa (rate limiting) em memória
//
// Limite de janela fixa por chave (por IP + rota). Em memória porque a Fase 2
// não introduz infraestrutura externa (Redis, Upstash). Limitação conhecida:
// no ambiente serverless da Vercel cada instância de lambda tem o seu próprio
// mapa — o limite é "melhor esforço" por instância. A anti-fraude avançada
// (store partilhado + fingerprints) é fase posterior.
//
// NÃO confundir com o rate limit da rota de login (Fase 1), que se mantém
// inalterado para não regredir comportamento existente.

const buckets = new Map<string, { count: number; resetAt: number }>();

// Limpeza preguiçosa: varre entradas expiradas quando o mapa cresce demais
// (evita crescimento ilimitado sem timers).
const SWEEP_THRESHOLD = 5_000;

function sweepExpired(now: number): void {
  for (const [key, rec] of buckets) {
    if (rec.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Segundos até a janela reiniciar (0 quando permitido) */
  retryAfterSec: number;
}

/**
 * Regista uma tentativa e decide se é permitida.
 * @param key    chave de agregação (ex.: "attr:1.2.3.4")
 * @param max    máximo de pedidos por janela
 * @param windowMs tamanho da janela em milissegundos
 */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  if (buckets.size > SWEEP_THRESHOLD) sweepExpired(now);

  const rec = buckets.get(key);
  if (!rec || rec.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  rec.count += 1;
  if (rec.count > max) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((rec.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSec: 0 };
}

/**
 * IP de origem do pedido. Em produção (Vercel) o cabeçalho x-forwarded-for é
 * definido pela infraestrutura e reflete o cliente real; localmente os testes
 * podem defini-lo explicitamente.
 */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  if (first) return first.slice(0, 64);
  return req.headers.get("x-real-ip")?.slice(0, 64) || "unknown";
}
