const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { convertCurrency } = require('../services/currency.service');

// Helper to convert DB wallet (cents) to API response (decimal)
const formatWallet = (wallet) => ({
  ...wallet,
  balance: parseFloat((wallet.balance / 100).toFixed(2))
});

// GET /api/wallets - List user's wallets
exports.listWallets = async (req, res) => {
  try {
    const userId = req.userId;
    let wallets = await prisma.wallet.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' }
    });

    if (wallets.length === 0) {
      await prisma.wallet.createMany({
        data: [
          { userId, name: 'نقدي (Cash)', type: 'CASH', balance: 0, color: '#4CAF50' },
          { userId, name: 'الحساب البنكي', type: 'BANK', balance: 0, color: '#4CC9F0' }
        ]
      });
      wallets = await prisma.wallet.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' }
      });
    }

    res.json({ wallets: wallets.map(formatWallet) });
  } catch (err) {
    console.error('listWallets error:', err);
    res.status(500).json({ error: 'فشل تحميل قائمة المحافظ.' });
  }
};

// POST /api/wallets - Create a new wallet
exports.createWallet = async (req, res) => {
  try {
    const userId = req.userId;
    const { name, type, balance, color } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'اسم المحفظة مطلوب.' });
    }

    const wallet = await prisma.wallet.create({
      data: {
        userId,
        name: name.trim(),
        type: type || 'CASH',
        balance: Math.round((parseFloat(balance) || 0) * 100),
        color: color || '#4CC9F0'
      }
    });

    res.status(201).json({ wallet: formatWallet(wallet) });
  } catch (err) {
    console.error('createWallet error:', err);
    res.status(500).json({ error: 'فشل إنشاء المحفظة.' });
  }
};

// PUT /api/wallets/:id - Update a wallet
exports.updateWallet = async (req, res) => {
  try {
    const userId = req.userId;
    const walletId = parseInt(req.params.id);
    const { name, type, balance, color } = req.body;

    const wallet = await prisma.wallet.findFirst({ where: { id: walletId, userId } });
    if (!wallet) {
      return res.status(404).json({ error: 'المحفظة غير موجودة.' });
    }

    const updated = await prisma.wallet.update({
      where: { id: walletId },
      data: {
        ...(name && { name: name.trim() }),
        ...(type && { type }),
        ...(balance !== undefined && { balance: Math.round(parseFloat(balance) * 100) }),
        ...(color && { color })
      }
    });

    res.json({ wallet: formatWallet(updated) });
  } catch (err) {
    console.error('updateWallet error:', err);
    res.status(500).json({ error: 'فشل تحديث بيانات المحفظة.' });
  }
};

// DELETE /api/wallets/:id - Delete a wallet
exports.deleteWallet = async (req, res) => {
  try {
    const userId = req.userId;
    const walletId = parseInt(req.params.id);

    const wallet = await prisma.wallet.findFirst({ where: { id: walletId, userId } });
    if (!wallet) {
      return res.status(404).json({ error: 'المحفظة غير موجودة.' });
    }

    // Check if user has only one wallet
    const count = await prisma.wallet.count({ where: { userId } });
    if (count <= 1) {
      return res.status(400).json({ error: 'يجب أن تحتوي محفظتك على الأقل على محفظة واحدة نشطة.' });
    }

    await prisma.wallet.delete({ where: { id: walletId } });
    res.json({ message: 'تم حذف المحفظة بنجاح.' });
  } catch (err) {
    console.error('deleteWallet error:', err);
    res.status(500).json({ error: 'فشل حذف المحفظة.' });
  }
};

// POST /api/wallets/:id/transactions - Create a manual deposit/withdrawal/adjustment
exports.createWalletTransaction = async (req, res) => {
  try {
    const userId = req.userId;
    const walletId = parseInt(req.params.id);
    const { amount, description, date } = req.body;

    if (!description?.trim() || amount === undefined || isNaN(parseFloat(amount))) {
      return res.status(400).json({ error: 'الوصف والمبلغ مطلوبان وقيم صحيحة.' });
    }

    const wallet = await prisma.wallet.findFirst({ where: { id: walletId, userId } });
    if (!wallet) {
      return res.status(404).json({ error: 'المحفظة غير موجودة.' });
    }

    const amountInCents = Math.round(parseFloat(amount) * 100);

    const transaction = await prisma.walletTransaction.create({
      data: {
        walletId,
        amount: amountInCents,
        description: description.trim(),
        date: date ? new Date(date) : new Date()
      }
    });

    // Update wallet balance
    const updatedWallet = await prisma.wallet.update({
      where: { id: walletId },
      data: { balance: { increment: amountInCents } }
    });

    res.status(201).json({
      message: 'تم تسجيل العملية وتحديث رصيد المحفظة.',
      transaction: {
        ...transaction,
        amount: parseFloat((transaction.amount / 100).toFixed(2))
      },
      wallet: formatWallet(updatedWallet)
    });
  } catch (err) {
    console.error('createWalletTransaction error:', err);
    res.status(500).json({ error: 'فشل تسجيل العملية في المحفظة.' });
  }
};

// PUT /api/wallets/:id/transactions/:txId - Edit a manual transaction
exports.updateWalletTransaction = async (req, res) => {
  try {
    const userId = req.userId;
    const walletId = parseInt(req.params.id);
    const txId = parseInt(req.params.txId);
    const { amount, description, date } = req.body;

    const wallet = await prisma.wallet.findFirst({ where: { id: walletId, userId } });
    if (!wallet) {
      return res.status(404).json({ error: 'المحفظة غير موجودة.' });
    }

    const tx = await prisma.walletTransaction.findFirst({ where: { id: txId, walletId } });
    if (!tx) {
      return res.status(404).json({ error: 'العملية غير موجودة.' });
    }

    const newAmountInCents = Math.round(parseFloat(amount) * 100);
    const oldAmountInCents = tx.amount;
    const diff = newAmountInCents - oldAmountInCents;

    const updatedTx = await prisma.walletTransaction.update({
      where: { id: txId },
      data: {
        amount: newAmountInCents,
        description: description.trim(),
        date: date ? new Date(date) : tx.date
      }
    });

    // Adjust wallet balance by the difference
    const updatedWallet = await prisma.wallet.update({
      where: { id: walletId },
      data: { balance: { increment: diff } }
    });

    res.json({
      message: 'تم تعديل العملية وتحديث الرصيد.',
      transaction: {
        ...updatedTx,
        amount: parseFloat((updatedTx.amount / 100).toFixed(2))
      },
      wallet: formatWallet(updatedWallet)
    });
  } catch (err) {
    console.error('updateWalletTransaction error:', err);
    res.status(500).json({ error: 'فشل تعديل العملية.' });
  }
};

// DELETE /api/wallets/:id/transactions/:txId - Delete a manual transaction
exports.deleteWalletTransaction = async (req, res) => {
  try {
    const userId = req.userId;
    const walletId = parseInt(req.params.id);
    const txId = parseInt(req.params.txId);

    const wallet = await prisma.wallet.findFirst({ where: { id: walletId, userId } });
    if (!wallet) {
      return res.status(404).json({ error: 'المحفظة غير موجودة.' });
    }

    const tx = await prisma.walletTransaction.findFirst({ where: { id: txId, walletId } });
    if (!tx) {
      return res.status(404).json({ error: 'العملية غير موجودة.' });
    }

    // Reverse the amount from wallet balance
    await prisma.wallet.update({
      where: { id: walletId },
      data: { balance: { decrement: tx.amount } }
    });

    await prisma.walletTransaction.delete({ where: { id: txId } });

    res.json({ message: 'تم حذف العملية وتصحيح الرصيد.' });
  } catch (err) {
    console.error('deleteWalletTransaction error:', err);
    res.status(500).json({ error: 'فشل حذف العملية.' });
  }
};


// GET /api/wallets/:id/transactions - Get a unified statement of transactions for this wallet
exports.listWalletTransactions = async (req, res) => {
  try {
    const userId = req.userId;
    const walletId = parseInt(req.params.id);

    const wallet = await prisma.wallet.findFirst({ where: { id: walletId, userId } });
    if (!wallet) {
      return res.status(404).json({ error: 'المحفظة غير موجودة.' });
    }

    // 1. Fetch manual transactions
    const manualTxs = await prisma.walletTransaction.findMany({
      where: { walletId },
      orderBy: { date: 'desc' }
    });

    // 2. Fetch receipts paid from this wallet (either primary or secondary)
    const primaryReceipts = await prisma.receipt.findMany({
      where: { walletId, payerType: 'USER' },
      orderBy: { date: 'desc' }
    });

    const secondaryReceipts = await prisma.receipt.findMany({
      where: { secondaryWalletId: walletId, payerType: 'USER' },
      orderBy: { date: 'desc' }
    });

    // 3. Fetch settlements through this wallet
    const settlements = await prisma.debtSettlement.findMany({
      where: { walletId },
      include: { person: { select: { name: true } } },
      orderBy: { date: 'desc' }
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { baseCurrency: true }
    });
    const baseCurrency = user?.baseCurrency || 'SAR';

    const primaryReceiptsPromises = primaryReceipts.map(async (r) => {
      const primaryDeducted = r.total - (r.secondaryWalletAmount || 0);
      let primaryDeductedInBase = primaryDeducted;
      if (r.currency !== baseCurrency) {
        primaryDeductedInBase = Math.round(await convertCurrency(primaryDeducted, r.currency, baseCurrency));
      }
      return {
        id: `receipt-primary-${r.id}`,
        amount: parseFloat((-primaryDeductedInBase / 100).toFixed(2)),
        description: r.storeName,
        date: r.date,
        type: 'RECEIPT'
      };
    });

    const secondaryReceiptsPromises = secondaryReceipts.map(async (r) => {
      const secondaryDeducted = r.secondaryWalletAmount || 0;
      let secondaryDeductedInBase = secondaryDeducted;
      if (r.currency !== baseCurrency) {
        secondaryDeductedInBase = Math.round(await convertCurrency(secondaryDeducted, r.currency, baseCurrency));
      }
      return {
        id: `receipt-secondary-${r.id}`,
        amount: parseFloat((-secondaryDeductedInBase / 100).toFixed(2)),
        description: `${r.storeName} (دفع جزئي)`,
        date: r.date,
        type: 'RECEIPT'
      };
    });

    const primaryLedgerItems = await Promise.all(primaryReceiptsPromises);
    const secondaryLedgerItems = await Promise.all(secondaryReceiptsPromises);

    // 4. Combine into a unified ledger statement
    const ledger = [
      ...manualTxs.map(t => ({
        id: `manual-${t.id}`,
        amount: parseFloat((t.amount / 100).toFixed(2)),
        description: t.description,
        date: t.date,
        type: 'MANUAL'
      })),
      ...primaryLedgerItems,
      ...secondaryLedgerItems,
      ...settlements.map(s => ({
        id: `settlement-${s.id}`,
        amount: parseFloat((s.amount / 100).toFixed(2)), // Positive if user received from contact, negative if user paid contact
        description: s.notes || (s.amount > 0 ? `استلام دفعة من ${s.person?.name}` : `سداد دفعة لـ ${s.person?.name}`),
        date: s.date,
        type: 'SETTLEMENT'
      }))
    ];

    // Sort by date descending
    ledger.sort((a, b) => new Date(b.date) - new Date(a.date));

    let totalIn = 0;
    let totalOut = 0;
    ledger.forEach(item => {
      if (item.amount > 0) totalIn += item.amount;
      else totalOut += Math.abs(item.amount);
    });

    res.json({
      wallet: formatWallet(wallet),
      ledger,
      totalIn: parseFloat(totalIn.toFixed(2)),
      totalOut: parseFloat(totalOut.toFixed(2))
    });
  } catch (err) {
    console.error('listWalletTransactions error:', err);
    res.status(500).json({ error: 'فشل تحميل كشف حساب المحفظة.' });
  }
};
