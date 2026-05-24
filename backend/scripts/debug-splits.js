const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debug() {
  console.log('--- PEOPLE ---');
  const people = await prisma.person.findMany();
  people.forEach(p => console.log(`Person ID: ${p.id}, Name: ${p.name}`));

  console.log('--- WALLETS ---');
  const wallets = await prisma.wallet.findMany();
  wallets.forEach(w => console.log(`Wallet ID: ${w.id}, Name: ${w.name}, Balance: ${w.balance / 100} (${w.type})`));

  console.log('--- RECEIPTS ---');
  const receipts = await prisma.receipt.findMany({
    include: {
      items: {
        include: {
          splits: true
        }
      }
    }
  });

  receipts.forEach(r => {
    console.log(`Receipt ID: ${r.id}, Store: ${r.storeName}, Total: ${r.total / 100} ${r.currency}, Payer: ${r.payerType}, Wallet: ${r.walletId}`);
    r.items.forEach(item => {
      console.log(`  Item: ${item.originalName}, Total: ${item.total / 100}`);
      item.splits.forEach(s => {
        console.log(`    Split: ${s.personName} (ID: ${s.personId}), Amount: ${s.amount / 100}, isUser: ${s.isUser}`);
      });
    });
  });

  await prisma.$disconnect();
}

debug();
