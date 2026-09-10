import { defineConfig } from "drizzle-kit";

// if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");

export default defineConfig({
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.NODE_ENV !== "production" ? process.env.DATABASE_URL_DEV : process.env.DATABASE_URL },
  verbose: true,
  strict: true,
});
