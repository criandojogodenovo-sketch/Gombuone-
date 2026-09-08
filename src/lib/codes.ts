// GOMBUONE — Fase 2: geração de códigos de resgate ANG-XXXX
//
// Formato: "ANG-" + 4 caracteres de um alfabeto SEM caracteres ambíguos
// (sem 0/O e sem 1/I) — pensado para ser lido/ditado ao balcão do comerciante.
// Geração com aleatoriedade criptográfica (crypto.randomInt do Node).
// Colisões são impossíveis de evitar em teoria, mas o campo `code` tem
// constraint UNIQUE na base de dados e a rota repete a geração em colisão.

import { randomInt } from "crypto";

// 32 caracteres: sem 0, O, 1, I
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 4;
export const CODE_PREFIX = "ANG-";

/** Padrão que um código válido deve cumprir (usado em testes e validações). */
export const CODE_PATTERN = /^ANG-[A-HJ-NP-Z2-9]{4}$/;

/** Gera um código novo com aleatoriedade criptográfica. */
export function generateAngCode(): string {
  let suffix = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    suffix += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return `${CODE_PREFIX}${suffix}`;
}
