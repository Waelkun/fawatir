/**
 * Fix DB: Migrate balance/amount columns from Int to REAL (Float) in SQLite
 * SQLite doesn't support ALTER COLUMN, so we need to:
 * 1. Create new tables with correct types
 * 2. Copy data
 * 3. Drop old tables
 * 4. Rename new tables
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixDbTypes() {
  console.log('Starting DB type migration...');

  try {
    // Step 1: Fix Wallet balance column (Int -> REAL)
    console.log('Fixing Wallet.balance column...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Wallet_new" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "userId" INTEGER NOT NULL,
        "name" TEXT NOT NULL,
        "type" TEXT NOT NULL DEFAULT 'CASH',
        "balance" REAL NOT NULL DEFAULT 0,
        "color" TEXT NOT NULL DEFAULT '#4CC9F0',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    await prisma.$executeRawUnsafe(`
      INSERT INTO "Wallet_new" ("id","userId","name","type","balance","color","createdAt")
      SELECT "id","userId","name","type",CAST("balance" AS REAL),"color","createdAt" FROM "Wallet"
    `);

    await prisma.$executeRawUnsafe(`DROP TABLE "Wallet"`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Wallet_new" RENAME TO "Wallet"`);
    console.log('✓ Wallet.balance fixed');

    // Step 2: Fix WalletTransaction.amount column (Int -> REAL)
    console.log('Fixing WalletTransaction.amount column...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WalletTransaction_new" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "walletId" INTEGER NOT NULL,
        "amount" REAL NOT NULL,
        "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "description" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    await prisma.$executeRawUnsafe(`
      INSERT INTO "WalletTransaction_new" ("id","walletId","amount","date","description","createdAt")
      SELECT "id","walletId",CAST("amount" AS REAL),"date","description","createdAt" FROM "WalletTransaction"
    `);

    await prisma.$executeRawUnsafe(`DROP TABLE "WalletTransaction"`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "WalletTransaction_new" RENAME TO "WalletTransaction"`);
    console.log('✓ WalletTransaction.amount fixed');

    // Step 3: Fix DebtSettlement.amount column (Int -> REAL)
    console.log('Fixing DebtSettlement.amount column...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DebtSettlement_new" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "userId" INTEGER NOT NULL,
        "personId" INTEGER NOT NULL,
        "receiptId" INTEGER,
        "amount" REAL NOT NULL,
        "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "notes" TEXT,
        "walletId" INTEGER,
        CONSTRAINT "DebtSettlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "DebtSettlement_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "DebtSettlement_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT "DebtSettlement_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    await prisma.$executeRawUnsafe(`
      INSERT INTO "DebtSettlement_new" ("id","userId","personId","receiptId","amount","date","notes","walletId")
      SELECT "id","userId","personId","receiptId",CAST("amount" AS REAL),"date","notes","walletId" FROM "DebtSettlement"
    `);

    await prisma.$executeRawUnsafe(`DROP TABLE "DebtSettlement"`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "DebtSettlement_new" RENAME TO "DebtSettlement"`);
    console.log('✓ DebtSettlement.amount fixed');

    // Step 4: Reset all wallet balances to 0 to fix any corrupted data
    console.log('Resetting all wallet balances to 0...');
    await prisma.$executeRawUnsafe(`UPDATE "Wallet" SET "balance" = 0`);
    console.log('✓ Wallet balances reset to 0');

    console.log('\n✅ DB type migration completed successfully!');
    console.log('All wallet balances have been reset to 0.');
    console.log('You can now use the app normally.');

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

fixDbTypes();
