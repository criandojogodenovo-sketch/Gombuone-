// GOMBUONE — Autenticação administrativa (Fase 1, protótipo)
//
// Design:
// - A senha master vive APENAS em ADMIN_MASTER_PASSWORD (variável de ambiente).
// - O cookie de sessão transporta um token assinado (HMAC-SHA256) com expiração.
// - A verificação criptográfica completa acontece em runtime Node (páginas e APIs).
// - O middleware (Edge) faz apenas uma verificação leve de formato/expiração,
//   SEM usar segredos — a verificação forte está sempre no lado servidor Node.
//
// Implementado com Web Crypto (crypto.subtle), disponível tanto em Node 18+
// quanto em Edge Runtime.

export const ADMIN_COOKIE_NAME = "gombuone_admin";

// Duração da sessão: 8 horas
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

// ---------- Helpers de conversão hex <-> bytes ----------

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// Comparação constante (à prova de timing) para buffers do mesmo tamanho
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---------- Chave de assinatura ----------

async function getHmacKey(): Promise<CryptoKey> {
  const secret = process.env.ADMIN_MASTER_PASSWORD;
  if (!secret) {
    throw new Error("ADMIN_MASTER_PASSWORD não está configurada no servidor");
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// ---------- Senha administrativa ----------

/**
 * Verifica a senha administrativa de forma protegida contra ataques de timing:
 * em vez de comparar as strings originais, compara os HMACs de ambas.
 * NUNCA usar comparação direta (===) em segredos.
 */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const master = process.env.ADMIN_MASTER_PASSWORD;
  if (!master) return false;

  const enc = new TextEncoder();
  // HMAC com a própria senha master como chave
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(master),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const [a, b] = await Promise.all([
    crypto.subtle.sign("HMAC", key, enc.encode(password)),
    crypto.subtle.sign("HMAC", key, enc.encode(master)),
  ]);
  return constantTimeEqual(new Uint8Array(a), new Uint8Array(b));
}

// ---------- Sessão (cookie assinado) ----------

/**
 * Cria um token de sessão: `${expiraEmMs}.${assinaturaHMAC}`.
 * A assinatura cobre o payload (timestamp de expiração).
 */
export async function createSessionToken(): Promise<{
  token: string;
  maxAge: number;
}> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const data = new TextEncoder().encode(String(expiresAt));
  const sig = await crypto.subtle.sign("HMAC", await getHmacKey(), data);
  return {
    token: `${expiresAt}.${toHex(new Uint8Array(sig))}`,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

/**
 * Verificação COMPLETA do token de sessão (assinatura HMAC + expiração).
 * Deve ser usada em qualquer código executado em runtime Node
 * (páginas de servidor e rotas de API).
 */
export async function verifySessionToken(
  token: string | undefined | null
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [expStr, sigHex] = parts;

  const expiresAt = Number(expStr);
  if (!Number.isInteger(expiresAt) || !/^\d{10,16}$/.test(expStr)) return false;
  // Expirado ou expira num horizonte impossível (fora do TTL permitido)
  if (expiresAt < Date.now()) return false;
  if (expiresAt > Date.now() + SESSION_TTL_MS) return false;

  const sig = fromHex(sigHex);
  if (!sig || sig.length !== 32) return false;

  try {
    return await crypto.subtle.verify(
      "HMAC",
      await getHmacKey(),
      sig,
      new TextEncoder().encode(expStr)
    );
  } catch {
    return false;
  }
}

/**
 * Verificação LEVE (apenas formato + expiração, SEM segredo).
 * Usada exclusivamente pelo middleware (Edge) para bloquear rapidamente
 * pedidos sem sessão. A verificação forte (HMAC) acontece sempre depois,
 * em runtime Node — nunca confiar apenas nesta função.
 */
export function isValidSessionFormat(token: string | undefined | null): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [expStr, sigHex] = parts;
  if (!/^\d{10,16}$/.test(expStr)) return false;
  if (!/^[0-9a-f]{64}$/.test(sigHex)) return false;
  const expiresAt = Number(expStr);
  if (!Number.isInteger(expiresAt)) return false;
  return expiresAt > Date.now() && expiresAt <= Date.now() + SESSION_TTL_MS;
}

// ---------- Opções do cookie ----------

export function adminCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
