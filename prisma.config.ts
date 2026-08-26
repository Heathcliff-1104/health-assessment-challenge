import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Keeping generation install-safe makes a fresh clone work before secrets
    // are configured. Migrations still require a real DIRECT_URL/DATABASE_URL.
    url:
      process.env.DIRECT_URL ??
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5432/health_assessment?schema=public",
  },
});
