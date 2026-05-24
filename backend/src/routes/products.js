const express = require('express');
const router = express.Router();
const productController = require('../controllers/product.controller');
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/', authMiddleware, productController.getProducts);
router.post('/', authMiddleware, productController.createProduct);
router.post('/generate-description', authMiddleware, productController.generateDescription);
router.post('/manual', authMiddleware, productController.addManualProduct);
router.post('/upload-image', authMiddleware, upload.single('image'), productController.uploadProductImage);
router.get('/:id', authMiddleware, productController.getProductDetails);
router.put('/:id', authMiddleware, productController.updateProduct);

module.exports = router;
