// GOMBUONE — Esquemas de validação (Zod)
// Estes esquemas são isomórficos: usados pelas APIs (server-side) e pelo
// formulário do cliente (feedback instantâneo).

import { z } from "zod";

// Slug: apenas letras minúsculas, números e hífens (sem hífens duplicados,
// no início ou no fim)
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Confirma que a URL é HTTPS e aponta para o Vercel Blob
 * (hostname termina com .blob.vercel-storage.com).
 * NOTA: a API de criação de oportunidades NÃO aceita imageUrl arbitrária.
 */
export function isVercelBlobUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      u.hostname.endsWith(".blob.vercel-storage.com")
    );
  } catch {
    return false;
  }
}

export const OPPORTUNITY_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "EXPIRED",
  "ARCHIVED",
] as const;

export const createOpportunitySchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "O título deve ter pelo menos 3 caracteres")
    .max(100, "O título deve ter no máximo 100 caracteres"),

  description: z
    .string()
    .trim()
    .min(10, "A descrição deve ter pelo menos 10 caracteres")
    .max(500, "A descrição deve ter no máximo 500 caracteres"),

  slug: z
    .string()
    .trim()
    .regex(
      SLUG_PATTERN,
      "Slug inválida: use apenas letras minúsculas, números e hífens (ex: minha-oportunidade)"
    ),

  imageUrl: z
    .string()
    .trim()
    .refine((val) => isVercelBlobUrl(val), {
      message:
        "imageUrl deve ser uma URL válida do Vercel Blob (https://...blob.vercel-storage.com/...)",
    }),

  location: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .trim()
      .min(1, "Localização não pode estar vazia (se preenchida)")
      .max(100, "A localização deve ter no máximo 100 caracteres")
      .optional()
  ),

  validUntil: z.coerce
    .date()
    .refine((d) => d.getTime() > Date.now(), {
      message: "A data de validade deve estar no futuro",
    }),

  companyId: z.string().trim().min(1, "Selecione uma empresa"),

  status: z.enum(OPPORTUNITY_STATUSES).default("DRAFT"),
});

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;

// ---------- Login ----------

export const loginSchema = z.object({
  password: z.string().min(1, "Senha obrigatória"),
});

// ---------- Upload ----------

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB

// ---------- FASE 2: Atribuição (?ref=) ----------

// Código de referência de distribuidor: alfanumérico, 4–32 caracteres
// (TESTREF01/TESTREF02 cumprem este formato)
export const REF_PATTERN = /^[A-Za-z0-9]{4,32}$/;

export const attributionSchema = z.object({
  opportunitySlug: z
    .string()
    .trim()
    .regex(SLUG_PATTERN, "Slug da oportunidade inválida"),
  ref: z
    .string()
    .trim()
    .regex(REF_PATTERN, "Código de referência inválido (4–32 caracteres alfanuméricos)"),
});

// ---------- FASE 2: Resgate do consumidor ----------

// WhatsApp de Angola: +244 seguido de 9 (móvel) + 8 dígitos → +2449XXXXXXXX
export const WHATSAPP_PATTERN = /^\+2449\d{8}$/;

// Nome: letras unicode, espaços, apóstrofos, hífens e pontos (2–60 caracteres).
// Rejeita explicitamente <>, tags e payloads — os nomes são exibidos ao
// comerciante na Fase 3, por isso o charset é restrito à escrita de nomes.
export const CONSUMER_NAME_PATTERN = /^[\p{L}\p{M}\s'.-]{2,60}$/u;

export const redemptionSchema = z.object({
  opportunitySlug: z
    .string()
    .trim()
    .regex(SLUG_PATTERN, "Slug da oportunidade inválida"),
  consumerName: z
    .string()
    .trim()
    .regex(
      CONSUMER_NAME_PATTERN,
      "Nome inválido: use apenas letras, espaços, apóstrofos, hífens e pontos (2–60 caracteres)"
    ),
  consumerWhatsapp: z
    .string()
    .trim()
    .regex(
      WHATSAPP_PATTERN,
      "WhatsApp inválido: use o formato angolano +2449XXXXXXXX (ex.: +244923456789)"
    ),
});
