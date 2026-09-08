// Verificação de schema + contagens na BD GOMBUONE (Fase 2)
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const cols = await db.$queryRawUnsafe(`
  SELECT table_name, string_agg(column_name, ',' ORDER BY column_name) AS cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name IN ('User','Attribution','Redemption')
  GROUP BY table_name ORDER BY table_name`);
for (const c of cols) console.log(`${c.table_name}: ${c.cols}`);

const counts = await db.$queryRawUnsafe(`
  SELECT (SELECT count(*) FROM "Company") companies,
         (SELECT count(*) FROM "Opportunity") opportunities,
         (SELECT count(*) FROM "User") users,
         (SELECT count(*) FROM "Attribution") attributions,
         (SELECT count(*) FROM "Redemption") redemptions`);
console.log('CONTAGENS:', JSON.stringify(counts[0], (k, v) => typeof v === 'bigint' ? Number(v) : v));
await db.$disconnect();
