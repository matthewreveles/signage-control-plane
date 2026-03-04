import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Neon convention:
 * - DATABASE_URL = pooled (pooler host) for runtime
 * - DATABASE_URL_UNPOOLED = direct (non-pooler host) for migrations
 *
 * Prisma Migrate should prefer the unpooled URL to avoid pooler hiccups (P1017).
 */
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!url) {
  throw new Error("Missing DATABASE_URL_UNPOOLED or DATABASE_URL for Prisma Migrate");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url,
  },
});