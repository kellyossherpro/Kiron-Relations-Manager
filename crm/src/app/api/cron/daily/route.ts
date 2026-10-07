import { runDailyRules } from "@/lib/stage-engine";

// Called once a day by the host's scheduler (e.g. Vercel Cron), which sends
// "Authorization: Bearer <CRON_SECRET>". Without the secret configured it refuses.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Not allowed" }, { status: 401 });
  const result = await runDailyRules();
  return Response.json({ ok: true, ...result });
}
