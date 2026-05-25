const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const wallets = await prisma.wallet.findMany();
  if (wallets.length === 0) {
    console.log('No wallets found');
    return;
  }
  const wallet = wallets[0];
  console.log('Initial wallet balance:', wallet.balance);

  const amountInCents = 5000; // 50.00
  
  const transaction = await prisma.walletTransaction.create({
    data: {
      walletId: wallet.id,
      amount: amountInCents,
      description: 'Test Deposit',
      date: new Date()
    }
  });

  const updatedWallet = await prisma.wallet.update({
    where: { id: wallet.id },
    data: { balance: { increment: amountInCents } }
  });

  console.log('Updated wallet balance:', updatedWallet.balance);
}

main().finally(() => prisma.$disconnect());
