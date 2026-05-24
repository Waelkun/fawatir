const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { convertCurrency } = require('../src/services/currency.service');

// Import the logic from the controller to test it
const getUnifiedTransactions = async (userId, baseCurrency) => {
  // 1. Fetch receipts
  const receipts = await prisma.receipt.findMany({
    where: { userId },
    include: {
      items: {
        include: {
          splits: true
        }
      },
      payerPerson: { select: { id: true, name: true } }
    },
    orderBy: { date: 'desc' }
  });

  // 2. Fetch manual wallet transactions
  const manualTxs = await prisma.walletTransaction.findMany({
    where: { wallet: { userId } },
    include: { wallet: { select: { name: true, color: true } } },
    orderBy: { date: 'desc' }
  });

  // 3. Fetch settlements
  const settlements = await prisma.debtSettlement.findMany({
    where: { userId },
    include: { person: { select: { id: true, name: true } } },
    orderBy: { date: 'desc' }
  });

  const list = [];

  // Format receipts
  for (const r of receipts) {
    const shares = {};
    const items = r.items || [];
    let userShareCents = 0;
    
    if (items.length === 0) {
      if (r.payerType === 'USER') {
        userShareCents = r.total;
      } else if (r.payerType === 'PERSON' && r.payerPersonId) {
        shares[r.payerPersonId] = r.total / 100;
      }
    } else {
      let totalItemsCents = 0;
      for (const item of items) {
        totalItemsCents += item.total;
        if (item.splits && item.splits.length > 0) {
          for (const split of item.splits) {
            if (split.isUser) {
              userShareCents += split.amount;
            } else if (split.personId) {
              shares[split.personId] = (shares[split.personId] || 0) + split.amount / 100;
            }
          }
        } else {
          if (r.payerType === 'USER') {
            userShareCents += item.total;
          } else if (r.payerType === 'PERSON' && r.payerPersonId) {
            shares[r.payerPersonId] = (shares[r.payerPersonId] || 0) + item.total / 100;
          }
        }
      }
      
      // Pro-rate if total doesn't match totalItemsCents due to tax/discount
      if (totalItemsCents > 0 && r.total !== totalItemsCents) {
        const ratio = r.total / totalItemsCents;
        userShareCents = Math.round(userShareCents * ratio);
        for (const pId in shares) {
          shares[pId] = parseFloat((shares[pId] * ratio).toFixed(2));
        }
      }
    }

    const userShareAmount = userShareCents / 100;
    
    // Convert amounts to base currency
    let amountInBase = r.total / 100;
    let userShareInBase = userShareAmount;
    if (r.currency !== baseCurrency) {
      amountInBase = await convertCurrency(amountInBase, r.currency, baseCurrency);
      userShareInBase = await convertCurrency(userShareInBase, r.currency, baseCurrency);
      for (const pId in shares) {
        shares[pId] = await convertCurrency(shares[pId], r.currency, baseCurrency);
      }
    }

    let payerName = 'أنا';
    if (r.payerType === 'PERSON' && r.payerPerson) {
      payerName = r.payerPerson.name;
    }

    list.push({
      id: `receipt-${r.id}`,
      dbId: r.id,
      type: 'RECEIPT',
      amount: -parseFloat(amountInBase.toFixed(2)),
      description: r.storeName,
      date: r.date,
      currency: r.currency,
      payerType: r.payerType,
      payerPersonId: r.payerPersonId,
      payerName,
      userShare: parseFloat(userShareInBase.toFixed(2)),
      shares: {
        'user': parseFloat(userShareInBase.toFixed(2)),
        ...Object.fromEntries(
          Object.entries(shares).map(([k, v]) => [k, parseFloat(v.toFixed(2))])
        )
      }
    });
  }

  // Format manual transactions
  for (const t of manualTxs) {
    const amountVal = t.amount / 100; // stored in cents
    list.push({
      id: `manual-${t.id}`,
      dbId: t.id,
      type: amountVal >= 0 ? 'DEPOSIT' : 'WITHDRAW',
      amount: parseFloat(amountVal.toFixed(2)),
      description: t.description,
      date: t.date,
      currency: baseCurrency,
      walletName: t.wallet?.name,
      walletId: t.walletId,
      userShare: parseFloat(amountVal.toFixed(2)),
      shares: {
        'user': parseFloat(amountVal.toFixed(2))
      }
    });
  }

  // Format settlements
  for (const s of settlements) {
    const amountVal = s.amount / 100;
    list.push({
      id: `settlement-${s.id}`,
      dbId: s.id,
      type: 'SETTLEMENT',
      amount: parseFloat(amountVal.toFixed(2)),
      description: s.notes || (amountVal > 0 ? `استلام دفعة من ${s.person?.name}` : `سداد دفعة لـ ${s.person?.name}`),
      date: s.date,
      currency: baseCurrency,
      personId: s.personId,
      personName: s.person?.name,
      userShare: 0,
      shares: {
        'user': amountVal < 0 ? parseFloat((-amountVal).toFixed(2)) : 0,
        [s.personId]: amountVal > 0 ? parseFloat(amountVal.toFixed(2)) : 0
      }
    });
  }

  // Sort by date descending
  list.sort((a, b) => new Date(b.date) - new Date(a.date));
  return list;
};

async function run() {
  const result = await getUnifiedTransactions(1, 'SAR');
  console.log('--- UNIFIED TRANSACTIONS ---');
  console.log(JSON.stringify(result, null, 2));
}

run()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
