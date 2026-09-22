const prisma = require('../config/db');
const aiService = require('../services/ai.service');
const ocrService = require('../services/ocr.service');
const path = require('path');
const fs = require('fs');
const { convertCurrency } = require('../services/currency.service');

const formatReceiptFromDb = (receipt) => {
  if (!receipt) return null;
  return {
    ...receipt,
    total: parseFloat((receipt.total / 100).toFixed(2)),
    tax: parseFloat((receipt.tax / 100).toFixed(2)),
    discount: parseFloat((receipt.discount / 100).toFixed(2)),
    secondaryWalletAmount: receipt.secondaryWalletAmount ? parseFloat((receipt.secondaryWalletAmount / 100).toFixed(2)) : 0,
    items: receipt.items ? receipt.items.map(item => ({
      ...item,
      price: parseFloat((item.price / 100).toFixed(2)),
      discount: parseFloat((item.discount / 100).toFixed(2)),
      total: parseFloat((item.total / 100).toFixed(2)),
      splits: item.splits ? item.splits.map(split => ({
        ...split,
        amount: parseFloat((split.amount / 100).toFixed(2))
      })) : []
    })) : []
  };
};

// Helper to detect true mime type from file headers (magic numbers)
const detectMimeType = (filePath) => {
  try {
    const buffer = Buffer.alloc(12);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 12, 0);
    fs.closeSync(fd);

    // Check PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return 'image/png';
    }
    // Check JPEG
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return 'image/jpeg';
    }
    // Check PDF
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return 'application/pdf';
    }
    // Check HEIC/HEIF
    const ftyp = buffer.toString('ascii', 4, 8);
    const brand = buffer.toString('ascii', 8, 12);
    if (ftyp === 'ftyp' && (brand === 'heic' || brand === 'heix' || brand === 'hevc' || brand === 'mif1' || brand === 'msf1')) {
      return 'image/heic';
    }

    return 'image/jpeg';
  } catch (e) {
    return 'image/jpeg';
  }
};

/**
 * Uploads a receipt image, preprocesses it, sends to Gemini for OCR,
 * normalizes products, and saves the transaction.
 */
const scanReceipt = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'لم يتم رفع أي ملف فاتورة.' });
  }

  const userId = req.userId;
  const originalPath = req.file.path;
  let enhancedPath = originalPath;

  try {
    // 1. Preprocess image using Sharp (grayscale, normalize contrast, sharpen)
    enhancedPath = await ocrService.preprocessImage(originalPath);

    // Detect actual mimetype of the file we are sending to Gemini
    const actualMimeType = detectMimeType(enhancedPath);

    // Get existing products first to feed their names to Gemini OCR prompt
    const existingProducts = await prisma.product.findMany({
      where: { userId },
      include: { aliases: true }
    });

    // 2. Parse receipt using Gemini 1.5 Flash
    const parsedData = await aiService.parseReceipt(enhancedPath, actualMimeType, existingProducts);

    // 3. Process products and build alias memory
    const savedItems = [];
    const localProducts = [...existingProducts];

    for (const item of (parsedData.items || [])) {
      const origName = (item.originalName || item.normalizedName || 'منتج غير محدد').trim();
      const normName = item.normalizedName ? item.normalizedName.trim() : origName;
      const cat = item.category || 'أخرى';
      const desc = item.description || 'منتج استهلاكي.';

      // Find if this product or its alias already exists
      let product = localProducts.find(p => 
        p.name.toLowerCase() === normName.toLowerCase() || 
        (p.aliases && p.aliases.some(a => a.alias.toLowerCase() === normName.toLowerCase()))
      );

      if (!product) {
        // Create new product
        product = await prisma.product.create({
          data: {
            userId,
            name: normName,
            category: cat,
            description: desc
          },
          include: { aliases: true }
        });
        
        localProducts.push(product);

        // Save alias for normalized name
        await prisma.productAlias.create({
          data: { productId: product.id, alias: normName }
        });
      }

      // Add original scanned name to aliases if it's different and not already existing
      if (origName !== product.name) {
        const aliasExists = await prisma.productAlias.findFirst({
          where: { productId: product.id, alias: origName }
        });
        if (!aliasExists) {
          await prisma.productAlias.create({
            data: { productId: product.id, alias: origName }
          });
        }
      }

      savedItems.push({
        productId: product.id,
        originalName: origName,
        quantity: item.quantity || 1,
        price: Math.round((item.price || 0) * 100),
        discount: Math.round((item.discount || 0) * 100),
        total: Math.round((item.total || ((item.quantity || 1) * (item.price || 0)) - (item.discount || 0)) * 100)
      });
    }

    // 4. Calculate confidence status
    const itemsSum = savedItems.reduce((acc, curr) => acc + curr.total, 0);
    const parsedTotalInCents = Math.round(parsedData.total * 100);
    const taxInCents = Math.round((parsedData.tax || 0) * 100);
    const discountInCents = Math.round((parsedData.discount || 0) * 100);
    const mathDiff = Math.abs(itemsSum + taxInCents - discountInCents - parsedTotalInCents);
    
    let status = 'APPROVED';
    if (parsedData.confidence < 0.82 || (mathDiff / 100) > 1.0) {
      status = 'NEEDS_REVIEW';
    }

    // Get user's default wallet
    const defaultWallet = await prisma.wallet.findFirst({ where: { userId } });

    // Save image path relative to root to serve statically
    const relativeEnhancedPath = path.relative(path.join(__dirname, '../..'), enhancedPath).replace(/\\/g, '/');

    // 5. Save Receipt to DB
    const receiptDate = !isNaN(new Date(parsedData.date).getTime()) ? new Date(parsedData.date) : new Date();

    const receipt = await prisma.receipt.create({
      data: {
        userId,
        storeName: parsedData.storeName || 'متجر غير معروف',
        date: receiptDate,
        total: parsedTotalInCents,
        currency: parsedData.currency || 'SAR',
        tax: taxInCents,
        discount: discountInCents,
        imageUrl: relativeEnhancedPath,
        confidence: parsedData.confidence,
        status,
        payerType: 'USER',
        walletId: defaultWallet ? defaultWallet.id : null,
        items: {
          create: savedItems
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

    // Deduct from wallet balance if user paid
    if (defaultWallet && parsedTotalInCents > 0) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { baseCurrency: true }
      });
      const baseCurrency = user?.baseCurrency || 'SAR';
      const receiptCurrency = parsedData.currency || 'SAR';

      let deductionInBase = parsedTotalInCents;
      if (receiptCurrency !== baseCurrency) {
        deductionInBase = Math.round(await convertCurrency(parsedTotalInCents, receiptCurrency, baseCurrency));
      }

      await prisma.wallet.update({
        where: { id: defaultWallet.id },
        data: { balance: { decrement: deductionInBase } }
      });
    }

    const formattedReceipt = formatReceiptFromDb(receipt);
    formattedReceipt.aiProvider = parsedData.aiProvider || 'Google Gemini';
    formattedReceipt.aiModel = parsedData.aiModel || 'gemini-2.5-flash';

    res.status(201).json({
      message: status === 'APPROVED' ? 'تم معالجة وحفظ الفاتورة تلقائياً.' : 'تمت القراءة وتتطلب الفاتورة مراجعة يدوية.',
      receipt: formattedReceipt
    });

  } catch (error) {
    console.error('Error scanning receipt:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء معالجة الفاتورة: ' + error.message });
  }
};

/**
 * Updates a receipt's details (typically called from the manual review screen)
 */
const updateReceipt = async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;
  const { 
    storeName, date, total, currency, tax, discount, items, 
    payerType, payerPersonId, walletId, secondaryWalletId, secondaryWalletAmount, payerName,
    isDebt, debtType, debtPerson, isSettled
  } = req.body;

  try {
    const existingReceipt = await prisma.receipt.findFirst({
      where: { id: parseInt(id), userId }
    });

    if (!existingReceipt) {
      return res.status(404).json({ error: 'الفاتورة غير موجودة أو لا تملك صلاحية تعديلها.' });
    }

    // 1. Refund the old total to the old wallet(s) if user paid previously
    if (existingReceipt.payerType === 'USER') {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { baseCurrency: true }
      });
      const baseCurrency = user?.baseCurrency || 'SAR';
      const oldCurrency = existingReceipt.currency || 'SAR';

      if (existingReceipt.walletId) {
        const primaryRefund = existingReceipt.total - (existingReceipt.secondaryWalletAmount || 0);
        let primaryRefundInBase = primaryRefund;
        if (oldCurrency !== baseCurrency) {
          primaryRefundInBase = Math.round(await convertCurrency(primaryRefund, oldCurrency, baseCurrency));
        }

        await prisma.wallet.update({
          where: { id: existingReceipt.walletId },
          data: { balance: { increment: primaryRefundInBase } }
        });
      }
      if (existingReceipt.secondaryWalletId && existingReceipt.secondaryWalletAmount > 0) {
        let secondaryRefundInBase = existingReceipt.secondaryWalletAmount;
        if (oldCurrency !== baseCurrency) {
          secondaryRefundInBase = Math.round(await convertCurrency(existingReceipt.secondaryWalletAmount, oldCurrency, baseCurrency));
        }

        await prisma.wallet.update({
          where: { id: existingReceipt.secondaryWalletId },
          data: { balance: { increment: secondaryRefundInBase } }
        });
      }
    }

    const totalInCents = Math.round(parseFloat(total || 0) * 100);
    const taxInCents = Math.round(parseFloat(tax || 0) * 100);
    const discountInCents = Math.round(parseFloat(discount || 0) * 100);

    let secondaryWalletAmountInCents = 0;
    const secWalletId = secondaryWalletId ? parseInt(secondaryWalletId) : null;
    if (secWalletId && secondaryWalletAmount) {
      secondaryWalletAmountInCents = Math.round(parseFloat(secondaryWalletAmount) * 100);
      if (secondaryWalletAmountInCents > totalInCents) {
        secondaryWalletAmountInCents = totalInCents;
      }
    }

    // 2. Update receipt main info
    const updatedReceipt = await prisma.receipt.update({
      where: { id: parseInt(id) },
      data: {
        storeName,
        date: new Date(date),
        total: totalInCents,
        currency,
        tax: taxInCents,
        discount: discountInCents,
        status: 'APPROVED',
        payerType: payerType || 'USER',
        payerPersonId: payerPersonId ? parseInt(payerPersonId) : null,
        walletId: walletId ? parseInt(walletId) : null,
        secondaryWalletId: secWalletId,
        secondaryWalletAmount: secondaryWalletAmountInCents,
        payerName: payerName || null,
        isDebt: isDebt !== undefined ? !!isDebt : false,
        debtType: debtType || null,
        debtPerson: debtPerson || null,
        isSettled: isSettled !== undefined ? !!isSettled : false
      }
    });

    // 3. Deduct the new total from the wallets if user paid
    if ((payerType || 'USER') === 'USER') {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { baseCurrency: true }
      });
      const baseCurrency = user?.baseCurrency || 'SAR';
      const newCurrency = currency || 'SAR';

      if (walletId) {
        const primaryDeduct = totalInCents - secondaryWalletAmountInCents;
        let primaryDeductInBase = primaryDeduct;
        if (newCurrency !== baseCurrency) {
          primaryDeductInBase = Math.round(await convertCurrency(primaryDeduct, newCurrency, baseCurrency));
        }

        await prisma.wallet.update({
          where: { id: parseInt(walletId) },
          data: { balance: { decrement: primaryDeductInBase } }
        });
      }
      if (secWalletId && secondaryWalletAmountInCents > 0) {
        let secondaryDeductInBase = secondaryWalletAmountInCents;
        if (newCurrency !== baseCurrency) {
          secondaryDeductInBase = Math.round(await convertCurrency(secondaryWalletAmountInCents, newCurrency, baseCurrency));
        }

        await prisma.wallet.update({
          where: { id: secWalletId },
          data: { balance: { decrement: secondaryDeductInBase } }
        });
      }
    }

    // Handle items update
    if (items && Array.isArray(items)) {
      // Clear existing items
      await prisma.receiptItem.deleteMany({
        where: { receiptId: parseInt(id) }
      });

      // Insert updated items
      for (const item of items) {
        let product = await prisma.product.findFirst({
          where: { userId, id: item.productId }
        });

        if (product && item.originalName && item.originalName.trim() !== product.name) {
          const aliasExists = await prisma.productAlias.findFirst({
            where: { productId: product.id, alias: item.originalName.trim() }
          });
          if (!aliasExists) {
            await prisma.productAlias.create({
              data: { productId: product.id, alias: item.originalName.trim() }
            });
          }
        }

        const priceInCents = Math.round(parseFloat(item.price || 0) * 100);
        const itemDiscountInCents = Math.round(parseFloat(item.discount || 0) * 100);
        const itemTotalInCents = Math.round(parseFloat(item.total || 0) * 100);

        const createdItem = await prisma.receiptItem.create({
          data: {
            receiptId: parseInt(id),
            productId: item.productId,
            originalName: item.originalName,
            quantity: parseFloat(item.quantity || 1),
            price: priceInCents,
            discount: itemDiscountInCents,
            total: itemTotalInCents,
            splitMethod: item.splitMethod || 'NONE'
          }
        });

        // Save splits if provided
        if (item.splits && Array.isArray(item.splits) && item.splits.length > 0) {
          for (const split of item.splits) {
            await prisma.receiptItemSplit.create({
              data: {
                receiptItemId: createdItem.id,
                personId: split.personId || null,
                personName: split.personName || 'أنا',
                amount: Math.round(parseFloat(split.amount || 0) * 100),
                ratio: parseFloat(split.ratio || 0),
                isUser: split.isUser || false
              }
            });
          }
        }
      }
    }

    const fullReceipt = await prisma.receipt.findUnique({
      where: { id: parseInt(id) },
      include: {
        items: {
          include: {
            product: true,
            splits: {
              include: { person: { select: { id: true, name: true, color: true, emoji: true } } }
            }
          }
        }
      }
    });

    res.json({
      message: 'تم تحديث الفاتورة والمطابقة بنجاح.',
      receipt: formatReceiptFromDb(fullReceipt)
    });

  } catch (error) {
    console.error('Error updating receipt:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء تعديل بيانات الفاتورة.' });
  }
};

/**
 * Returns user receipts with optional filtering by status (APPROVED, NEEDS_REVIEW) and search
 */
const getReceipts = async (req, res) => {
  const userId = req.userId;
  const { status, search } = req.query;

  try {
    const whereClause = { userId };
    
    if (status) {
      whereClause.status = status;
    }

    if (search) {
      whereClause.OR = [
        { storeName: { contains: search, mode: 'insensitive' } },
        { currency: { contains: search, mode: 'insensitive' } }
      ];
    }

    const receipts = await prisma.receipt.findMany({
      where: whereClause,
      include: {
        items: {
          include: {
            product: {
              select: { name: true, category: true }
            },
            splits: {
              include: { person: { select: { id: true, name: true, color: true, emoji: true } } }
            }
          }
        }
      },
      orderBy: { date: 'desc' }
    });

    res.json({ receipts: receipts.map(formatReceiptFromDb) });
  } catch (error) {
    console.error('Error fetching receipts:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب الفواتير.' });
  }
};

/**
 * Returns a specific receipt by ID
 */
const getReceiptById = async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    const receipt = await prisma.receipt.findFirst({
      where: { id: parseInt(id), userId },
      include: {
        items: {
          include: {
            product: true,
            splits: {
              include: { person: { select: { id: true, name: true, color: true, emoji: true } } }
            }
          }
        }
      }
    });

    if (!receipt) {
      return res.status(404).json({ error: 'الفاتورة غير موجودة.' });
    }

    res.json({ receipt: formatReceiptFromDb(receipt) });
  } catch (error) {
    console.error('Error fetching receipt details:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب تفاصيل الفاتورة.' });
  }
};

/**
 * Deletes a receipt
 */
const deleteReceipt = async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    const receipt = await prisma.receipt.findFirst({
      where: { id: parseInt(id), userId }
    });

    if (!receipt) {
      return res.status(404).json({ error: 'الفاتورة غير موجودة أو لا تملك صلاحية حذفها.' });
    }

    // Refund the wallet if user paid
    if (receipt.payerType === 'USER') {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { baseCurrency: true }
      });
      const baseCurrency = user?.baseCurrency || 'SAR';
      const oldCurrency = receipt.currency || 'SAR';

      if (receipt.walletId) {
        const primaryRefund = receipt.total - (receipt.secondaryWalletAmount || 0);
        let primaryRefundInBase = primaryRefund;
        if (oldCurrency !== baseCurrency) {
          primaryRefundInBase = Math.round(await convertCurrency(primaryRefund, oldCurrency, baseCurrency));
        }

        await prisma.wallet.update({
          where: { id: receipt.walletId },
          data: { balance: { increment: primaryRefundInBase } }
        });
      }
      if (receipt.secondaryWalletId && receipt.secondaryWalletAmount > 0) {
        let secondaryRefundInBase = receipt.secondaryWalletAmount;
        if (oldCurrency !== baseCurrency) {
          secondaryRefundInBase = Math.round(await convertCurrency(receipt.secondaryWalletAmount, oldCurrency, baseCurrency));
        }

        await prisma.wallet.update({
          where: { id: receipt.secondaryWalletId },
          data: { balance: { increment: secondaryRefundInBase } }
        });
      }
    }

    // Delete image if saved locally
    if (receipt.imageUrl) {
      const fullPath = path.join(__dirname, '../..', receipt.imageUrl);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    await prisma.receipt.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'تم حذف الفاتورة بنجاح.' });
  } catch (error) {
    console.error('Error deleting receipt:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء حذف الفاتورة.' });
  }
};

/**
 * Creates a blank manual receipt in the database
 */
const createManualReceipt = async (req, res) => {
  const userId = req.userId;
  const { isDebt, debtType, debtPerson, isSettled, total, currency, storeName, date, notes } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { baseCurrency: true }
    });
    const defaultCurrency = user?.baseCurrency || 'SAR';

    const defaultWallet = await prisma.wallet.findFirst({ where: { userId } });
    const totalInCents = total ? Math.round(parseFloat(total) * 100) : 0;

    const receipt = await prisma.receipt.create({
      data: {
        userId,
        storeName: storeName || (isDebt ? `دين لـ ${debtPerson || 'مجهول'}` : 'فاتورة يدوية جديدة'),
        date: date ? new Date(date) : new Date(),
        total: totalInCents,
        currency: currency || defaultCurrency,
        tax: 0,
        discount: 0,
        confidence: 1.0,
        status: isDebt ? 'APPROVED' : 'NEEDS_REVIEW',
        payerType: 'USER',
        walletId: defaultWallet ? defaultWallet.id : null,
        isDebt: isDebt !== undefined ? !!isDebt : false,
        debtType: debtType || null,
        debtPerson: debtPerson || null,
        isSettled: isSettled !== undefined ? !!isSettled : false
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
      message: isDebt ? 'تم تسجيل الدين بنجاح.' : 'تم إنشاء مسودة فاتورة يدوية.',
      receipt: formatReceiptFromDb(receipt)
    });
  } catch (error) {
    console.error('Error creating manual receipt:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء إنشاء الفاتورة أو الدين.' });
  }
};

module.exports = {
  scanReceipt,
  updateReceipt,
  getReceipts,
  getReceiptById,
  deleteReceipt,
  createManualReceipt
};
