// GOMBUONE — Fase 2 (correção) — Hardening do banco de dados
//
// Cria o ÍNDICE ÚNICO PARCIAL:
//   UNIQUE (consumerDevice, opportunityId) WHERE consumerDevice IS NOT NULL
//
// Este índice é um cinto-de-segurança EM ADIÇÃO ao pg_advisory_xact_lock
// usado em /api/redemptions (garantia primária de idempotência sob
// concorrência). É ADITIVO e NÃO DESTRUTIVO: apenas índice, sem tocar em
// dados. Regras:
//   - Se já existir → no-op (IF NOT EXISTS).
//   - Se houver linhas duplicadas legacy (política antiga, antes da
//     correção) → o índice NÃO é criado e o script REPORTA os duplicados
//     para decisão explícita (nunca apaga dados por conta própria).
//
// Uso (requer DATABASE_URL no ambiente):
//   node scripts/db-hardening.mjs

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const INDEX_NAME = "Redemption_consumer_device_opportunity_uniq";

async function main() {
  // 1) Duplicados legacy? (mesmo par consumerDevice+opportunityId)
  const dupes = await db.$queryRaw`
    SELECT "consumerDevice", "opportunityId", COUNT(*)::int AS n
    FROM "Redemption"
    WHERE "consumerDevice" IS NOT NULL
    GROUP BY "consumerDevice", "opportunityId"
    HAVING COUNT(*) > 1
    LIMIT 10
  `;

  if (dupes.length > 0) {
    console.log(
      `[db-hardening] ATENÇÃO: ${dupes.length}+ pares duplicados encontrados ` +
        `(dados legacy da política antiga). O índice único NÃO foi criado — ` +
        `decisão explícita necessária (nenhum dado foi apagado).`
    );
    for (const d of dupes) {
      console.log(
        `  par duplicado: consumerDevice=${d.consumerDevice} opportunityId=${d.opportunityId} n=${d.n}`
      );
    }
    console.log(
      `[db-hardening] A idempotência continua garantida pelo advisory lock ` +
        `transacional de /api/redemptions.`
    );
    return;
  }

  // 2) Sem duplicados → cria o índice único parcial (idempotente)
  await db.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "${INDEX_NAME}"
     ON "Redemption"("consumerDevice", "opportunityId")
     WHERE "consumerDevice" IS NOT NULL`
  );

  const idx = await db.$queryRaw`
    SELECT indexname FROM pg_indexes WHERE indexname = ${INDEX_NAME}
  `;
  console.log(
    idx.length === 1
      ? `[db-hardening] Índice único parcial ${INDEX_NAME} confirmado: ` +
          `UNIQUE(consumerDevice, opportunityId) WHERE consumerDevice IS NOT NULL`
      : `[db-hardening] ERRO: índice não encontrado após criação`
  );
}

main()
  .catch((e) => {
    console.error("[db-hardening] ERRO:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
