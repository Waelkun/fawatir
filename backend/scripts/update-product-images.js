const path = require('path');
// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const prisma = require('../src/config/db');
const aiService = require('../src/services/ai.service');

async function main() {
  console.log('🔄 Starting update-product-images migration script...');

  const products = await prisma.product.findMany();
  console.log(`📦 Found ${products.length} products in the database.`);

  let updatedCount = 0;
  for (const product of products) {
    if (!product.imageUrl) {
      console.log(`🔍 Resolving image for product: "${product.name}"...`);
      try {
        const keyword = await aiService.translateProductToEnglishKeyword(product.name);
        const lockId = Math.floor(Math.random() * 10000) + 1;
        const imageUrl = `https://loremflickr.com/320/240/${keyword}?lock=${lockId}`;

        await prisma.product.update({
          where: { id: product.id },
          data: { imageUrl }
        });

        console.log(`✅ Updated "${product.name}" with image URL: ${imageUrl}`);
        updatedCount++;
      } catch (err) {
        console.error(`❌ Failed to update product "${product.name}":`, err.message);
      }
    } else {
      console.log(`⏭️ Product "${product.name}" already has an image: ${product.imageUrl}`);
    }
  }

  console.log(`🎉 Migration finished. Updated ${updatedCount} products.`);
}

main()
  .catch((e) => {
    console.error('❌ Migration failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
