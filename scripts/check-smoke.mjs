import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const reds = await db.redemption.findMany({
  where: { consumerWhatsapp: { in: ['+244912345678', '+244912345699'] } },
  include: { attribution: { select: { id: true, distributor: { select: { refCode: true } } } } },
});
for (const r of reds) {
  console.log(`${r.code} | attr: ${r.attributionId ? r.attribution.distributor.refCode : 'DIRETO (null)'} | dev: ${r.consumerDevice ? 'sim' : 'nao'} | ${r.consumerName} | ${r.status}`);
}
await db.$disconnect();
