const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const formatSettlement = (s) => ({
  ...s,
  amount: parseFloat((s.amount / 100).toFixed(2))
});

// POST /api/settlements - Record a debt settlement
exports.createSettlement = async (req, res) => {
  try {
    const userId = req.userId;
    const { personId, amount, notes, receiptId, walletId } = req.body;

    if (!personId || !amount) {
      return res.status(400).json({ error: 'الشخص والمبلغ مطلوبان.' });
    }

    const person = await prisma.person.findFirst({ where: { id: personId, userId } });
    if (!person) {
      return res.status(404).json({ error: 'الشخص غير موجود.' });
    }

    const amountInCents = Math.round(parseFloat(amount) * 100);

    const settlement = await prisma.debtSettlement.create({
      data: {
        userId,
        personId,
        amount: amountInCents,
        notes: notes || null,
        receiptId: receiptId || null,
        walletId: walletId ? parseInt(walletId) : null
      },
      include: { person: true }
    });

    // Update wallet balance if selected
    if (walletId) {
      await prisma.wallet.update({
        where: { id: parseInt(walletId) },
        data: { balance: { increment: amountInCents } }
      });
    }

    res.status(201).json({ settlement: formatSettlement(settlement) });
  } catch (err) {
    console.error('createSettlement error:', err);
    res.status(500).json({ error: 'فشل تسجيل التسوية.' });
  }
};

// GET /api/settlements - List all settlements
exports.listSettlements = async (req, res) => {
  try {
    const userId = req.userId;
    const { personId } = req.query;

    const settlements = await prisma.debtSettlement.findMany({
      where: {
        userId,
        ...(personId && { personId: parseInt(personId) })
      },
      include: { person: true, receipt: { select: { storeName: true, date: true } } },
      orderBy: { date: 'desc' }
    });

    res.json({ settlements: settlements.map(formatSettlement) });
  } catch (err) {
    console.error('listSettlements error:', err);
    res.status(500).json({ error: 'فشل تحميل التسويات.' });
  }
};

// DELETE /api/settlements/:id - Delete a settlement
exports.deleteSettlement = async (req, res) => {
  try {
    const userId = req.userId;
    const id = parseInt(req.params.id);

    const settlement = await prisma.debtSettlement.findFirst({ where: { id, userId } });
    if (!settlement) {
      return res.status(404).json({ error: 'التسوية غير موجودة.' });
    }

    // Reverse wallet balance update
    if (settlement.walletId) {
      await prisma.wallet.update({
        where: { id: settlement.walletId },
        data: { balance: { decrement: settlement.amount } }
      });
    }

    await prisma.debtSettlement.delete({ where: { id } });
    res.json({ message: 'تم حذف التسوية بنجاح.' });
  } catch (err) {
    console.error('deleteSettlement error:', err);
    res.status(500).json({ error: 'فشل حذف التسوية.' });
  }
};
