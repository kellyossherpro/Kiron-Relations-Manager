import type { PoolConfig } from "pg";

// Local Postgres (this computer, tests) has no SSL. A hosted one (Supabase) needs an
// encrypted connection. Before real data goes in, also check the server's certificate
// (Supabase's CA file) instead of only encrypting.
export function poolConfig(url: string | undefined, max: number): PoolConfig {
  const local = !url || /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  return { connectionString: url, max, ...(local ? {} : { ssl: { rejectUnauthorized: false } }) };
}
