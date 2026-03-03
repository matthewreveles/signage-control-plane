// lib/prisma.ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

function getClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL");

  // Cache pool/client globally to avoid creating multiples on Vercel.
  if (!globalForPrisma.pgPool) {
    globalForPrisma.pgPool = new Pool({
      connectionString,
      // Optional guardrails if you start seeing connection pressure:
      // max: 5,
      // idleTimeoutMillis: 30_000,
      // connectionTimeoutMillis: 10_000,
    });
  }

  if (!globalForPrisma.prisma) {
    const adapter = new PrismaPg(globalForPrisma.pgPool);
    globalForPrisma.prisma = new PrismaClient({
      adapter,
      log: ["error", "warn"],
    });
  }

  return globalForPrisma.prisma;
}

// Lazy proxy so importing never throws during build; throws only when used.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    // TS-safe dynamic member access:
    return Reflect.get(client as unknown as object, prop);
  },
}) as PrismaClient;

// Optional: allow `import prisma from "@/lib/prisma"`
export default prisma;