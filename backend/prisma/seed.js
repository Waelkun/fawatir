const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting seeding database...');

  // 1. Seed default Exchange Rates
  const rates = [
    { from: 'USD', to: 'SAR', rate: 3.75 },
    { from: 'USD', to: 'EUR', rate: 0.92 },
    { from: 'USD', to: 'TRY', rate: 32.20 },
    
    { from: 'SAR', to: 'USD', rate: 0.27 },
    { from: 'SAR', to: 'EUR', rate: 0.25 },
    { from: 'SAR', to: 'TRY', rate: 8.58 },
    
    { from: 'EUR', to: 'SAR', rate: 4.07 },
    { from: 'EUR', to: 'USD', rate: 1.08 },
    { from: 'EUR', to: 'TRY', rate: 34.90 },
    
    { from: 'TRY', to: 'SAR', rate: 0.12 },
    { from: 'TRY', to: 'USD', rate: 0.031 },
    { from: 'TRY', to: 'EUR', rate: 0.029 }
  ];

  for (const r of rates) {
    await prisma.exchangeRate.upsert({
      where: { from_to: { from: r.from, to: r.to } },
      update: { rate: r.rate },
      create: { from: r.from, to: r.to, rate: r.rate }
    });
  }
  console.log('Seeded exchange rates.');

  // 2. Seed default user
  const hashedPassword = await bcrypt.hash('alexsterling', 10);
  const user = await prisma.user.upsert({
    where: { email: 'alex@fintech.ai' },
    update: {},
    create: {
      email: 'alex@fintech.ai',
      password: hashedPassword,
      name: 'أليكس ستيرلينغ',
      baseCurrency: 'SAR'
    }
  });
  console.log(`Seeded user: ${user.email} (Password: alexsterling)`);

  // Seed default wallets
  const wallets = [
    { name: 'نقدي (Cash)', type: 'CASH', balance: 500000, color: '#4CAF50' }, // 5000 SAR
    { name: 'الحساب البنكي', type: 'BANK', balance: 1000000, color: '#4CC9F0' } // 10000 SAR
  ];

  for (const w of wallets) {
    const existingWallet = await prisma.wallet.findFirst({
      where: { userId: user.id, name: w.name }
    });
    if (!existingWallet) {
      await prisma.wallet.create({
        data: {
          userId: user.id,
          name: w.name,
          type: w.type,
          balance: w.balance,
          color: w.color
        }
      });
    }
  }
  console.log('Seeded default wallets.');

  console.log('Seeding database completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
