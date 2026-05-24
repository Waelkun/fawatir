require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { fetchAndCacheRates } = require('./services/currency.service');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve receipt images statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Log requests in development
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });
}

// Bind Route Modules
app.use('/api/auth', require('./routes/auth'));
app.use('/api/receipts', require('./routes/receipts'));
app.use('/api/products', require('./routes/products'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/currency', require('./routes/currency'));
app.use('/api/people', require('./routes/people'));
app.use('/api/settlements', require('./routes/settlements'));
app.use('/api/wallets', require('./routes/wallets'));


// Root Endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'AI Expense Tracker API',
    version: '1.0.0',
    status: 'Running',
    aiEngine: 'Gemini 1.5 Flash'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'حدث خطأ داخلي في الخادم.'
  });
});

// Start Server
app.listen(PORT, async () => {
  console.log(`=============================================`);
  console.log(`🚀 Serever successfully started on port ${PORT}`);
  console.log(`🔗 API Base: http://localhost:${PORT}`);
  console.log(`=============================================`);

  // ── Auto-seed: ensure developer user always exists ──────────────
  try {
    const prisma = require('./config/db');
    const bcrypt = require('bcryptjs');

    const existingUser = await prisma.user.findUnique({ where: { email: 'alex@fintech.ai' } });
    if (!existingUser) {
      console.log('⚠️  Developer user missing. Running auto-seed...');
      const hashedPassword = await bcrypt.hash('alexsterling', 10);
      const user = await prisma.user.create({
        data: {
          email: 'alex@fintech.ai',
          password: hashedPassword,
          name: 'أليكس ستيرلينغ',
          baseCurrency: 'SAR'
        }
      });
      console.log('✅ Developer user created automatically (alex@fintech.ai).');

      // Seed default wallets
      await prisma.wallet.createMany({
        data: [
          { userId: user.id, name: 'نقدي (Cash)', type: 'CASH', balance: 500000, color: '#4CAF50' },
          { userId: user.id, name: 'الحساب البنكي', type: 'BANK', balance: 1000000, color: '#4CC9F0' }
        ]
      });
      console.log('✅ Default wallets created automatically.');
    } else {
      // Ensure wallets exist even if user was already present
      const walletCount = await prisma.wallet.count({ where: { userId: existingUser.id } });
      if (walletCount === 0) {
        await prisma.wallet.createMany({
          data: [
            { userId: existingUser.id, name: 'نقدي (Cash)', type: 'CASH', balance: 500000, color: '#4CAF50' },
            { userId: existingUser.id, name: 'الحساب البنكي', type: 'BANK', balance: 1000000, color: '#4CC9F0' }
          ]
        });
        console.log('✅ Default wallets created automatically for existing user.');
      }
    }
  } catch (seedErr) {
    console.warn('Auto-seed warning:', seedErr.message);
  }

  // Prefetch and cache conversion rates on startup
  try {
    console.log('Prefetching exchange rates cache...');
    await fetchAndCacheRates();
  } catch (err) {
    console.warn('Failed to prefetch exchange rates on startup, will use fallback values:', err.message);
  }
});
