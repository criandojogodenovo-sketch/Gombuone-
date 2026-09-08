// GOMBUONE — Seed (Fase 1 + Fase 2)
//
// NOTA IMPORTANTE DE CONSISTÊNCIA (AJUSTE 1 — mantida da Fase 1):
// Este seed insere dados DIRETAMENTE no banco via Prisma e NÃO passa pela
// rota POST /api/admin/opportunities. Por isso, a validação de imageUrl
// (exigir URL do Vercel Blob) que existe na API NÃO se aplica aqui.
// As imageUrls abaixo são imagens públicas de TESTE (marcação explícita),
// aceitáveis apenas em dados de seed — a API continua a rejeitar URLs
// que não sejam do Vercel Blob.
//
// MAPEAMENTO SEED ↔ TESTES DA FASE 2 (Secção 8 da adenda):
// - User refCode "TESTREF01"/"TESTREF02"       → testes de atribuição (13–23)
// - Opportunity "oportunidade-teste" (ACTIVE)  → fluxo principal de atribuição/resgate
// - Opportunity "oportunidade-teste-2" (ACTIVE)→ mapa de cookies multi-oportunidade
// - Opportunity "oportunidade-expirada"        → rejeição de oportunidade expirada
//                                                (status ACTIVE + validUntil no passado)
// - "cafe-kilamba-desconto-15" (DRAFT, Fase 1) → rejeição de oportunidade não-publicada
// - whatsapp "+2449XXXXXXXX"                   → formato de consumidor (testes 24–33)

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // 1) Empresa de teste
  //    PIN "1234" é armazenado APENAS como hash bcrypt (nunca em plaintext).
  const pinHash = await bcrypt.hash("1234", 10);

  const company = await prisma.company.upsert({
    where: { slug: "empresa-teste" },
    update: {},
    create: {
      name: "Empresa de Teste",
      slug: "empresa-teste",
      contactName: "Teste",
      whatsapp: "+244900000000",
      pinHash,
    },
  });
  console.log(
    `[SEED] Empresa criada/confirmada: ${company.name} (${company.id}) — PIN armazenado apenas como hash bcrypt`
  );

  // 2) Distribuidores de teste (FASE 2) — códigos de referência determinísticos
  //    usados pelos testes 13–23. DADOS DE TESTE: nunca usar em produção real.
  const dist1 = await prisma.user.upsert({
    where: { refCode: "TESTREF01" },
    update: {},
    create: {
      name: "Distribuidor Teste Um",
      whatsapp: "+244900000001",
      role: "DISTRIBUTOR",
      refCode: "TESTREF01",
    },
  });
  const dist2 = await prisma.user.upsert({
    where: { refCode: "TESTREF02" },
    update: {},
    create: {
      name: "Distribuidor Teste Dois",
      whatsapp: "+244900000002",
      role: "DISTRIBUTOR",
      refCode: "TESTREF02",
    },
  });
  console.log(
    `[SEED] Distribuidores de teste: ${dist1.refCode} (${dist1.id}) | ${dist2.refCode} (${dist2.id}) — DADOS DE TESTE`
  );

  // 3) Oportunidades
  const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 dias

  // ⚠️ DADO DE TESTE: URLs externas (picsum) — ver nota de consistência no topo.
  const TEST_IMAGE_1 = "https://picsum.photos/seed/gombuone-test/800/450.webp";
  const TEST_IMAGE_2 = "https://picsum.photos/seed/gombuone-test-2/800/450.webp";
  const TEST_IMAGE_3 = "https://picsum.photos/seed/gombuone-expired/800/450.webp";

  // 3a) Oportunidade principal de teste (fluxo completo de atribuição + resgate)
  const opportunity = await prisma.opportunity.upsert({
    where: { slug: "oportunidade-teste" },
    update: { validUntil, status: "ACTIVE" },
    create: {
      companyId: company.id,
      title: "Oportunidade de Teste",
      slug: "oportunidade-teste",
      description: "Descrição de teste para validação da Fase 2 (fluxo público).",
      imageUrl: TEST_IMAGE_1,
      location: "Luanda, Angola",
      validUntil,
      status: "ACTIVE",
    },
  });
  console.log(
    `[SEED] Oportunidade principal: ${opportunity.title} (${opportunity.id}) — imageUrl é DADO DE TESTE externo (não Vercel Blob)`
  );

  // 3b) Segunda oportunidade ATIVA (testes de mapa de cookies multi-oportunidade)
  const opportunity2 = await prisma.opportunity.upsert({
    where: { slug: "oportunidade-teste-2" },
    update: { validUntil, status: "ACTIVE" },
    create: {
      companyId: company.id,
      title: "Segunda Oportunidade de Teste",
      slug: "oportunidade-teste-2",
      description: "Segunda oferta de teste para validar o mapa de atribuição por oportunidade.",
      imageUrl: TEST_IMAGE_2,
      location: "Benguela, Angola",
      validUntil,
      status: "ACTIVE",
    },
  });
  console.log(
    `[SEED] Segunda oportunidade: ${opportunity2.title} (${opportunity2.id}) — DADO DE TESTE`
  );

  // 3c) Oportunidade EXPIRADA (status ACTIVE + validUntil no passado):
  //     o filtro público deve rejeitá-la — teste negativo dos testes 13–23.
  const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // ontem
  const opportunityExpired = await prisma.opportunity.upsert({
    where: { slug: "oportunidade-expirada" },
    update: { validUntil: expiredDate, status: "ACTIVE" },
    create: {
      companyId: company.id,
      title: "Oportunidade Expirada de Teste",
      slug: "oportunidade-expirada",
      description: "Oferta de teste com validade esgotada — deve ser rejeitada nos endpoints públicos.",
      imageUrl: TEST_IMAGE_3,
      location: "Luanda, Angola",
      validUntil: expiredDate,
      status: "ACTIVE",
    },
  });
  console.log(
    `[SEED] Oportunidade expirada: ${opportunityExpired.title} — validUntil ${expiredDate.toISOString()} (deve ser rejeitada publicamente)`
  );

  console.log(
    `[SEED] Resumo: refCodes de teste TESTREF01/TESTREF02 | oportunidades públicas: oportunidade-teste, oportunidade-teste-2 | rejeitáveis: oportunidade-expirada (data), cafe-kilamba-desconto-15 (DRAFT da Fase 1)`
  );
}

main()
  .catch((e) => {
    console.error("[SEED] Erro:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
