const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const API_URL = 'http://localhost:5000/api';
const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer mock-developer-token'
};

async function cleanup() {
  console.log('🧹 Cleaning up database completely...');
  await prisma.debtSettlement.deleteMany({});
  await prisma.receiptItemSplit.deleteMany({});
  await prisma.receiptItem.deleteMany({});
  await prisma.receipt.deleteMany({});
  await prisma.person.deleteMany({});
  await prisma.walletTransaction.deleteMany({});

  // Reset default wallets to seeded values
  await prisma.wallet.updateMany({
    where: { userId: 1, type: 'CASH' },
    data: { balance: 500000 }
  });
  
  await prisma.wallet.updateMany({
    where: { userId: 1, type: 'BANK' },
    data: { balance: 1000000 }
  });

  await prisma.wallet.deleteMany({
    where: { name: { startsWith: 'فيزا' } }
  });

  // Force baseCurrency to SAR for tests
  await prisma.user.update({
    where: { id: 1 },
    data: { baseCurrency: 'SAR' }
  });

  console.log('✅ Cleanup completed.');
}

async function runTests() {
  console.log('==================================================');
  console.log('🧪 RUNNING COMPREHENSIVE FINANCIAL FLOW TESTS 🧪');
  console.log('==================================================');

  try {
    // Run cleanup first
    await cleanup();

    // 1. Initial State Check
    console.log('\nStep 1: Fetching initial wallets...');
    const walletRes = await fetch(`${API_URL}/wallets`, { headers: HEADERS });
    const walletData = await walletRes.json();
    console.log('Wallets in DB:', walletData.wallets.map(w => `${w.name}: ${w.balance} (${w.type})`));
    
    // Find Cash wallet
    const cashWallet = walletData.wallets.find(w => w.type === 'CASH');
    const bankWallet = walletData.wallets.find(w => w.type === 'BANK');
    
    if (!cashWallet || !bankWallet) {
      throw new Error('Default wallets (Cash, Bank) missing.');
    }
    
    console.log(`Cash Wallet ID: ${cashWallet.id}, Balance: ${cashWallet.balance}`);
    console.log(`Bank Wallet ID: ${bankWallet.id}, Balance: ${bankWallet.balance}`);

    // Create a new wallet "Visa"
    console.log('\nStep 2: Creating a new wallet "Visa"...');
    const uniqueWalletName = 'فيزا_' + Date.now();
    const createWalletRes = await fetch(`${API_URL}/wallets`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        name: uniqueWalletName,
        type: 'VISA',
        balance: 5000.00, // 5000 SAR
        color: '#FF5733'
      })
    });
    
    const createWalletData = await createWalletRes.json();
    if (!createWalletRes.ok) {
      throw new Error('Create wallet failed: ' + JSON.stringify(createWalletData));
    }
    const visaWallet = createWalletData.wallet;
    console.log(`Created Wallet: ${visaWallet.name}, ID: ${visaWallet.id}, Balance: ${visaWallet.balance}`);

    // Create a Person "Ahmad"
    console.log('\nStep 3: Creating a new person "Ahmad"...');
    const uniquePersonName = 'أحمد_' + Date.now();
    const createPersonRes = await fetch(`${API_URL}/people`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        name: uniquePersonName,
        color: '#E040FB',
        emoji: '🙋‍♂️'
      })
    });
    
    const createPersonData = await createPersonRes.json();
    if (!createPersonRes.ok) {
      throw new Error('Create person failed: ' + JSON.stringify(createPersonData));
    }
    const ahmad = createPersonData.person;
    console.log(`Created Person: ${ahmad.name}, ID: ${ahmad.id}`);

    // 2. Create Receipt & splits
    // First, let's create a blank/pending receipt directly in database using Prisma
    console.log('\nStep 4: Seeding a raw receipt in the database...');
    
    // Get product from db
    const product = await prisma.product.findFirst({ where: { userId: 1 } });
    if (!product) {
      throw new Error('No products in database. Run seed first.');
    }

    const rawReceipt = await prisma.receipt.create({
      data: {
        userId: 1,
        storeName: 'سوبرماركت التميمي',
        date: new Date(),
        total: 0, // 0 SAR initially (scanned but empty or manual review)
        currency: 'SAR',
        tax: 0,
        discount: 0,
        confidence: 0.95,
        status: 'NEEDS_REVIEW',
        payerType: 'USER',
        walletId: null
      }
    });
    console.log(`Raw receipt created with ID: ${rawReceipt.id}, Total: ${rawReceipt.total / 100} SAR`);

    // Let's call PUT /api/receipts/:id to simulate user reviewing and submitting:
    // Store Name: supermarcket AlTamimi
    // Total: 300.00
    // Payer: USER (Visa wallet + Cash wallet split)
    // Item: "صدر دجاج", Qty = 1, Price = 300.00, Split = Ahmad (200.00), User (100.00)
    console.log('\nStep 5: Updating receipt via API with splits and split wallets...');
    const updateRes = await fetch(`${API_URL}/receipts/${rawReceipt.id}`, {
      method: 'PUT',
      headers: HEADERS,
      body: JSON.stringify({
        storeName: 'سوبرماركت التميمي',
        date: new Date().toISOString(),
        total: 300.00,
        currency: 'SAR',
        tax: 0.00,
        discount: 0.00,
        payerType: 'USER',
        walletId: visaWallet.id,
        secondaryWalletId: cashWallet.id,
        secondaryWalletAmount: 100.00, // 100.00 from cash, 200.00 from visa
        items: [
          {
            productId: product.id,
            originalName: 'صدور دجاج التميمي',
            quantity: 1,
            price: 300.00,
            discount: 0.00,
            total: 300.00,
            splitMethod: 'CUSTOM',
            splits: [
              {
                personId: null, // User split
                personName: 'أنا',
                amount: 100.00,
                ratio: 33.33,
                isUser: true
              },
              {
                personId: ahmad.id, // Ahmad split
                personName: 'أحمد',
                amount: 200.00,
                ratio: 66.67,
                isUser: false
              }
            ]
          }
        ]
      })
    });

    const updateData = await updateRes.json();
    console.log('Update API Status:', updateRes.status);
    console.log('Updated Receipt Response:', updateData.message);
    if (!updateRes.ok) {
      throw new Error('Update receipt failed: ' + JSON.stringify(updateData));
    }

    // Let's verify:
    // 1. Visa wallet balance should be 5000.00 - 200.00 = 4800.00
    console.log('\nStep 6: Checking Visa wallet balance...');
    const visaWalletUpdated = await prisma.wallet.findUnique({ where: { id: visaWallet.id } });
    console.log(`Visa Wallet Balance (cents): ${visaWalletUpdated.balance} -> ${visaWalletUpdated.balance / 100} SAR`);
    if (visaWalletUpdated.balance !== 480000) {
      throw new Error(`Expected Visa balance to be 480000 cents, but got ${visaWalletUpdated.balance}`);
    }
    console.log('✅ Visa Wallet balance is correct!');

    // 2. Cash wallet balance should be 5000.00 - 100.00 = 4900.00
    console.log('\nStep 6.5: Checking Cash wallet balance...');
    const cashWalletCheck = await prisma.wallet.findUnique({ where: { id: cashWallet.id } });
    console.log(`Cash Wallet Balance (cents): ${cashWalletCheck.balance} -> ${cashWalletCheck.balance / 100} SAR`);
    if (cashWalletCheck.balance !== 490000) {
      throw new Error(`Expected Cash balance to be 490000 cents, but got ${cashWalletCheck.balance}`);
    }
    console.log('✅ Cash Wallet balance is correct!');

    // 3. Ahmad's net balance should be 200.00 owes me (since user paid, Ahmad has a split of 200.00)
    console.log('\nStep 7: Checking Ahmad\'s net balance...');
    const ahmadDetailsRes = await fetch(`${API_URL}/people/${ahmad.id}`, { headers: HEADERS });
    const ahmadDetailsData = await ahmadDetailsRes.json();
    const ahmadUpdated = ahmadDetailsData.person;
    console.log(`Ahmad Balance details: Owes Me: ${ahmadUpdated.totalOwesMe}, I Owe: ${ahmadUpdated.totalIOwe}, Net Balance: ${ahmadUpdated.balance}`);
    if (ahmadUpdated.balance !== 200.00) {
      throw new Error(`Expected Ahmad to owe 200.00, but got ${ahmadUpdated.balance}`);
    }
    console.log('✅ Ahmad net balance is correct!');

    // 3. Analytics: Personal Spend vs Cash Outflow
    // Cash Outflow: User paid 300.00 total for receipt. Total Cash Outflow = 300.00.
    // Personal Spend: User share was 100.00. Total Personal Spend = 100.00.
    // Receivables: Ahmad owes user 200.00.
    console.log('\nStep 8: Checking Dashboard Analytics...');
    const dashboardRes = await fetch(`${API_URL}/analytics/dashboard`, { headers: HEADERS });
    const dashboardData = await dashboardRes.json();
    const stats = dashboardData.stats;
    console.log(`Dashboard Stats:`);
    console.log(`- Total Balance: ${stats.totalBalance}`);
    console.log(`- Personal Spending (Monthly): ${stats.monthlyExpenses}`);
    console.log(`- Cash Outflow: ${stats.cashOutflow}`);
    console.log(`- Pending Receivables: ${stats.pendingReceivables}`);
    console.log(`- Pending Payables: ${stats.pendingPayables}`);
    
    if (stats.monthlyExpenses !== 100.00) {
      throw new Error(`Expected MonthlyExpenses (Personal Spend) to be 100.00, but got ${stats.monthlyExpenses}`);
    }
    if (stats.cashOutflow !== 300.00) {
      throw new Error(`Expected CashOutflow to be 300.00, but got ${stats.cashOutflow}`);
    }
    if (stats.pendingReceivables !== 200.00) {
      throw new Error(`Expected Pending Receivables to be 200.00, but got ${stats.pendingReceivables}`);
    }
    console.log('✅ Dashboard Analytics are correct!');

    // 4. Record Settlement
    // Ahmad pays user 150.00 SAR back, deposited into Cash wallet.
    // Settlement Amount = +150.00
    // Cash Wallet Balance: 4900.00 (after split) + 150.00 = 5050.00
    console.log('\nStep 9: Recording settlement of 150.00 from Ahmad to Cash Wallet...');
    const settleRes = await fetch(`${API_URL}/settlements`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        personId: ahmad.id,
        amount: 150.00,
        notes: 'دفعة أولى من الحساب',
        walletId: cashWallet.id
      })
    });
    
    const settleData = await settleRes.json();
    if (!settleRes.ok) {
      throw new Error('Settle failed: ' + JSON.stringify(settleData));
    }
    console.log(`Recorded Settlement: ID: ${settleData.settlement.id}, Amount: ${settleData.settlement.amount}`);
    
    // Check cash wallet balance
    const cashWalletUpdated = await prisma.wallet.findUnique({ where: { id: cashWallet.id } });
    console.log(`Cash Wallet Balance (cents): ${cashWalletUpdated.balance} -> ${cashWalletUpdated.balance / 100} SAR`);
    if (cashWalletUpdated.balance !== 505000) {
      throw new Error(`Expected Cash balance to be 505000 cents, but got ${cashWalletUpdated.balance}`);
    }
    console.log('✅ Cash Wallet balance updated correctly!');

    // Ahmad's net balance should now be 200.00 - 150.00 = 50.00
    console.log('\nStep 10: Checking Ahmad\'s updated balance...');
    const ahmadDetailsRes2 = await fetch(`${API_URL}/people/${ahmad.id}`, { headers: HEADERS });
    const ahmadDetailsData2 = await ahmadDetailsRes2.json();
    const ahmadUpdated2 = ahmadDetailsData2.person;
    console.log(`Ahmad Updated Balance: Owes Me: ${ahmadUpdated2.totalOwesMe}, I Owe: ${ahmadUpdated2.totalIOwe}, Net Balance: ${ahmadUpdated2.balance}`);
    if (ahmadUpdated2.balance !== 50.00) {
      throw new Error(`Expected Ahmad to owe 50.00, but got ${ahmadUpdated2.balance}`);
    }
    console.log('✅ Ahmad updated balance is correct!');

    // 5. Manual Wallet Transactions
    console.log('\nStep 11: Recording manual wallet deposit of +2000.00 SAR on Visa wallet...');
    const adjustRes = await fetch(`${API_URL}/wallets/${visaWallet.id}/transactions`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        amount: 2000.00,
        description: 'إيداع راتب إضافي للتجربة',
        date: new Date().toISOString()
      })
    });

    const adjustData = await adjustRes.json();
    if (!adjustRes.ok) {
      throw new Error('Wallet adjustment failed: ' + JSON.stringify(adjustData));
    }
    console.log(`Recorded Adjustment: ${adjustData.transaction.description}, Amount: ${adjustData.transaction.amount}`);

    // Check updated Visa wallet balance
    const visaWalletUpdated2 = await prisma.wallet.findUnique({ where: { id: visaWallet.id } });
    console.log(`Visa Wallet Balance (cents): ${visaWalletUpdated2.balance} -> ${visaWalletUpdated2.balance / 100} SAR`);
    if (visaWalletUpdated2.balance !== 680000) {
      throw new Error(`Expected Visa balance to be 680000 cents, but got ${visaWalletUpdated2.balance}`);
    }
    console.log('✅ Visa Wallet balance updated correctly!');

    // Fetch unified statement
    console.log('\nStep 12: Fetching unified ledger statement for Visa wallet...');
    const ledgerRes = await fetch(`${API_URL}/wallets/${visaWallet.id}/transactions`, { headers: HEADERS });
    const ledgerData = await ledgerRes.json();
    console.log('Ledger items:');
    ledgerData.ledger.forEach(item => {
      console.log(`- [${item.type}] ${item.description}: ${item.amount} SAR (Date: ${item.date})`);
    });

    if (ledgerData.ledger.length !== 2) {
      throw new Error(`Expected 2 ledger entries, but got ${ledgerData.ledger.length}`);
    }

    if (ledgerData.ledger[0].amount !== 2000.00 || ledgerData.ledger[1].amount !== -200.00) {
      throw new Error(`Ledger sorting or amount formatting incorrect! First: ${ledgerData.ledger[0].amount}, Second: ${ledgerData.ledger[1].amount}`);
    }
    console.log('✅ Unified ledger statement retrieved and verified successfully!');

    // 6. Clean Up
    console.log('\nStep 13: Cleaning up test data...');
    // Delete receipt
    await fetch(`${API_URL}/receipts/${rawReceipt.id}`, { method: 'DELETE', headers: HEADERS });
    // Delete settlement
    await fetch(`${API_URL}/settlements/${settleData.settlement.id}`, { method: 'DELETE', headers: HEADERS });
    // Delete person
    await fetch(`${API_URL}/people/${ahmad.id}`, { method: 'DELETE', headers: HEADERS });
    // Delete wallet (this will cascade delete manual transactions in DB)
    await fetch(`${API_URL}/wallets/${visaWallet.id}`, { method: 'DELETE', headers: HEADERS });
    
    console.log('Clean up finished successfully!');
    console.log('\n==================================================');
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('==================================================');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
