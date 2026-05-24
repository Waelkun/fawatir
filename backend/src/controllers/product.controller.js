const prisma = require('../config/db');
const aiService = require('../services/ai.service');

/**
 * Returns all normalized products for the current user
 */
const getProducts = async (req, res) => {
  const userId = req.userId;
  const { onlyPurchased } = req.query;
  try {
    const whereClause = { userId };
    if (onlyPurchased === 'true') {
      whereClause.items = { some: {} };
    }
    const products = await prisma.product.findMany({
      where: whereClause,
      include: {
        aliases: true
      },
      orderBy: { name: 'asc' }
    });
    res.json({ products });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب المنتجات.' });
  }
};

/**
 * Generates an AI description for a given product name
 */
const generateDescription = async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'اسم المنتج مطلوب لتوليد الوصف.' });
  }
  try {
    const description = await aiService.generateProductDescription(name);
    res.json({ description });
  } catch (error) {
    res.status(500).json({ error: 'فشل توليد الوصف بالذكاء الاصطناعي.' });
  }
};

/**
 * Creates a manual purchase of a product without scanning a receipt.
 * Automatically wraps it in a virtual "Manual Entry" receipt to maintain transaction history.
 */
const addManualProduct = async (req, res) => {
  const userId = req.userId;
  const { name, price, currency, quantity, category, notes, imageUrl } = req.body;

  if (!name || !price || !currency) {
    return res.status(400).json({ error: 'الاسم، السعر، والعملة حقول مطلوبة.' });
  }

  try {
    // 1. Normalize/find product
    const existingProducts = await prisma.product.findMany({ where: { userId } });
    const normalizedInfo = await aiService.normalizeProductName(name, existingProducts);
    
    let product = existingProducts.find(p => p.name === normalizedInfo.normalizedName);

    if (!product) {
      const description = await aiService.generateProductDescription(normalizedInfo.normalizedName);

      product = await prisma.product.create({
        data: {
          userId,
          name: normalizedInfo.normalizedName,
          category: category || normalizedInfo.category,
          description: notes ? `${description} (${notes})` : description,
          imageUrl: imageUrl || null
        }
      });
      
      // Alias
      await prisma.productAlias.create({
        data: { productId: product.id, alias: normalizedInfo.normalizedName }
      });
    }

    // Add search alias if name is different
    if (name.trim() !== product.name) {
      const aliasExists = await prisma.productAlias.findFirst({
        where: { productId: product.id, alias: name.trim() }
      });
      if (!aliasExists) {
        await prisma.productAlias.create({
          data: { productId: product.id, alias: name.trim() }
        });
      }
    }

    // 2. Create virtual Receipt for this manual transaction
    const itemQty = parseFloat(quantity || 1);
    const itemPrice = parseFloat(price);
    const itemTotal = itemQty * itemPrice;

    const receipt = await prisma.receipt.create({
      data: {
        userId,
        storeName: 'إدخال يدوي',
        date: new Date(),
        total: itemTotal,
        currency: currency.toUpperCase(),
        confidence: 1.0,
        status: 'APPROVED',
        items: {
          create: [{
            productId: product.id,
            originalName: name,
            quantity: itemQty,
            price: itemPrice,
            total: itemTotal
          }]
        }
      },
      include: {
        items: {
          include: {
            product: true
          }
        }
      }
    });

    res.status(201).json({
      message: 'تم إضافة المنتج يدوياً وإدراج العملية في السجلات.',
      receipt
    });

  } catch (error) {
    console.error('Error adding manual product:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء إضافة المنتج يدوياً.' });
  }
};

/**
 * Returns deep analytics for a single product: total spend, buy frequency, min/max/avg price,
 * historical price trends, and spending chart points.
 */
const getProductDetails = async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    const product = await prisma.product.findFirst({
      where: { id: parseInt(id), userId }
    });

    if (!product) {
      return res.status(404).json({ error: 'المنتج غير موجود.' });
    }

    // Get all historical receipt items for this product with splits
    const items = await prisma.receiptItem.findMany({
      where: {
        productId: parseInt(id),
        receipt: { userId }
      },
      include: {
        receipt: {
          include: {
            payerPerson: { select: { name: true, emoji: true } }
          }
        },
        splits: {
          include: {
            person: { select: { emoji: true } }
          }
        }
      },
      orderBy: {
        receipt: { date: 'asc' }
      }
    });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const baseCur = user?.baseCurrency || 'SAR';
    const { convertCurrency } = require('../services/currency.service');

    if (items.length === 0) {
      return res.json({
        product,
        analytics: {
          totalSpend: 0,
          purchaseCount: 0,
          avgPrice: 0,
          maxPrice: 0,
          minPrice: 0,
          lastPurchaseDate: null,
          history: [],
          personBreakdown: [
            { id: 'user', name: 'أنا', emoji: '👤', totalSpend: 0, purchaseCount: 0 }
          ]
        }
      });
    }

    let totalSpendInBase = 0;
    const pricePoints = [];
    const spendPoints = [];
    const historyList = [];

    let maxPriceInBase = 0;
    let minPriceInBase = Number.MAX_VALUE;

    // Person breakdown initialization
    const personBreakdown = {};
    personBreakdown['user'] = { id: 'user', name: 'أنا', emoji: '👤', totalSpend: 0, purchaseCount: 0 };

    for (const item of items) {
      const itemTotalInBase = await convertCurrency(item.total / 100, item.receipt.currency, baseCur);
      const itemPriceInBase = await convertCurrency(item.price / 100, item.receipt.currency, baseCur);

      totalSpendInBase += itemTotalInBase;

      if (itemPriceInBase > maxPriceInBase) maxPriceInBase = itemPriceInBase;
      if (itemPriceInBase < minPriceInBase) minPriceInBase = itemPriceInBase;

      pricePoints.push({
        date: item.receipt.date.toISOString().split('T')[0],
        price: parseFloat((item.price / 100).toFixed(2)),
        currency: item.receipt.currency,
        priceInBase: parseFloat(itemPriceInBase.toFixed(2))
      });

      spendPoints.push({
        date: item.receipt.date.toISOString().split('T')[0],
        spend: parseFloat((item.total / 100).toFixed(2)),
        spendInBase: parseFloat(itemTotalInBase.toFixed(2))
      });

      historyList.push({
        receiptId: item.receiptId,
        storeName: item.receipt.storeName,
        date: item.receipt.date,
        quantity: item.quantity,
        price: parseFloat((item.price / 100).toFixed(2)),
        currency: item.receipt.currency,
        total: parseFloat((item.total / 100).toFixed(2)),
        totalInBase: parseFloat(itemTotalInBase.toFixed(2))
      });

      // Calculate splits / shares breakdown per person
      const splits = item.splits || [];
      if (splits.length === 0) {
        if (item.receipt.payerType === 'USER') {
          personBreakdown['user'].totalSpend += itemTotalInBase;
          personBreakdown['user'].purchaseCount += 1;
        } else if (item.receipt.payerType === 'PERSON' && item.receipt.payerPersonId) {
          const pId = item.receipt.payerPersonId;
          if (!personBreakdown[pId]) {
            const pName = item.receipt.payerPerson?.name || item.receipt.payerName || 'شخص آخر';
            const pEmoji = item.receipt.payerPerson?.emoji || '👤';
            personBreakdown[pId] = { id: pId, name: pName, emoji: pEmoji, totalSpend: 0, purchaseCount: 0 };
          }
          personBreakdown[pId].totalSpend += itemTotalInBase;
          personBreakdown[pId].purchaseCount += 1;
        }
      } else {
        const totalSplits = splits.reduce((sum, s) => sum + s.amount, 0);
        const ratio = totalSplits > 0 ? (item.total / totalSplits) : 1;

        const participantsInItem = new Set();

        for (const split of splits) {
          const splitAmountVal = (split.amount * ratio) / 100;
          const splitAmountInBase = await convertCurrency(splitAmountVal, item.receipt.currency, baseCur);

          if (split.isUser) {
            personBreakdown['user'].totalSpend += splitAmountInBase;
            participantsInItem.add('user');
          } else if (split.personId) {
            const pId = split.personId;
            if (!personBreakdown[pId]) {
              personBreakdown[pId] = { 
                id: pId, 
                name: split.personName, 
                emoji: split.person?.emoji || '👤', 
                totalSpend: 0, 
                purchaseCount: 0 
              };
            }
            personBreakdown[pId].totalSpend += splitAmountInBase;
            participantsInItem.add(pId);
          }
        }

        participantsInItem.forEach(pKey => {
          personBreakdown[pKey].purchaseCount += 1;
        });
      }
    }

    const purchaseCount = items.length;
    const totalUnits = items.reduce((acc, curr) => acc + curr.quantity, 0);
    const avgPrice = totalSpendInBase / (totalUnits || 1);
    const lastPurchaseDate = items[items.length - 1].receipt.date;

    res.json({
      product,
      analytics: {
        totalSpend: parseFloat(totalSpendInBase.toFixed(2)),
        purchaseCount,
        avgPrice: parseFloat(avgPrice.toFixed(2)),
        maxPrice: parseFloat(maxPriceInBase.toFixed(2)),
        minPrice: parseFloat(minPriceInBase.toFixed(2)),
        lastPurchaseDate,
        priceTrends: pricePoints,
        spendTrends: spendPoints,
        history: historyList.reverse(),
        personBreakdown: Object.values(personBreakdown).map(p => ({
          ...p,
          totalSpend: parseFloat(p.totalSpend.toFixed(2))
        }))
      }
    });

  } catch (error) {
    console.error('Error fetching product details:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب تحليلات المنتج.' });
  }
};

const createProduct = async (req, res) => {
  const userId = req.userId;
  const { name, category, description, imageUrl } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'اسم المنتج مطلوب.' });
  }

  try {
    const existing = await prisma.product.findFirst({
      where: { userId, name: { equals: name, mode: 'insensitive' } }
    });

    if (existing) {
      return res.status(400).json({ error: 'هذا المنتج الموحد مسجل بالفعل.' });
    }

    const product = await prisma.product.create({
      data: {
        userId,
        name: name.trim(),
        category: category || 'أخرى',
        description: description || 'منتج استهلاكي.',
        imageUrl: imageUrl || null
      }
    });

    // Create default alias
    await prisma.productAlias.create({
      data: { productId: product.id, alias: name.trim() }
    });

    res.status(201).json({ product });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء إنشاء المنتج.' });
  }
};

const updateProduct = async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;
  const { name, category, description, imageUrl } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'اسم المنتج مطلوب.' });
  }

  try {
    const product = await prisma.product.findFirst({
      where: { id: parseInt(id), userId }
    });

    if (!product) {
      return res.status(404).json({ error: 'المنتج غير موجود.' });
    }

    if (name.trim().toLowerCase() !== product.name.toLowerCase()) {
      const existing = await prisma.product.findFirst({
        where: {
          userId,
          name: { equals: name.trim(), mode: 'insensitive' },
          id: { not: parseInt(id) }
        }
      });
      if (existing) {
        return res.status(400).json({ error: 'هذا الاسم مستخدم بالفعل لمنتج آخر.' });
      }
    }

    const updatedProduct = await prisma.product.update({
      where: { id: parseInt(id) },
      data: {
        name: name.trim(),
        category: category || product.category,
        description: description !== undefined ? description : product.description,
        imageUrl: imageUrl !== undefined ? imageUrl : product.imageUrl
      }
    });

    const aliasExists = await prisma.productAlias.findFirst({
      where: { productId: parseInt(id), alias: name.trim() }
    });
    if (!aliasExists) {
      await prisma.productAlias.create({
        data: { productId: parseInt(id), alias: name.trim() }
      });
    }

    res.json({ message: 'تم تحديث المنتج بنجاح.', product: updatedProduct });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء تعديل المنتج.' });
  }
};

const uploadProductImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'يرجى إرفاق ملف الصورة.' });
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ imageUrl });
  } catch (error) {
    console.error('Error uploading product image:', error);
    res.status(500).json({ error: 'فشل رفع صورة المنتج.' });
  }
};

module.exports = {
  getProducts,
  generateDescription,
  addManualProduct,
  getProductDetails,
  createProduct,
  updateProduct,
  uploadProductImage
};
