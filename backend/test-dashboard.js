const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Mocks
const req = { userId: 2 };
const res = {
  json: (data) => console.log('SUCCESS JSON:', JSON.stringify(data, null, 2)),
  status: (code) => ({
    json: (data) => console.log(`ERROR ${code}:`, data)
  })
};

// Simplified analytics controller logic to find the crash
async function run() {
  try {
    const userId = req.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const baseCurrency = user.baseCurrency || 'SAR';

    const receipts = await prisma.receipt.findMany({
      where: { userId, isDebt: false },
      orderBy: { date: 'desc' }
    });
    
    // ... we don't need to run everything, let's just require the controller
    const analyticsController = require('./src/controllers/analytics.controller');
    await analyticsController.getDashboardData(req, res);
  } catch (err) {
    console.error('CRASH:', err);
  } finally {
    prisma.$disconnect();
  }
}

run();
