import { config } from "dotenv";
import path from "node:path";
import { defineConfig } from "vitest/config";

config();
// Tests always run against the separate test database, never the dev one.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts") } },
  test: {
    globalSetup: ["./src/test/global-setup.ts"],
    fileParallelism: false,
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL! },
  },
});
