const express = require('express');
const router = express.Router();
const receiptController = require('../controllers/receipt.controller');
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');

router.post('/scan', authMiddleware, upload.single('receipt'), receiptController.scanReceipt);
router.post('/', authMiddleware, receiptController.createManualReceipt);
router.put('/:id', authMiddleware, receiptController.updateReceipt);
router.get('/', authMiddleware, receiptController.getReceipts);
router.get('/:id', authMiddleware, receiptController.getReceiptById);
router.delete('/:id', authMiddleware, receiptController.deleteReceipt);

module.exports = router;
