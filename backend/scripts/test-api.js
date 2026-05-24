const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const walletId = 2;
  const manualTxs = await prisma.walletTransaction.findMany({
    where: { walletId },
    orderBy: { date: 'desc' }
  });
  console.log('manualTxs:', manualTxs);

  const primaryReceipts = await prisma.receipt.findMany({
    where: { walletId, payerType: 'USER' },
    orderBy: { date: 'desc' }
  });
  console.log('primaryReceipts:', primaryReceipts);

  const secondaryReceipts = await prisma.receipt.findMany({
    where: { secondaryWalletId: walletId, payerType: 'USER' },
    orderBy: { date: 'desc' }
  });
  console.log('secondaryReceipts:', secondaryReceipts);

  const settlements = await prisma.debtSettlement.findMany({
    where: { walletId },
    orderBy: { date: 'desc' }
  });
  console.log('settlements:', settlements);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
