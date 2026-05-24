const prisma = require('../config/db');
const currencyService = require('../services/currency.service');

/**
 * Updates user base currency setting (e.g. SAR, USD, EUR)
 */
const updateBaseCurrency = async (req, res) => {
  const userId = req.userId;
  const { currency } = req.body;

  if (!currency) {
    return res.status(400).json({ error: 'العملة الأساسية مطلوبة.' });
  }

  const cleanCurrency = currency.toUpperCase().trim();
  const allowedCurrencies = ['USD', 'SAR', 'EUR', 'TRY'];

  if (!allowedCurrencies.includes(cleanCurrency)) {
    return res.status(400).json({ error: 'العملة المحددة غير مدعومة حالياً. العملات المدعومة: SAR, USD, EUR, TRY' });
  }

  try {
    // 1. Get old baseCurrency before updating
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { baseCurrency: true }
    });
    const oldCurrency = user?.baseCurrency || 'SAR';

    if (oldCurrency !== cleanCurrency) {
      // 2. Fetch all user wallets
      const wallets = await prisma.wallet.findMany({
        where: { userId }
      });

      // 3. Convert and update each wallet balance
      for (const wallet of wallets) {
        const convertedBalance = Math.round(
          await currencyService.convertCurrency(wallet.balance, oldCurrency, cleanCurrency)
        );
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: { balance: convertedBalance }
        });
      }
    }

    // 4. Update user baseCurrency
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { baseCurrency: cleanCurrency },
      select: {
        id: true,
        email: true,
        name: true,
        baseCurrency: true
      }
    });

    res.json({
      message: 'تم تحديث عملتك الأساسية وتحويل أرصدة المحافظ بنجاح.',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating user base currency:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء حفظ تفضيلات العملة وتحويل أرصدة المحافظ.' });
  }
};

/**
 * Force refresh exchange rates from public API
 */
const forceRefreshRates = async (req, res) => {
  try {
    const success = await currencyService.fetchAndCacheRates();
    if (success) {
      res.json({ message: 'تم تحديث أسعار الصرف التاريخية بنجاح.' });
    } else {
      res.status(500).json({ error: 'فشل جلب أسعار الصرف من المزود الخارجي.' });
    }
  } catch (error) {
    res.status(500).json({ error: 'حدث خطأ في السيرفر أثناء تحديث أسعار الصرف.' });
  }
};

module.exports = {
  updateBaseCurrency,
  forceRefreshRates
};
