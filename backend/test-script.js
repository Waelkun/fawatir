const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const wallets = await prisma.wallet.findMany();
  console.log('WALLETS:', wallets);
  const receipts = await prisma.receipt.findMany({ select: { id: true, imageUrl: true } });
  console.log('RECEIPTS:', receipts.slice(0, 5));
}

main().finally(() => prisma.$disconnect());
