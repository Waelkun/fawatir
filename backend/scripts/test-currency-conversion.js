const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const currencyService = require('../src/services/currency.service');

const API_URL = 'http://localhost:5000/api';
const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer mock-developer-token'
};

async function testCurrencyConversion() {
  console.log('==================================================');
  console.log('🧪 RUNNING WALLET CURRENCY CONVERSION TESTS 🧪');
  console.log('==================================================');

  try {
    // 1. Reset user baseCurrency to SAR
    console.log('\n1. Resetting user base currency to SAR...');
    await prisma.user.update({
      where: { id: 1 },
      data: { baseCurrency: 'SAR' }
    });

    // Reset default Cash wallet balance to 1000.00 SAR
    await prisma.wallet.updateMany({
      where: { userId: 1, type: 'CASH' },
      data: { balance: 100000 } // 1000 SAR
    });

    const cashWallet = await prisma.wallet.findFirst({ where: { userId: 1, type: 'CASH' } });
    console.log(`Initial Cash Wallet Balance: ${cashWallet.balance / 100} SAR`);

    // 2. Change base currency to TRY via API
    console.log('\n2. Changing user base currency to TRY...');
    const changeCurrencyRes = await fetch(`${API_URL}/currency/base`, {
      method: 'PUT',
      headers: HEADERS,
      body: JSON.stringify({ currency: 'TRY' })
    });
    const changeCurrencyData = await changeCurrencyRes.json();
    console.log('API Response:', changeCurrencyData.message);

    // Verify Cash wallet balance has been converted to TRY using currencyService
    const cashWalletAfterChange = await prisma.wallet.findUnique({ where: { id: cashWallet.id } });
    console.log(`Cash Wallet Balance after base currency change: ${cashWalletAfterChange.balance / 100} TRY`);
    
    const expectedTryVal = await currencyService.convertCurrency(1000.00, 'SAR', 'TRY');
    const actualTry = cashWalletAfterChange.balance / 100;
    if (Math.abs(actualTry - expectedTryVal) > 5.0) {
      throw new Error(`Expected Cash balance to be converted to ~${expectedTryVal} TRY, but got ${actualTry} TRY`);
    }
    console.log('✅ Base currency change wallet conversion passed!');

    // 3. Create a receipt of 10 USD (when user base currency is TRY)
    console.log('\n3. Creating manual receipt of 10 USD...');
    const createRes = await fetch(`${API_URL}/receipts`, {
      method: 'POST',
      headers: HEADERS
    });
    const createData = await createRes.json();
    const receipt = createData.receipt;
    console.log(`Manual receipt drafted with ID: ${receipt.id}`);

    // Update receipt total to 10 USD, using the Cash wallet
    const usdToTry = await currencyService.convertCurrency(10.00, 'USD', 'TRY');
    console.log(`Updating receipt with total: 10.00 USD (which is ~${usdToTry} TRY)...`);
    const updateRes = await fetch(`${API_URL}/receipts/${receipt.id}`, {
      method: 'PUT',
      headers: HEADERS,
      body: JSON.stringify({
        storeName: 'متجر اختبار العملات',
        date: new Date().toISOString(),
        total: 10.00,
        currency: 'USD',
        tax: 0.00,
        discount: 0.00,
        payerType: 'USER',
        walletId: cashWallet.id,
        items: []
      })
    });
    const updateData = await updateRes.json();
    console.log('Update API message:', updateData.message);

    // Verify Cash wallet balance decrement
    const cashWalletAfterDeduction = await prisma.wallet.findUnique({ where: { id: cashWallet.id } });
    const balanceAfterDeduct = cashWalletAfterDeduction.balance / 100;
    console.log(`Cash Wallet Balance after 10 USD deduction: ${balanceAfterDeduct} TRY`);
    const expectedDeduct = actualTry - usdToTry;
    if (Math.abs(balanceAfterDeduct - expectedDeduct) > 2.0) {
      throw new Error(`Expected Cash balance to be ~${expectedDeduct} TRY, but got ${balanceAfterDeduct} TRY`);
    }
    console.log('✅ Foreign currency expense deduction passed!');

    // 4. Fetch unified statement/ledger for Cash wallet
    console.log('\n4. Fetching Cash wallet ledger...');
    const ledgerRes = await fetch(`${API_URL}/wallets/${cashWallet.id}/transactions`, { headers: HEADERS });
    const ledgerData = await ledgerRes.json();
    const receiptLedgerItem = ledgerData.ledger.find(item => item.id.includes(`-${receipt.id}`));
    console.log(`Ledger Item Amount: ${receiptLedgerItem.amount} TRY`);
    if (Math.abs(receiptLedgerItem.amount - (-usdToTry)) > 2.0) {
      throw new Error(`Expected ledger transaction amount to be ~ -${usdToTry} TRY, but got ${receiptLedgerItem.amount} TRY`);
    }
    console.log('✅ Ledger receipt conversion passed!');

    // 5. Update receipt total to 20 USD
    // Wallet should end up at: actualTry - conversion(20 USD to TRY)
    const usdToTry2 = await currencyService.convertCurrency(20.00, 'USD', 'TRY');
    console.log(`\n5. Updating receipt total to 20 USD (which is ~${usdToTry2} TRY)...`);
    const updateRes2 = await fetch(`${API_URL}/receipts/${receipt.id}`, {
      method: 'PUT',
      headers: HEADERS,
      body: JSON.stringify({
        storeName: 'متجر اختبار العملات',
        date: new Date().toISOString(),
        total: 20.00,
        currency: 'USD',
        tax: 0.00,
        discount: 0.00,
        payerType: 'USER',
        walletId: cashWallet.id,
        items: []
      })
    });
    const updateData2 = await updateRes2.json();
    console.log('Update API message:', updateData2.message);

    const cashWalletAfterDeduction2 = await prisma.wallet.findUnique({ where: { id: cashWallet.id } });
    const balanceAfterDeduct2 = cashWalletAfterDeduction2.balance / 100;
    console.log(`Cash Wallet Balance after 20 USD deduction: ${balanceAfterDeduct2} TRY`);
    const expectedDeduct2 = actualTry - usdToTry2;
    if (Math.abs(balanceAfterDeduct2 - expectedDeduct2) > 2.0) {
      throw new Error(`Expected Cash balance to be ~${expectedDeduct2} TRY, but got ${balanceAfterDeduct2} TRY`);
    }
    console.log('✅ Refund & re-deduction currency conversion update passed!');

    // 6. Delete receipt
    console.log('\n6. Deleting receipt...');
    const deleteRes = await fetch(`${API_URL}/receipts/${receipt.id}`, {
      method: 'DELETE',
      headers: HEADERS
    });
    const deleteData = await deleteRes.json();
    console.log('Delete API message:', deleteData.message);

    const cashWalletAfterDelete = await prisma.wallet.findUnique({ where: { id: cashWallet.id } });
    const balanceAfterDelete = cashWalletAfterDelete.balance / 100;
    console.log(`Cash Wallet Balance after receipt deletion: ${balanceAfterDelete} TRY`);
    if (Math.abs(balanceAfterDelete - actualTry) > 2.0) {
      throw new Error(`Expected Cash balance to return to ~${actualTry} TRY, but got ${balanceAfterDelete} TRY`);
    }
    console.log('✅ Expense deletion refund conversion passed!');

    // 7. Reset user base currency to SAR to restore original state
    console.log('\n7. Restoring user base currency to SAR...');
    await fetch(`${API_URL}/currency/base`, {
      method: 'PUT',
      headers: HEADERS,
      body: JSON.stringify({ currency: 'SAR' })
    });

    console.log('\n==================================================');
    console.log('🎉 ALL CURRENCY CONVERSION TESTS PASSED! 🎉');
    console.log('==================================================');

  } catch (error) {
    console.error('❌ Currency test failed with error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testCurrencyConversion();
