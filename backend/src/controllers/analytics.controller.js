const prisma = require('../config/db');
const aiService = require('../services/ai.service');
const { convertCurrency } = require('../services/currency.service');

const formatReceiptFromDb = (receipt) => {
  if (!receipt) return null;
  return {
    ...receipt,
    total: parseFloat((receipt.total / 100).toFixed(2)),
    tax: parseFloat((receipt.tax / 100).toFixed(2)),
    discount: parseFloat((receipt.discount / 100).toFixed(2)),
  };
};

// Memory cache for AI insights
let cachedInsights = null;
let lastInsightsGenerationTime = null;
let lastReceiptCount = 0;

// Helper to compute user's share of a receipt in base currency
const getUserShareOfReceipt = async (receipt, baseCurrency) => {
  const items = receipt.items || [];
  if (items.length === 0) {
    if (receipt.payerType === 'USER') {
      return await convertCurrency(receipt.total / 100, receipt.currency, baseCurrency);
    }
    return 0;
  }

  let userItemsTotalCents = 0;
  let totalItemsCents = 0;

  for (const item of items) {
    totalItemsCents += item.total;
    if (item.splits && item.splits.length > 0) {
      const userSplit = item.splits.find(s => s.isUser);
      if (userSplit) {
        userItemsTotalCents += userSplit.amount;
      }
    } else {
      if (receipt.payerType === 'USER') {
        userItemsTotalCents += item.total;
      }
    }
  }

  let userShareInReceiptCurrency = 0;
  if (totalItemsCents > 0) {
    userShareInReceiptCurrency = (receipt.total / 100) * (userItemsTotalCents / totalItemsCents);
  } else {
    userShareInReceiptCurrency = receipt.payerType === 'USER' ? (receipt.total / 100) : 0;
  }

  return await convertCurrency(userShareInReceiptCurrency, receipt.currency, baseCurrency);
};

// Helper: Calculate complete financial details for a person
async function calcPersonFinancialDetails(personId, userId, baseCurrency) {
  const person = await prisma.person.findFirst({ where: { id: personId, userId } });
  if (!person) return { totalOwesMe: 0, totalIOwe: 0, netBalance: 0 };

  const splits = await prisma.receiptItemSplit.findMany({
    where: { personId, isUser: false },
    include: {
      receiptItem: {
        include: {
          receipt: { select: { id: true, payerType: true, payerPersonId: true, currency: true } }
        }
      }
    }
  });

  const userSplits = await prisma.receiptItemSplit.findMany({
    where: {
      isUser: true,
      receiptItem: {
        receipt: {
          userId,
          payerType: 'PERSON',
          payerPersonId: personId
        }
      }
    },
    include: {
      receiptItem: {
        include: {
          receipt: { select: { id: true, payerType: true, payerPersonId: true, currency: true } }
        }
      }
    }
  });

  const settlements = await prisma.debtSettlement.findMany({
    where: { personId, userId }
  });

  let totalOwesMeCents = 0;
  for (const split of splits) {
    const r = split.receiptItem?.receipt;
    if (!r) continue;
    if (r.payerType === 'USER') {
      const amountInBase = await convertCurrency(split.amount / 100, r.currency, baseCurrency);
      totalOwesMeCents += Math.round(amountInBase * 100);
    }
  }

  let totalIOweCents = 0;
  for (const split of userSplits) {
    const r = split.receiptItem?.receipt;
    if (!r) continue;
    if (r.payerType === 'PERSON' && r.payerPersonId === personId) {
      const amountInBase = await convertCurrency(split.amount / 100, r.currency, baseCurrency);
      totalIOweCents += Math.round(amountInBase * 100);
    }
  }

  let totalSettledCents = 0;
  for (const s of settlements) {
    totalSettledCents += s.amount;
  }

  const netBalanceCents = totalOwesMeCents - totalIOweCents - totalSettledCents;

  return {
    totalOwesMe: parseFloat((totalOwesMeCents / 100).toFixed(2)),
    totalIOwe: parseFloat((totalIOweCents / 100).toFixed(2)),
    netBalance: parseFloat((netBalanceCents / 100).toFixed(2))
  };
}

const getUnifiedTransactions = async (userId, baseCurrency) => {
  // 1. Fetch receipts (excluding debts)
  const receipts = await prisma.receipt.findMany({
    where: { userId, isDebt: false },
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

const getDashboardData = async (req, res) => {
  const userId = req.userId;

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود.' });
    }

    const baseCurrency = user.baseCurrency || 'SAR';

    // 1. Get all user receipts
    const receipts = await prisma.receipt.findMany({
      where: { userId },
      include: {
        items: {
          include: {
            splits: true
          }
        }
      },
      orderBy: { date: 'desc' }
    });

    // 2. Compute stats: Personal Expenses, Cash Outflow
    let personalSpend30Days = 0;
    let cashOutflow30Days = 0;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const r of receipts) {
      if (r.date >= thirtyDaysAgo) {
        // User's personal share
        const personalShare = await getUserShareOfReceipt(r, baseCurrency);
        personalSpend30Days += personalShare;

        // Cash physically outflowed from user wallet
        if (r.payerType === 'USER') {
          const totalBase = await convertCurrency(r.total / 100, r.currency, baseCurrency);
          cashOutflow30Days += totalBase;
        }
      }
    }

    // 3. Get actual wallets balance sum
    const wallets = await prisma.wallet.findMany({ where: { userId } });
    const totalBalance = wallets.reduce((sum, w) => sum + w.balance, 0) / 100;

    // 4. Get active pending receivables & payables
    const people = await prisma.person.findMany({ where: { userId } });
    let pendingReceivables = 0;
    let pendingPayables = 0;

    for (const p of people) {
      const details = await calcPersonFinancialDetails(p.id, userId, baseCurrency);
      if (details.netBalance > 0) {
        pendingReceivables += details.netBalance;
      } else if (details.netBalance < 0) {
        pendingPayables += Math.abs(details.netBalance);
      }
    }

    // 4.1 Get active manual debts (isDebt = true, isSettled = false)
    const activeDebts = await prisma.receipt.findMany({
      where: {
        userId,
        isDebt: true,
        isSettled: false
      },
      orderBy: { date: 'desc' }
    });

    let totalDebtReceivable = 0; // الديون التي لي
    let totalDebtPayable = 0;    // الديون التي علي

    for (const d of activeDebts) {
      const amountInBase = await convertCurrency(d.total / 100, d.currency, baseCurrency);
      if (d.debtType === 'receivable') {
        totalDebtReceivable += amountInBase;
      } else if (d.debtType === 'payable') {
        totalDebtPayable += amountInBase;
      }
    }

    // Recent receipts (latest 5, excluding debts)
    const recentReceipts = await prisma.receipt.findMany({
      where: { userId, isDebt: false },
      take: 5,
      orderBy: { date: 'desc' },
      include: {
        items: {
          select: { originalName: true, total: true }
        }
      }
    });

    const formattedRecentReceipts = recentReceipts.map(r => ({
      ...r,
      total: parseFloat((r.total / 100).toFixed(2)),
      tax: parseFloat((r.tax / 100).toFixed(2)),
      discount: parseFloat((r.discount / 100).toFixed(2)),
      items: r.items.map(i => ({
        ...i,
        total: parseFloat((i.total / 100).toFixed(2))
      }))
    }));

    // Recent products (latest 5)
    const recentProducts = await prisma.product.findMany({
      where: { userId },
      take: 5,
      orderBy: { createdAt: 'desc' }
    });

    // 5. AI Insights
    const now = new Date();
    const cacheDurationMs = 10 * 60 * 1000;
    const shouldRegenerate = 
      !cachedInsights || 
      (now - lastInsightsGenerationTime > cacheDurationMs && receipts.length !== lastReceiptCount);

    if (shouldRegenerate) {
      const analyticsInput = receipts.filter(r => !r.isDebt).slice(0, 15).map(r => ({
        store: r.storeName,
        date: r.date.toISOString().split('T')[0],
        total: r.total / 100,
        currency: r.currency
      }));

      cachedInsights = await aiService.generateAIInsights(analyticsInput, baseCurrency);
      lastInsightsGenerationTime = now;
      lastReceiptCount = receipts.length;
    }

    const allTransactions = await getUnifiedTransactions(userId, baseCurrency);

    res.json({
      baseCurrency,
      stats: {
        totalBalance: parseFloat(totalBalance.toFixed(2)),
        monthlyExpenses: parseFloat(personalSpend30Days.toFixed(2)),
        cashOutflow: parseFloat(cashOutflow30Days.toFixed(2)),
        pendingReceivables: parseFloat(pendingReceivables.toFixed(2)),
        pendingPayables: parseFloat(pendingPayables.toFixed(2)),
        totalDebtReceivable: parseFloat(totalDebtReceivable.toFixed(2)),
        totalDebtPayable: parseFloat(totalDebtPayable.toFixed(2))
      },
      activeDebts: activeDebts.map(formatReceiptFromDb),
      recentTransactions: formattedRecentReceipts,
      recentProducts,
      aiInsights: cachedInsights,
      allTransactions
    });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء تحميل بيانات لوحة التحكم.' });
  }
};

const getSpendingTrends = async (req, res) => {
  const userId = req.userId;
  const { days = '7', startDate, endDate, mode = 'personal' } = req.query; // mode can be 'personal' or 'shared'

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const baseCurrency = user.baseCurrency || 'SAR';

    let start, end, limitDays;

    if (startDate && endDate) {
      start = new Date(`${startDate}T00:00:00.000Z`);
      end = new Date(`${endDate}T23:59:59.999Z`);
      limitDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (limitDays <= 0) limitDays = 1;
    } else {
      const daysCount = parseInt(days) || 7;
      limitDays = daysCount;
      start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      start.setUTCDate(start.getUTCDate() - daysCount + 1);
      end = new Date();
      end.setUTCHours(23, 59, 59, 999);
    }

    const receipts = await prisma.receipt.findMany({
      where: {
        userId,
        date: { gte: start, lte: end }
      },
      include: {
        items: {
          include: {
            splits: true
          }
        }
      },
      orderBy: { date: 'asc' }
    });

    const dateMap = {};
    for (let i = 0; i < limitDays; i++) {
      const d = new Date(start.getTime());
      d.setUTCDate(start.getUTCDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      dateMap[dateStr] = 0;
    }

    for (const r of receipts) {
      const dateStr = r.date.toISOString().split('T')[0];
      let amountInBase = 0;

      if (mode === 'personal') {
        amountInBase = await getUserShareOfReceipt(r, baseCurrency);
      } else {
        // Shared = full receipt total
        amountInBase = await convertCurrency(r.total / 100, r.currency, baseCurrency);
      }
      
      if (dateMap[dateStr] !== undefined) {
        dateMap[dateStr] += amountInBase;
      } else {
        dateMap[dateStr] = amountInBase;
      }
    }

    const chartData = Object.keys(dateMap).map(date => ({
      date,
      amount: parseFloat(dateMap[date].toFixed(2))
    })).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      baseCurrency,
      chartData
    });

  } catch (error) {
    console.error('Error fetching spending trends:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب مخطط الإنفاق.' });
  }
};

const refreshAIInsights = async (req, res) => {
  const userId = req.userId;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const baseCurrency = user.baseCurrency || 'SAR';

    const receipts = await prisma.receipt.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 15
    });

    const analyticsInput = receipts.map(r => ({
      store: r.storeName,
      date: r.date.toISOString().split('T')[0],
      total: r.total / 100,
      currency: r.currency
    }));

    const insights = await aiService.generateAIInsights(analyticsInput, baseCurrency);
    
    cachedInsights = insights;
    lastInsightsGenerationTime = new Date();
    lastReceiptCount = receipts.length;

    res.json({ aiInsights: insights });
  } catch (error) {
    console.error('Error refreshing AI insights:', error);
    res.status(500).json({ error: 'فشل تجديد رؤى الذكاء الاصطناعي.' });
  }
};

module.exports = {
  getDashboardData,
  getSpendingTrends,
  refreshAIInsights
};
