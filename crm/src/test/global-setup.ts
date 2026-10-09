import { config } from "dotenv";
import { runMigrations } from "../db/migrate";

export default async function setup() {
  config();
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !url.includes("test")) throw new Error("TEST_DATABASE_URL must point at a test database.");
  await runMigrations(url);
}
