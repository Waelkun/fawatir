UPDATE "Wallet" SET balance = 500000 WHERE type = 'CASH';
UPDATE "Wallet" SET balance = 1000000 WHERE type = 'BANK';
DELETE FROM "Wallet" WHERE name LIKE 'فيزا%';
