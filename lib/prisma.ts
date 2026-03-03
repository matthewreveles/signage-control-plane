// lib/prisma.ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL");
}

const pool =
  globalForPrisma.pgPool ??
  new Pool({
    connectionString,
    // Neon usually works fine with sslmode=require in the URL.
    // If you hit SSL verification errors, uncomment:
    // ssl: { rejectUnauthorized: false },
  });

const adapter = new PrismaPg(pool);
export const runtime = "nodejs";
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pgPool = pool;
}