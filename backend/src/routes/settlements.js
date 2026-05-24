const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  createSettlement,
  listSettlements,
  deleteSettlement
} = require('../controllers/settlements.controller');

router.use(authMiddleware);

router.get('/', listSettlements);
router.post('/', createSettlement);
router.delete('/:id', deleteSettlement);

module.exports = router;
