const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inspect() {
  try {
    const rates = await prisma.exchangeRate.findMany();
    console.log('Exchange Rates in DB:');
    rates.forEach(r => {
      console.log(`- ${r.from} -> ${r.to}: ${r.rate}`);
    });
  } catch (e) {
    console.error('Failed to load exchange rates:', e.message);
  }

  try {
    const wallets = await prisma.wallet.findMany();
    console.log('\nWallets in DB:');
    wallets.forEach(w => {
      console.log(`- ID: ${w.id}, Name: ${w.name}, Balance (cents): ${w.balance}`);
    });
  } catch (e) {
    console.error('\nFailed to load wallets:', e.message);
  }
}

inspect();
