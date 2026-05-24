const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/simple-login', authController.simpleLogin);
router.get('/profile', authMiddleware, authController.getProfile);

module.exports = router;
