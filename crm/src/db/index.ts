import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { poolConfig } from "./config";
import * as schema from "./schema";

// One pool per process. In dev, Next.js reloads modules, so keep it on globalThis.
const globalForDb = globalThis as unknown as { krmPool?: Pool };

// On Vercel each running copy of the app gets its own pool, so keep them small.
export const pool = globalForDb.krmPool ?? new Pool(poolConfig(process.env.DATABASE_URL, process.env.VERCEL ? 3 : 10));
if (process.env.NODE_ENV !== "production") globalForDb.krmPool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
