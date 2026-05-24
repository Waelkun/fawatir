const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

const schemaPath = path.join(__dirname, '../prisma/schema.prisma');
const envPath = path.join(__dirname, '../.env');

// Read current database URL from .env
const getDatabaseUrl = () => {
  if (!fs.existsSync(envPath)) return null;
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/^DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/m);
  return match ? match[1] : null;
};

// Check if PostgreSQL is reachable using a raw TCP socket connection
const checkPostgresConnection = (dbUrl) => {
  return new Promise((resolve) => {
    if (!dbUrl || !dbUrl.startsWith('postgresql')) {
      return resolve(false);
    }
    
    console.log('🔄 Checking connection to PostgreSQL server via TCP socket...');
    
    try {
      // Parse database URL using URL helper by temporarily replacing protocol to http for simple parsing
      const parsedUrl = new URL(dbUrl.replace('postgresql://', 'http://'));
      const host = parsedUrl.hostname || 'localhost';
      const port = parseInt(parsedUrl.port || '5432');
      
      const socket = new net.Socket();
      socket.setTimeout(2500); // 2.5 seconds timeout
      
      socket.on('connect', () => {
        socket.destroy();
        console.log('✅ Connected to PostgreSQL successfully!');
        resolve(true);
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        console.log('⚠️ PostgreSQL connection timeout. Will fallback to SQLite.');
        resolve(false);
      });
      
      socket.on('error', (err) => {
        socket.destroy();
        console.log('⚠️ Failed to connect to PostgreSQL (' + err.message + '). Will fallback to SQLite.');
        resolve(false);
      });
      
      socket.connect(port, host);
    } catch (e) {
      console.log('⚠️ Failed to parse database URL: ' + e.message);
      resolve(false);
    }
  });
};

const setupSqliteFallback = () => {
  console.log('💡 Switching database provider to SQLite (Zero-Config local DB)...');
  
  // 1. Rewrite prisma/schema.prisma datasource provider
  let schemaContent = fs.readFileSync(schemaPath, 'utf8');
  schemaContent = schemaContent.replace(/provider\s*=\s*"postgresql"/g, 'provider = "sqlite"');
  fs.writeFileSync(schemaPath, schemaContent, 'utf8');
  console.log('✅ Updated prisma/schema.prisma to use "sqlite" provider.');

  // 2. Rewrite .env to point to sqlite file
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    // Comment postgres, uncomment/add sqlite link
    envContent = envContent.replace(
      /^DATABASE_URL\s*=\s*.*$/m,
      '# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/aiexpense?schema=public"\nDATABASE_URL="file:./dev.db"'
    );
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('✅ Updated .env configuration file to point to "file:./dev.db".');
  }
};

const main = async () => {
  const dbUrl = getDatabaseUrl();
  let usePostgres = false;

  if (dbUrl && dbUrl.startsWith('postgresql')) {
    usePostgres = await checkPostgresConnection(dbUrl);
  }

  if (!usePostgres) {
    setupSqliteFallback();
  }

  // 3. Generate Prisma client & push schema
  console.log('⚙️ Re-generating Prisma Client and creating database tables...');
  try {
    execSync('npx prisma generate', { stdio: 'inherit' });
    execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
    console.log('✅ Database schema synchronized.');

    // 4. Seed database
    console.log('🌱 Seeding database with initial products, users, and rates...');
    execSync('node prisma/seed.js', { stdio: 'inherit' });
    console.log('🎉 Database setup completed successfully!');
  } catch (error) {
    console.error('❌ Database migration or seeding failed:', error.message);
    process.exit(1);
  }
};

main();
