const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { convertCurrency } = require('../services/currency.service');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper: Calculate complete financial details for a person
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function calcPersonFinancialDetails(personId, userId, baseCurrency) {
  const person = await prisma.person.findFirst({ where: { id: personId, userId } });
  if (!person) return null;

  // 1. Splits where this person owes user (User paid, person has a split)
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

  // 2. Splits where user owes this person (Person paid, user has a split)
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

  // 3. Settlements
  const settlements = await prisma.debtSettlement.findMany({
    where: { personId, userId },
    orderBy: { date: 'desc' }
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

async function calcPersonBalance(personId, userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const baseCurrency = user?.baseCurrency || 'SAR';
  const details = await calcPersonFinancialDetails(personId, userId, baseCurrency);
  return details ? details.netBalance : 0;
}

// GET /api/people - List all persons with balances
exports.listPeople = async (req, res) => {
  try {
    const userId = req.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const baseCurrency = user?.baseCurrency || 'SAR';

    const people = await prisma.person.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' }
    });

    const peopleWithBalances = await Promise.all(
      people.map(async (p) => {
        const details = await calcPersonFinancialDetails(p.id, userId, baseCurrency);
        return {
          ...p,
          balance: details ? details.netBalance : 0,
          totalOwesMe: details ? details.totalOwesMe : 0,
          totalIOwe: details ? details.totalIOwe : 0
        };
      })
    );

    res.json({ people: peopleWithBalances });
  } catch (err) {
    console.error('listPeople error:', err);
    res.status(500).json({ error: 'فشل تحميل قائمة الأشخاص.' });
  }
};

// POST /api/people - Create a new person
exports.createPerson = async (req, res) => {
  try {
    const userId = req.userId;
    const { name, color, emoji } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'الاسم مطلوب.' });
    }

    const person = await prisma.person.create({
      data: {
        userId,
        name: name.trim(),
        color: color || '#4CC9F0',
        emoji: emoji || '👤'
      }
    });

    res.status(201).json({ person: { ...person, balance: 0, totalOwesMe: 0, totalIOwe: 0 } });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'يوجد شخص بهذا الاسم مسبقاً.' });
    }
    console.error('createPerson error:', err);
    res.status(500).json({ error: 'فشل إنشاء الشخص.' });
  }
};

// GET /api/people/:id - Person details with transaction history
exports.getPersonDetails = async (req, res) => {
  try {
    const userId = req.userId;
    const personId = parseInt(req.params.id);

    const person = await prisma.person.findFirst({
      where: { id: personId, userId }
    });

    if (!person) {
      return res.status(404).json({ error: 'الشخص غير موجود.' });
    }

    const userObj = await prisma.user.findUnique({ where: { id: userId } });
    const baseCurrency = userObj?.baseCurrency || 'SAR';

    const details = await calcPersonFinancialDetails(personId, userId, baseCurrency);

    // Fetch all splits involving this person (both User paid and Person paid)
    const splits = await prisma.receiptItemSplit.findMany({
      where: {
        OR: [
          { personId }, // Split where they owe user
          {
            isUser: true, // Split where user owes them
            receiptItem: {
              receipt: {
                userId,
                payerType: 'PERSON',
                payerPersonId: personId
              }
            }
          }
        ]
      },
      include: {
        receiptItem: {
          include: {
            receipt: { select: { id: true, storeName: true, date: true, currency: true, payerType: true, payerName: true } },
            product: { select: { category: true } }
          }
        }
      },
      orderBy: { id: 'desc' }
    });

    // Fetch all settlements
    const settlements = await prisma.debtSettlement.findMany({
      where: { personId, userId },
      orderBy: { date: 'desc' }
    });

    // Category breakdown of shared expenses (for both owes me and I owe)
    const categoryBreakdown = {};
    for (const split of splits) {
      const receipt = split.receiptItem?.receipt;
      if (!receipt) continue;
      const category = split.receiptItem?.product?.category || 'أخرى';
      const amountInBase = await convertCurrency(split.amount / 100, receipt.currency, baseCurrency);
      categoryBreakdown[category] = (categoryBreakdown[category] || 0) + amountInBase;
    }

    // Format output arrays
    const formattedSplits = splits.map(s => ({
      ...s,
      amount: parseFloat((s.amount / 100).toFixed(2)),
      receiptItem: s.receiptItem ? {
        ...s.receiptItem,
        price: parseFloat((s.receiptItem.price / 100).toFixed(2)),
        discount: parseFloat((s.receiptItem.discount / 100).toFixed(2)),
        total: parseFloat((s.receiptItem.total / 100).toFixed(2)),
        receipt: s.receiptItem.receipt ? {
          ...s.receiptItem.receipt
        } : null
      } : null
    }));

    const formattedSettlements = settlements.map(s => ({
      ...s,
      amount: parseFloat((s.amount / 100).toFixed(2))
    }));

    res.json({
      person: {
        ...person,
        balance: details.netBalance,
        totalOwesMe: details.totalOwesMe,
        totalIOwe: details.totalIOwe
      },
      splits: formattedSplits,
      settlements: formattedSettlements,
      categoryBreakdown: Object.entries(categoryBreakdown).map(([category, total]) => ({
        category,
        total: parseFloat(total.toFixed(2))
      }))
    });
  } catch (err) {
    console.error('getPersonDetails error:', err);
    res.status(500).json({ error: 'فشل تحميل بيانات الشخص.' });
  }
};

// DELETE /api/people/:id - Delete a person
exports.deletePerson = async (req, res) => {
  try {
    const userId = req.userId;
    const personId = parseInt(req.params.id);

    const person = await prisma.person.findFirst({ where: { id: personId, userId } });
    if (!person) {
      return res.status(404).json({ error: 'الشخص غير موجود.' });
    }

    await prisma.person.delete({ where: { id: personId } });
    res.json({ message: 'تم حذف الشخص بنجاح.' });
  } catch (err) {
    console.error('deletePerson error:', err);
    res.status(500).json({ error: 'فشل حذف الشخص.' });
  }
};

// PUT /api/people/:id - Update person info
exports.updatePerson = async (req, res) => {
  try {
    const userId = req.userId;
    const personId = parseInt(req.params.id);
    const { name, color, emoji } = req.body;

    const person = await prisma.person.findFirst({ where: { id: personId, userId } });
    if (!person) {
      return res.status(404).json({ error: 'الشخص غير موجود.' });
    }

    const updated = await prisma.person.update({
      where: { id: personId },
      data: {
        ...(name && { name: name.trim() }),
        ...(color && { color }),
        ...(emoji && { emoji })
      }
    });

    const userObj = await prisma.user.findUnique({ where: { id: userId } });
    const baseCurrency = userObj?.baseCurrency || 'SAR';
    const details = await calcPersonFinancialDetails(personId, userId, baseCurrency);

    res.json({
      person: {
        ...updated,
        balance: details ? details.netBalance : 0,
        totalOwesMe: details ? details.totalOwesMe : 0,
        totalIOwe: details ? details.totalIOwe : 0
      }
    });
  } catch (err) {
    console.error('updatePerson error:', err);
    res.status(500).json({ error: 'فشل تحديث بيانات الشخص.' });
  }
};
