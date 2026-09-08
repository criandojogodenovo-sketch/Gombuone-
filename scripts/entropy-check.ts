// GOMBUONE — Fase 2 — Verificação de entropia do gerador de códigos (teste 42)
import { CODE_ALPHABET, CODE_PATTERN, generateAngCode } from "../src/lib/codes";

const N = 1000;
const codes = Array.from({ length: N }, () => generateAngCode());
const unique = new Set(codes);

let charsetOk = codes.every((c) => CODE_PATTERN.test(c));
let maxRun = 0;
let run = 0;
for (let i = 1; i < codes.length; i++) {
  run = codes[i] === codes[i - 1] ? run + 1 : 0;
  maxRun = Math.max(maxRun, run);
}
// Distribuição: cada posição deve usar > 10 caracteres distintos do alfabeto
const posDistinct = [0, 1, 2, 3].map((pos) => {
  const seen = new Set(codes.map((c) => c[4 + pos]));
  return seen.size;
});

console.log(
  JSON.stringify({
    total: N,
    unique: unique.size,
    duplicates: N - unique.size,
    charsetOk,
    sequentialAdjacentDuplicates: maxRun,
    posDistinct,
    alphabetSize: CODE_ALPHABET.length,
  })
);
