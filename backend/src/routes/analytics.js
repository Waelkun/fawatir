const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const authMiddleware = require('../middleware/auth');

router.get('/dashboard', authMiddleware, analyticsController.getDashboardData);
router.get('/trends', authMiddleware, analyticsController.getSpendingTrends);
router.post('/insights/refresh', authMiddleware, analyticsController.refreshAIInsights);

module.exports = router;
