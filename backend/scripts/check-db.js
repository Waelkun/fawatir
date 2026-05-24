const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const wallets = await prisma.wallet.findMany();
  console.log('--- WALLETS ---');
  console.log(wallets);

  const transactions = await prisma.walletTransaction.findMany();
  console.log('--- TRANSACTIONS ---');
  console.log(transactions);

  const receipts = await prisma.receipt.findMany();
  console.log('--- RECEIPTS ---');
  console.log(receipts.map(r => ({ id: r.id, storeName: r.storeName, total: r.total, walletId: r.walletId, secondaryWalletId: r.secondaryWalletId })));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
