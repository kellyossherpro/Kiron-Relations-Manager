import "dotenv/config";
import { pool } from "@/db";
import { runDailyRules } from "@/lib/stage-engine";

// Runs the daily rules by hand: npm run rules:daily
runDailyRules()
  .then((r) => console.log(`Reminders sent: ${r.reminded}. Moved to On Hold: ${r.putOnHold}. Moved to Closed Lost: ${r.closedLost}.`))
  .finally(() => pool.end());
