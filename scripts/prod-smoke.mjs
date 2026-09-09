// GOMBUONE — Fase 2 (corrigida) — SMOKE TESTS DE PRODUÇÃO (spec §26)
//
// Executa contra a produção REAL (default https://gombuone.vercel.app) e
// verifica o comportamento da Fase 2 corrigida:
//
// ATTRIBUTION:
//   1. Cookie A + Opportunity A           → 200, attribution X
//   2. MESMO Cookie A + MESMA oportunidade → 200, MESMA attribution X (reuso)
//   3. SEM cookie (novo "dispositivo") + MESMO IP + mesma oportunidade
//      → 200, NOVA attribution Y ≠ X (o IP não deduplica)
//
// REDEMPTION:
//   4. 1ª requisição: cookie consumidor C + oportunidade A + SEM WhatsApp → 201 + ANG-XXXX
//   5. 2ª requisição: MESMO cookie C + MESMA oportunidade → 200 + MESMO código
//
// Uso: node scripts/prod-smoke.mjs [BASE_URL]
// Nota: não requer DATABASE_URL — asserções 100% via HTTP (verificáveis
// independentemente por qualquer auditor, ex. curl).

const BASE_URL = process.argv[2] || "https://gombuone.vercel.app";
const SLUG = "oportunidade-teste";
const REF = "TESTREF01";

const CODE_PATTERN = /^ANG-[A-HJ-NP-Z2-9]{4}$/;

let failures = 0;
function check(name, pass, detail = "") {
  console.log(`[SMOKE] ${pass ? "PASS" : "FAIL"} — ${name}${detail ? " — " + detail : ""}`);
  if (!pass) failures++;
}

async function post(path, body, cookie) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(BASE_URL + path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { res, status: res.status, json, setCookies: res.headers.getSetCookie() };
}

function attrIdFrom(setCookies) {
  const sc = setCookies.find((c) => c.startsWith("gombu_attr="));
  if (!sc) return null;
  const raw = decodeURIComponent(sc.split(";")[0].slice("gombu_attr=".length));
  try {
    const map = JSON.parse(raw);
    return Object.values(map)[0] ?? null;
  } catch {
    return null;
  }
}

function consumerFrom(setCookies) {
  const sc = setCookies.find((c) => c.startsWith("gombu_consumer="));
  if (!sc) return null;
  return sc.split(";")[0].slice("gombu_consumer=".length);
}

async function main() {
  console.log(`[SMOKE] Alvo: ${BASE_URL}\n[SMOKE] ————— ATTRIBUTION —————`);

  // 1) Cookie A + Opportunity A
  const r1 = await post("/api/attributions", { opportunitySlug: SLUG, ref: REF });
  const attrA = attrIdFrom(r1.setCookies);
  const cookieA = r1.setCookies.find((c) => c.startsWith("gombu_attr="))?.split(";")[0];
  check("1. Attribution com cookie A → 200 + attribution emitida", r1.status === 200 && !!attrA, `status=${r1.status} attr=${attrA?.slice(-8) ?? "-"}`);

  // 2) Mesmo cookie A + mesma oportunidade → MESMA attribution
  const r2 = await post("/api/attributions", { opportunitySlug: SLUG, ref: REF }, cookieA);
  const attrA2 = attrIdFrom(r2.setCookies);
  check("2. Mesmo cookie + mesma oportunidade → MESMA attribution (reuso)", r2.status === 200 && attrA2 === attrA, `status=${r2.status} attr=${attrA2?.slice(-8) ?? "-"} igual=${attrA2 === attrA}`);

  // 3) SEM cookie (nova identidade) + mesmo IP + mesma oportunidade → NOVA attribution
  const r3 = await post("/api/attributions", { opportunitySlug: SLUG, ref: REF });
  const attrB = attrIdFrom(r3.setCookies);
  check("3. Sem cookie + mesmo IP → NOVA attribution (IP nunca deduplica)", r3.status === 200 && !!attrB && attrB !== attrA, `status=${r3.status} attr=${attrB?.slice(-8) ?? "-"} diferente=${attrB !== attrA}`);

  console.log("[SMOKE] ————— REDEMPTION —————");

  // 4) 1ª requisição SEM WhatsApp → 201 + código
  const c1 = await post("/api/redemptions", { opportunitySlug: SLUG });
  const code1 = c1.json?.redemption?.code;
  const consumer = consumerFrom(c1.setCookies);
  check("4. 1ª redemption sem WhatsApp → 201 + ANG-XXXX + cookie consumidor", c1.status === 201 && CODE_PATTERN.test(code1 ?? "") && !!consumer, `status=${c1.status} código=${code1 ?? "-"} consumidor=${consumer ? "emitido" : "ausente"}`);

  // 5) 2ª requisição: MESMO cookie consumidor + MESMA oportunidade → 200 + MESMO código
  const c2 = await post("/api/redemptions", { opportunitySlug: SLUG }, `gombu_consumer=${consumer}`);
  const code2 = c2.json?.redemption?.code;
  check("5. 2ª redemption (mesmo cookie + mesma oportunidade) → 200 + MESMO código", c2.status === 200 && code2 === code1, `status=${c2.status} código=${code2 ?? "-"} igual=${code2 === code1}`);

  console.log(`\n[SMOKE] RESULTADO: ${failures === 0 ? "PRODUÇÃO COMPORTAMENTO FASE 2 CONFIRMADO" : `${failures} FALHA(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("[SMOKE] ERRO FATAL:", e);
  process.exit(1);
});
