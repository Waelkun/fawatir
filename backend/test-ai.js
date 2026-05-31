require('dotenv').config();
const aiService = require('./src/services/ai.service');

async function run() {
  try {
    const result = await aiService.parseReceipt('test-image.png', 'image/png', []);
    console.log(result);
  } catch (e) {
    console.error('ERROR:', e.message);
  }
}
run();
