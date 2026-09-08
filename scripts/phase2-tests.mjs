// GOMBUONE — Fase 2 — Suíte de testes 13–45 (funcionais + ataques)
//
// Executa contra um servidor de PRODUÇÃO local (next start) — ver README da
// suíte em scripts/. Uso:
//   source .env.runtime.sh && node scripts/phase2-tests.mjs [BASE_URL]
//
// Segredos usados apenas via process.env (nunca hardcoded).
// Dados de teste: IPs 10.0.0.x / 10.99.0.x e whatsapps +2449110xxxxxx —
// linhas criadas são removidas na limpeza (antes e depois).

import { PrismaClient } from "@prisma/client";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const BASE_URL = process.argv[2] || "http://localhost:3100";
const db = new PrismaClient();

const ADMIN_PASSWORD = process.env.ADMIN_MASTER_PASSWORD || "";
const DB_URL = process.env.DATABASE_URL || "";

// ---------- Utilitários ----------

const results = [];
function record(id, name, pass, detail = "") {
  results.push({ id, name, pass, detail });
  console.log(
    `TESTE ${id} [${pass ? "PASS" : "FAIL"}] ${name}${detail ? " — " + detail : ""}`
  );
}

function cookieFromSetCookie(setCookies, name) {
  const sc = setCookies.find((c) => c.startsWith(`${name}=`));
  if (!sc) return null;
  return sc.split(";")[0]; // "name=valor-bruto"
}

async function post(path, body, { ip, cookie, ua } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (ip) headers["x-forwarded-for"] = ip;
  if (cookie) headers["Cookie"] = cookie;
  if (ua) headers["User-Agent"] = ua;
  const res = await fetch(BASE_URL + path, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { res, status: res.status, text, json, setCookies: res.headers.getSetCookie() };
}

async function get(path, { ip, cookie, redirect = "follow" } = {}) {
  const headers = {};
  if (ip) headers["x-forwarded-for"] = ip;
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(BASE_URL + path, { headers, redirect });
  const text = await res.text();
  return { res, status: res.status, text, setCookies: res.headers.getSetCookie() };
}

function cookieValue(setCookies, name) {
  const pair = cookieFromSetCookie(setCookies, name);
  if (!pair) return null;
  return decodeURIComponent(pair.slice(name.length + 1));
}

// Limpeza de linhas de teste (antes e depois da suíte)
async function cleanup() {
  await db.redemption.deleteMany({
    where: {
      OR: [
        { consumerWhatsapp: { startsWith: "+2449110" } },
        { consumerWhatsapp: { in: ["+244912345678", "+244912345699"] } },
      ],
    },
  });
  await db.attribution.deleteMany({
    where: {
      ip: { in: ["10.0.0.13", "10.0.0.15", "10.0.0.16", "10.99.0.34", "10.99.0.36", "10.99.0.38", "41.72.100.5", "41.72.100.6", "41.72.100.7"] },
    },
  });
}

function walkFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

// ---------- Suíte ----------

const DB_PASSWORD = (() => {
  const m = DB_URL.match(/:\/\/[^:]+:([^@]+)@/);
  return m ? m[1] : "";
})();

const SLUG_OPP = "oportunidade-teste";
const SLUG_OPP2 = "oportunidade-teste-2";

async function main() {
  await cleanup();
  const oppCountBefore = await db.opportunity.count();

  let jar13 = null; // cookie bruto gombu_attr após teste 13
  let jar13Full = null; // Set-Cookie completo (para verificação de flags)
  let jar16 = null; // cookie bruto gombu_attr após teste 16 (duas entradas)
  let code24 = null;
  let attr13Id = null;
  let opp1Id = null;
  let opp2Id = null;

  // ================= ATRIBUIÇÃO (13–23) =================

  // 13 — POST válido cria atribuição e emite cookie
  {
    const before = await db.attribution.count();
    const r = await post("/api/attributions", { opportunitySlug: SLUG_OPP, ref: "TESTREF01" }, { ip: "10.0.0.13", ua: "TestAgent/13" });
    const attr = await db.attribution.findFirst({
      where: { ip: "10.0.0.13" },
      include: { opportunity: true, distributor: true },
    });
    const ok =
      r.status === 200 &&
      r.json?.ok === true &&
      cookieFromSetCookie(r.setCookies, "gombu_attr") !== null &&
      !!attr &&
      attr.distributor?.refCode === "TESTREF01" &&
      attr.opportunity.slug === SLUG_OPP &&
      attr.source === "whatsapp" &&
      attr.userAgent === "TestAgent/13" &&
      (await db.attribution.count()) === before + 1;
    jar13 = cookieFromSetCookie(r.setCookies, "gombu_attr");
    jar13Full = r.setCookies.find((c) => c.startsWith("gombu_attr=")) || "";
    attr13Id = attr?.id ?? null;
    opp1Id = attr?.opportunity.id ?? null;
    record(13, "POST /api/attributions válido cria linha e emite cookie", ok, `status=${r.status} attr=${attr?.id ?? "nenhuma"}`);
  }

  // 14 — Cookie é mapa {opportunityId: attributionId} com flags de segurança
  {
    const raw = cookieValue([jar13 || ""], "gombu_attr") || "";
    let mapOk = false;
    try {
      const map = JSON.parse(raw);
      mapOk = typeof map === "object" && map[opp1Id] === attr13Id;
    } catch {}
    const flags = jar13Full || "";
    const flagsOk =
      /HttpOnly/i.test(flags) && /SameSite=lax/i.test(flags) && /Path=\//i.test(flags) && /Max-Age=2592000/i.test(flags) && /Secure/i.test(flags);
    record(14, "Cookie = mapa JSON por opportunityId; HttpOnly+Secure+SameSite=Lax+Path=/+Max-Age=30d", mapOk && flagsOk, `mapa=${mapOk ? "ok" : "inválido"} flags=${flagsOk ? "ok" : "faltando"}`);
  }

  // 15 — Repetição do mesmo clique (mesmo IP) desduplica
  {
    const before = await db.attribution.count({ where: { ip: "10.0.0.13" } });
    const r = await post("/api/attributions", { opportunitySlug: SLUG_OPP, ref: "TESTREF01" }, { ip: "10.0.0.13", cookie: jar13 ?? undefined, ua: "TestAgent/13" });
    const after = await db.attribution.count({ where: { ip: "10.0.0.13" } });
    const raw = cookieValue(r.setCookies, "gombu_attr") || "";
    let sameId = false;
    try {
      sameId = JSON.parse(raw)[opp1Id] === attr13Id;
    } catch {}
    record(15, "Repetição (mesmo IP+ref) não duplica linha; cookie estável", r.status === 200 && before === 1 && after === 1 && sameId, `antes=${before} depois=${after}`);
  }

  // 16 — Segunda oportunidade/outro ref: mapa acumula DUAS entradas
  {
    const r = await post("/api/attributions", { opportunitySlug: SLUG_OPP2, ref: "TESTREF02" }, { ip: "10.0.0.16", cookie: jar13 ?? undefined, ua: "TestAgent/16" });
    const attr2 = await db.attribution.findFirst({ where: { ip: "10.0.0.16" }, include: { opportunity: true } });
    opp2Id = attr2?.opportunity.id ?? null;
    const raw = cookieValue(r.setCookies, "gombu_attr") || "";
    let entries = 0;
    let bothOk = false;
    try {
      const map = JSON.parse(raw);
      entries = Object.keys(map).length;
      bothOk = map[opp1Id] === attr13Id && map[opp2Id] === attr2?.id;
    } catch {}
    jar16 = cookieFromSetCookie(r.setCookies, "gombu_attr");
    record(16, "Multi-oportunidade: mapa preserva AMBAS as entradas (sem sobreposição)", r.status === 200 && !!attr2 && entries === 2 && bothOk, `entradas=${entries}`);
  }

  // 17 — Ref inexistente: 400 uniforme, sem linha, sem cookie
  {
    const before = await db.attribution.count();
    const r = await post("/api/attributions", { opportunitySlug: SLUG_OPP, ref: "CODIGOXPTO" }, { ip: "10.0.0.17" });
    record(17, "Ref inexistente → 400 uniforme (anti-enumeração), sem linha/cookie", r.status === 400 && (await db.attribution.count()) === before && cookieFromSetCookie(r.setCookies, "gombu_attr") === null, `status=${r.status}`);
  }

  // 18 — Oportunidade DRAFT: 404
  {
    const r = await post("/api/attributions", { opportunitySlug: "cafe-kilamba-desconto-15", ref: "TESTREF01" }, { ip: "10.0.0.18" });
    record(18, "Oportunidade DRAFT rejeitada (404)", r.status === 404, `status=${r.status}`);
  }

  // 19 — Oportunidade expirada: 404
  {
    const r = await post("/api/attributions", { opportunitySlug: "oportunidade-expirada", ref: "TESTREF01" }, { ip: "10.0.0.19" });
    record(19, "Oportunidade expirada rejeitada (404)", r.status === 404, `status=${r.status}`);
  }

  // 20 — Oportunidade inexistente: 404
  {
    const r = await post("/api/attributions", { opportunitySlug: "nao-existe-mesmo", ref: "TESTREF01" }, { ip: "10.0.0.20" });
    record(20, "Oportunidade inexistente rejeitada (404)", r.status === 404, `status=${r.status}`);
  }

  // 21 — Corpos malformados: JSON inválido, campos ausentes, charsets ilegais
  {
    const cases = [
      ["json-inválido", "não é json {", 400],
      ["sem-ref", { opportunitySlug: SLUG_OPP }, 400],
      ["ref-ilegal", { opportunitySlug: SLUG_OPP, ref: "ab" }, 400],
      ["ref-com-simbolos", { opportunitySlug: SLUG_OPP, ref: "TEST'REF01" }, 400],
      ["slug-ilegal", { opportunitySlug: "Oportunidade Teste", ref: "TESTREF01" }, 400],
    ];
    let allOk = true;
    const details = [];
    for (const [name, body, expected] of cases) {
      const r = await post("/api/attributions", body, { ip: "10.0.0.21" });
      if (r.status !== expected) allOk = false;
      details.push(`${name}:${r.status}`);
    }
    record(21, "Corpos malformados → 400 (JSON, campos, charsets)", allOk, details.join(" "));
  }

  // 22 — Página pública renderiza com e sem ?ref=
  {
    const r1 = await get(`/oportunidades/${SLUG_OPP}?ref=TESTREF01`, { ip: "10.0.0.22" });
    const r2 = await get(`/oportunidades/${SLUG_OPP}`, { ip: "10.0.0.22" });
    const ok =
      r1.status === 200 &&
      r2.status === 200 &&
      r1.text.includes("Oportunidade de Teste") &&
      r1.text.includes("Empresa de Teste") &&
      r1.text.includes("Resgatar esta oferta");
    record(22, "Página /oportunidades/[slug] renderiza (com e sem ?ref=)", ok, `com-ref=${r1.status} sem-ref=${r2.status}`);
  }

  // 23 — Visita sem ?ref= não cria atribuições (sem POST automático no servidor)
  {
    const before = await db.attribution.count();
    await get(`/oportunidades/${SLUG_OPP}`, { ip: "10.0.0.23" });
    await get("/", { ip: "10.0.0.23" });
    const after = await db.attribution.count();
    record(23, "Visita sem ?ref= não cria linhas de atribuição", before === after, `antes=${before} depois=${after}`);
  }

  // ================= RESGATE (24–33) =================

  // 24 — Resgate com cookie de atribuição válido
  {
    const r = await post("/api/redemptions", { opportunitySlug: SLUG_OPP, consumerName: "Ana Teste", consumerWhatsapp: "+244911000101" }, { ip: "10.0.0.24", cookie: jar13 ?? undefined });
    code24 = r.json?.redemption?.code ?? null;
    const consumerCookie = cookieFromSetCookie(r.setCookies, "gombu_consumer");
    record(24, "POST /api/redemptions com cookie → 201 + código + cookie consumidor", r.status === 201 && !!code24 && !!consumerCookie, `status=${r.status} código=${code24 ?? "-"}`);
  }

  // 25 — Formato do código ANG-XXXX (charset sem ambiguidades)
  {
    const ok = /^ANG-[A-HJ-NP-Z2-9]{4}$/.test(code24 || "");
    record(25, "Formato do código ^ANG-[A-HJ-NP-Z2-9]{4}$ (sem 0/O/1/I)", ok, `código=${code24}`);
  }

  // 26 — Linha vinculada à atribuição (crédito do distribuidor)
  {
    const red = await db.redemption.findUnique({ where: { code: code24 || "X" }, include: { attribution: { include: { distributor: true } } } });
    const ok =
      !!red &&
      red.attributionId === attr13Id &&
      red.attribution?.distributor?.refCode === "TESTREF01" &&
      red.status === "REDEEMED" &&
      red.consumerName === "Ana Teste" &&
      red.consumerWhatsapp === "+244911000101" &&
      !!red.consumerDevice;
    record(26, "Redemption vinculado à atribuição TESTREF01 (status REDEEMED, dados guardados)", ok, `attribution=${red?.attributionId ?? "null"}`);
  }

  // 27 — Segunda oportunidade: código diferente e vínculo ao outro distribuidor
  {
    const r = await post("/api/redemptions", { opportunitySlug: SLUG_OPP2, consumerName: "Bruno Teste", consumerWhatsapp: "+244911000201" }, { ip: "10.0.0.27", cookie: jar16 ?? undefined });
    const red = await db.redemption.findUnique({ where: { code: r.json?.redemption?.code ?? "X" }, include: { attribution: { include: { distributor: true } } } });
    const ok =
      r.status === 201 &&
      r.json?.redemption?.code !== code24 &&
      red?.attribution?.distributor?.refCode === "TESTREF02";
    record(27, "Multi-oportunidade: código distinto e vínculo TESTREF02", ok, `código=${r.json?.redemption?.code ?? "-"}`);
  }

  // 28 — Resgate SEM cookie (tráfego direto): permitido, attributionId null
  {
    const r = await post("/api/redemptions", { opportunitySlug: SLUG_OPP, consumerName: "Carla Direta", consumerWhatsapp: "+244911000301" }, { ip: "10.0.0.28" });
    const red = await db.redemption.findUnique({ where: { code: r.json?.redemption?.code ?? "X" } });
    record(28, "Resgate direto (sem cookie) → 201 com attributionId null", r.status === 201 && red?.attributionId === null, `status=${r.status} attribution=${red?.attributionId ?? "-"}`);
  }

  // 29 — Cookie FORJADO (attributionId inexistente): tratado como direto
  {
    const fake = `gombu_attr=${encodeURIComponent(JSON.stringify({ [opp1Id]: "czzzzzzzzzzzzzzzzzzzzzzz" }))}`;
    const r = await post("/api/redemptions", { opportunitySlug: SLUG_OPP, consumerName: "Dino Forjado", consumerWhatsapp: "+244911000401" }, { ip: "10.0.0.29", cookie: fake });
    const red = await db.redemption.findUnique({ where: { code: r.json?.redemption?.code ?? "X" } });
    record(29, "Cookie forjado revalidado no servidor → resgate direto (sem crédito falso)", r.status === 201 && red?.attributionId === null, `status=${r.status}`);
  }

  // 30 — Resgate de oportunidade expirada: 404
  {
    const r = await post("/api/redemptions", { opportunitySlug: "oportunidade-expirada", consumerName: "Expirado Teste", consumerWhatsapp: "+244911000501" }, { ip: "10.0.0.30" });
    record(30, "Resgate de oportunidade expirada → 404", r.status === 404, `status=${r.status}`);
  }

  // 31 — Dados do consumidor inválidos: 400
  {
    const cases = [
      ["whatsapp-mal", { opportunitySlug: SLUG_OPP, consumerName: "Nome Ok", consumerWhatsapp: "900" }],
      ["whatsapp-letras", { opportunitySlug: SLUG_OPP, consumerName: "Nome Ok", consumerWhatsapp: "+2449abcdefgh" }],
      ["nome-curto", { opportunitySlug: SLUG_OPP, consumerName: "A", consumerWhatsapp: "+244911000601" }],
      ["nome-tags", { opportunitySlug: SLUG_OPP, consumerName: "<script>alert(1)</script>", consumerWhatsapp: "+244911000601" }],
      ["sem-campos", { opportunitySlug: SLUG_OPP }],
    ];
    let allOk = true;
    const details = [];
    for (const [name, body] of cases) {
      const r = await post("/api/redemptions", body, { ip: "10.0.0.31" });
      if (r.status !== 400) allOk = false;
      details.push(`${name}:${r.status}`);
    }
    record(31, "Dados do consumidor inválidos → 400 (formato, XSS, ausência)", allOk, details.join(" "));
  }

  // 32 — Duplicado (mesmo whatsapp + mesma oportunidade): 409 sem novo código
  {
    const before = await db.redemption.count({ where: { consumerWhatsapp: "+244911000101" } });
    const r = await post("/api/redemptions", { opportunitySlug: SLUG_OPP, consumerName: "Ana Teste", consumerWhatsapp: "+244911000101" }, { ip: "10.0.0.32", cookie: jar13 ?? undefined });
    const after = await db.redemption.count({ where: { consumerWhatsapp: "+244911000101" } });
    record(32, "Duplicado → 409, sem segundo código", r.status === 409 && before === after && !r.text.includes("ANG-"), `status=${r.status}`);
  }

  // 33 — consumerDevice persistido (cookie anónimo → coluna)
  {
    const red = await db.redemption.findFirst({ where: { consumerWhatsapp: "+244911000101" } });
    const ok = !!red?.consumerDevice && /^[0-9a-f-]{36}$/.test(red.consumerDevice);
    record(33, "consumerDevice (UUID do cookie anónimo) persistido", ok, `device=${red?.consumerDevice?.slice(0, 13) ?? "-"}...`);
  }

  // ================= ATAQUES (34–45) =================

  // 34 — Rate limit da atribuição (61º pedido do mesmo IP → 429)
  {
    let ok = false;
    let first429 = -1;
    const before = await db.attribution.count({ where: { ip: "10.99.0.34" } });
    for (let i = 1; i <= 65; i++) {
      const r = await post("/api/attributions", { opportunitySlug: SLUG_OPP, ref: "TESTREF01" }, { ip: "10.99.0.34" });
      if (r.status === 429 && first429 === -1) first429 = i;
      if (r.status === 429) break;
    }
    const after = await db.attribution.count({ where: { ip: "10.99.0.34" } });
    ok = first429 === 61 && after === before + 1; // 1 linha desduplicada, resto bloqueado
    record(34, "Spam de atribuição: 429 a partir do 61º; desduplicação segura a linha", ok, `primeiro-429=${first429} linhas=${after}`);
  }

  // 35 — Rate limit do resgate (21º pedido do mesmo IP → 429)
  {
    let first429 = -1;
    let created = 0;
    const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (let i = 1; i <= 25; i++) {
      const phone = `+2449110${String(i).padStart(5, "0")}`; // +2449 + 8 dígitos
      // nomes sem dígitos (charset de nomes só aceita letras/espaços)
      const name = `Consumidor Ficticio ${LETTERS[(i - 1) % 26]}`;
      const r = await post("/api/redemptions", { opportunitySlug: SLUG_OPP, consumerName: name, consumerWhatsapp: phone }, { ip: "10.99.0.35" });
      if (r.status === 201) created++;
      if (r.status === 429 && first429 === -1) first429 = i;
      if (r.status === 429) break;
    }
    record(35, "Spam de resgate: 429 a partir do 21º", first429 === 21 && created === 20, `primeiro-429=${first429} criados=${created}`);
  }

  // 36 — SQL injection em todos os campos: 400 e BD intacta
  {
    const payloads = [
      ["/api/attributions", { opportunitySlug: "oportunidade-teste'--", ref: "TESTREF01" }],
      ["/api/attributions", { opportunitySlug: SLUG_OPP, ref: "TESTREF01' OR '1'='1" }],
      ["/api/attributions", { opportunitySlug: SLUG_OPP, ref: "TESTREF01; DROP TABLE users;--" }],
      ["/api/redemptions", { opportunitySlug: SLUG_OPP, consumerName: "Robert'); DROP TABLE redemptions;--", consumerWhatsapp: "+244911000701" }],
      ["/api/redemptions", { opportunitySlug: SLUG_OPP, consumerName: "Nome Ok", consumerWhatsapp: "+244911000701' OR 1=1--" }],
    ];
    let all400 = true;
    const details = [];
    for (const [path, body] of payloads) {
      const r = await post(path, body, { ip: "10.99.0.36" });
      if (r.status !== 400) all400 = false;
      details.push(`${r.status}`);
    }
    const intact = (await db.opportunity.count()) === oppCountBefore;
    record(36, "SQL injection → 400 uniforme; BD intacta (Prisma parametrizado)", all400 && intact, `estados=[${details.join(",")}] oportunidades=${await db.opportunity.count()}`);
  }

  // 37 — XSS armazenado no nome: rejeitado no charset
  {
    const r = await post("/api/redemptions", { opportunitySlug: SLUG_OPP, consumerName: "<img src=x onerror=alert(1)>", consumerWhatsapp: "+244911000801" }, { ip: "10.99.0.37" });
    const stored = await db.redemption.findFirst({ where: { consumerName: { contains: "onerror" } } });
    record(37, "XSS no nome → 400 (charset de nomes) e nada guardado", r.status === 400 && !stored, `status=${r.status}`);
  }

  // 38 — Payloads oversized: 400 sem crash
  {
    const big = "A".repeat(100_000);
    const cases = [
      ["/api/redemptions", { opportunitySlug: SLUG_OPP, consumerName: big, consumerWhatsapp: "+244911000901" }],
      ["/api/attributions", { opportunitySlug: SLUG_OPP, ref: "R".repeat(10_000) }],
      ["/api/redemptions", big],
    ];
    let allOk = true;
    const details = [];
    for (const [path, body] of cases) {
      const r = await post(path, body, { ip: "10.99.0.38" });
      if (r.status !== 400) allOk = false;
      details.push(r.status);
    }
    const alive = (await get("/", { ip: "10.99.0.38" })).status === 200;
    record(38, "Payloads oversized → 400; servidor continua de pé", allOk && alive, `estados=[${details.join(",")}] home=${alive ? 200 : "caiu"}`);
  }

  // 39 — Mapa forjado com MÚLTIPLAS entradas falsas (formato cuid válido)
  {
    const fakeMap = {};
    for (let i = 0; i < 10; i++) fakeMap[`cfakefakefakefake${i}`] = "czzzzzzzzzzzzzzzzzzzzzzz";
    const fake = `gombu_attr=${encodeURIComponent(JSON.stringify(fakeMap))}`;
    const r = await post("/api/redemptions", { opportunitySlug: SLUG_OPP, consumerName: "Mapa Forjado", consumerWhatsapp: "+244911001001" }, { ip: "10.99.0.39", cookie: fake });
    const red = await db.redemption.findUnique({ where: { code: r.json?.redemption?.code ?? "X" } });
    record(39, "Mapa forjado (múltiplas entradas) → resgate direto, sem créditos falsos", r.status === 201 && red?.attributionId === null, `status=${r.status} attribution=${red?.attributionId ?? "-"}`);
  }

  // 40 — Sem enumeração: 405/401/redirect nas rotas não autorizadas
  {
    const g1 = await get("/api/attributions", { ip: "10.99.0.40" });
    const g2 = await get("/api/redemptions", { ip: "10.99.0.40" });
    const g3 = await get("/api/admin/opportunities", { ip: "10.99.0.40" });
    const g4 = await get("/admin", { ip: "10.99.0.40", redirect: "manual" });
    const redirectOk = g4.status >= 300 && g4.status < 400 && (g4.res.headers.get("location") || "").includes("/admin/login");
    record(
      40,
      "Sem enumeração: GET públicos 405; admin sem sessão 401; /admin redireciona",
      g1.status === 405 && g2.status === 405 && g3.status === 401 && redirectOk,
      `attr=${g1.status} red=${g2.status} admin=${g3.status} /admin=${g4.status}`
    );
  }

  // 41 — Segredos fora do bundle cliente (.next/static) e do HTML
  {
    const staticDir = join(process.cwd(), ".next", "static");
    let files = [];
    try {
      files = walkFiles(staticDir);
    } catch {}
    const needles = [
      { label: "identificador BLOB_READ_WRITE_TOKEN", value: "BLOB_READ_WRITE_TOKEN" },
      { label: "valor ADMIN_MASTER_PASSWORD", value: ADMIN_PASSWORD },
      { label: "senha da DATABASE_URL", value: DB_PASSWORD },
    ].filter((n) => n.value);
    let leak = null;
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const needle of needles) {
        if (needle.value && content.includes(needle.value)) {
          leak = `${needle.label} em ${file}`;
          break;
        }
      }
      if (leak) break;
    }
    const html = (await get("/", { ip: "10.99.0.41" })).text;
    for (const needle of needles) {
      if (needle.value && html.includes(needle.value)) leak = leak || `${needle.label} no HTML`;
    }
    record(41, "Nenhum segredo em .next/static nem no HTML (ficheiros: " + files.length + ")", !leak && files.length > 0, leak ? `VAZAMENTO: ${leak}` : "limpo");
  }

  // 42 — Entropia do gerador de códigos (unidade)
  {
    let stats = null;
    try {
      const out = execSync("npx tsx scripts/entropy-check.ts", { cwd: process.cwd(), encoding: "utf8" });
      stats = JSON.parse(out.trim().split("\n").pop());
    } catch (e) {
      record(42, "Entropia do gerador (unidade)", false, `erro: ${String(e).slice(0, 80)}`);
    }
    if (stats) {
      // Paradoxo do aniversário: 1000 códigos de 20 bits (32^4) esperam
      // ~0,5 colisões — a unicidade REAL é garantida pela constraint UNIQUE
      // + retry (P2002) na rota. Aqui validamos entropia/charset, não
      // unicidade exata.
      const ok =
        stats.duplicates <= 5 &&
        stats.charsetOk === true &&
        stats.sequentialAdjacentDuplicates === 0 &&
        stats.posDistinct.every((d) => d > 10);
      record(42, "1000 códigos: charset válido, não-sequencial, colisões dentro do esperado (≤5; unicidade garantida pela BD)", ok, `únicos=${stats.unique}/${stats.total} colisões=${stats.duplicates} posições=${stats.posDistinct.join("/")}`);
    }
  }

  // 43 — Regressão: POST admin sem sessão → 401
  {
    const r = await post("/api/admin/opportunities", { title: "Hackeada", description: "tentativa sem sessao valida aqui", slug: "hackeada", imageUrl: "https://x.blob.vercel-storage.com/x.webp", companyId: "c1", validUntil: "2027-01-01" }, { ip: "10.99.0.43" });
    const created = await db.opportunity.findUnique({ where: { slug: "hackeada" } });
    record(43, "POST /api/admin/opportunities sem sessão → 401; nada criado", r.status === 401 && !created, `status=${r.status}`);
  }

  // 44 — 409 não revela o código existente (anti-enumeração)
  {
    const r = await post("/api/redemptions", { opportunitySlug: SLUG_OPP, consumerName: "Ana Teste", consumerWhatsapp: "+244911000101" }, { ip: "10.99.0.44" });
    const noLeak = !r.text.includes("ANG-") && !r.text.includes(code24 || "ANG-XXXX");
    record(44, "Resposta 409 genérica — não revela o código já emitido", r.status === 409 && noLeak, `status=${r.status} vazamento=${!noLeak}`);
  }

  // 45 — Rotação B1 aplicada: login admin com a senha NOVA funciona
  {
    const r = await post("/api/admin/login", { password: ADMIN_PASSWORD }, { ip: "10.99.0.45" });
    const session = cookieFromSetCookie(r.setCookies, "gombuone_admin");
    record(45, "Login admin com senha ROTACIONADA → sessão emitida", r.status === 200 && !!session, `status=${r.status} sessão=${session ? "emitida" : "ausente"}`);
  }

  // ---------- Resumo ----------
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  console.log("\n===== RESUMO FASE 2 =====");
  console.log(`TOTAL: ${results.length} | PASS: ${passed} | FAIL: ${failed}`);
  if (failed > 0) {
    console.log("FALHAS:");
    for (const r of results.filter((x) => !x.pass)) console.log(`  TESTE ${r.id}: ${r.name} — ${r.detail}`);
  }

  const report = [
    `# Relatório de testes da Fase 2 (execução local — ${new Date().toISOString()})`,
    "",
    `Alvo: ${BASE_URL}`,
    "",
    ...results.map((r) => `- **TESTE ${r.id}** [${r.pass ? "PASS" : "FAIL"}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`),
    "",
    `**TOTAL: ${results.length} | PASS: ${passed} | FAIL: ${failed}**`,
  ].join("\n");
  try {
    const { writeFileSync } = await import("fs");
    writeFileSync(join(process.cwd(), "scripts", "phase2-test-report.md"), report);
    console.log("Relatório gravado em scripts/phase2-test-report.md");
  } catch {}

  await cleanup();
  await db.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("ERRO FATAL DA SUÍTE:", e);
  await db.$disconnect();
  process.exit(2);
});
