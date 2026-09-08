// GOMBUONE — Seed inicial (Fase 1)
//
// NOTA IMPORTA DE CONSISTÊNCIA:
// Este seed insere dados DIRETAMENTE no banco via Prisma e NÃO passa pela
// rota POST /api/admin/opportunities. Por isso, a validação de imageUrl
// (exigir URL do Vercel Blob) que existe na API NÃO se aplica aqui.
// A imageUrl abaixo é uma imagem pública de TESTE (marcação explícita),
// aceitável apenas em dados de seed — a API continua a rejeitar URLs
// que não sejam do Vercel Blob.

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

  // 2) Oportunidade de teste ligada à empresa
  const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 dias

  // ⚠️ DADO DE TESTE: URL externa (picsum) — ver nota de consistência no topo.
  const TEST_IMAGE_URL = "https://picsum.photos/seed/gombuone-test/800/450.webp";

  const opportunity = await prisma.opportunity.upsert({
    where: { slug: "oportunidade-teste" },
    update: { validUntil, status: "ACTIVE" },
    create: {
      companyId: company.id,
      title: "Oportunidade de Teste",
      slug: "oportunidade-teste",
      description: "Descrição de teste para validação da Fase 1",
      imageUrl: TEST_IMAGE_URL,
      location: "Luanda, Angola",
      validUntil,
      status: "ACTIVE",
    },
  });
  console.log(
    `[SEED] Oportunidade criada/confirmada: ${opportunity.title} (${opportunity.id}) — imageUrl é DADO DE TESTE externo (não Vercel Blob)`
  );
  console.log(
    `[SEED] Válido até: ${validUntil.toISOString()} | Estado: ${opportunity.status}`
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
