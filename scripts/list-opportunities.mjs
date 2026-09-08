// Lista oportunidades existentes (para evitar colisões de slug no seed)
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const opps = await db.opportunity.findMany({
  select: { slug: true, title: true, status: true, validUntil: true, createdAt: true },
  orderBy: { createdAt: 'asc' },
});
for (const o of opps) {
  console.log(`${o.slug} | ${o.status} | até ${o.validUntil.toISOString().slice(0, 10)} | ${o.title}`);
}
await db.$disconnect();
