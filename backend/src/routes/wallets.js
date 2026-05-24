const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  listWallets,
  createWallet,
  updateWallet,
  deleteWallet,
  createWalletTransaction,
  updateWalletTransaction,
  deleteWalletTransaction,
  listWalletTransactions
} = require('../controllers/wallets.controller');

router.use(authMiddleware);

router.get('/', listWallets);
router.post('/', createWallet);
router.put('/:id', updateWallet);
router.delete('/:id', deleteWallet);
router.post('/:id/transactions', createWalletTransaction);
router.get('/:id/transactions', listWalletTransactions);
router.put('/:id/transactions/:txId', updateWalletTransaction);
router.delete('/:id/transactions/:txId', deleteWalletTransaction);

module.exports = router;
