const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../prisma/schema.prisma');

console.log('🔄 Preparing Prisma schema for PostgreSQL production deployment...');

if (fs.existsSync(schemaPath)) {
  let content = fs.readFileSync(schemaPath, 'utf8');
  
  // Replace sqlite provider with postgresql provider
  content = content.replace(/provider\s*=\s*"sqlite"/g, 'provider = "postgresql"');
  
  fs.writeFileSync(schemaPath, content, 'utf8');
  console.log('✅ Success: prisma/schema.prisma updated to "postgresql" provider.');
} else {
  console.error('❌ Error: schema.prisma file not found at ' + schemaPath);
  process.exit(1);
}
