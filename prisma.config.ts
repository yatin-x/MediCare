// prisma.config.ts
import "dotenv/config";           // ← This is very important
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),     // ← This was missing or incorrect
  },
});