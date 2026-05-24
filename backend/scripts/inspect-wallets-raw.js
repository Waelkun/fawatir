const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function rawInspect() {
  try {
    const rawWallets = await prisma.$queryRaw`SELECT * FROM "Wallet"`;
    console.log('Raw Wallets in DB:');
    console.log(rawWallets);
  } catch (e) {
    console.error('Error running raw SQL query:', e);
  }
}

rawInspect();
