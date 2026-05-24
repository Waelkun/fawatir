const express = require('express');
const router = express.Router();
const currencyController = require('../controllers/currency.controller');
const authMiddleware = require('../middleware/auth');

router.put('/base', authMiddleware, currencyController.updateBaseCurrency);
router.post('/rates/refresh', authMiddleware, currencyController.forceRefreshRates);

module.exports = router;
