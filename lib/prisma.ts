// lib/prisma.ts
import "dotenv/config";
import { PrismaClient } from '../app/generated/prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

if (!process.env.DATABASE_URL) {
  throw new Error('❌ DATABASE_URL is not defined');
}

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: false, // explicitly disable SSL for localhost
  max: 10,
});

// Test connection immediately
pool
  .connect()
  .then((client) => {
    client.release();
    console.log('✅ Postgres pool connected successfully');
  })
  .catch((err: any) => {
    console.error('❌ Pool connection error:', err.message);
    console.error('Ensure Postgres is running and credentials are correct.');
  });

const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}