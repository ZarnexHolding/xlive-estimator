import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../../src/lib/supabase/config";

/**
 * Netlify Scheduled Function: makes a small database read four times a day, because Supabase pauses
 * a Free plan project after a week without enough database activity. It reads as an anonymous
 * visitor, so Row Level Security returns no rows. Netlify runs it on the published deploy only, and
 * it cannot be called by URL.
 */
export default async function keepDatabaseAwake(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    console.error("[keep-database-awake] not configured: the Supabase variables are required");
    return;
  }
  const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await db.from("organisations").select("id").limit(1).abortSignal(AbortSignal.timeout(10_000));
  if (error) console.error(`[keep-database-awake] the database did not answer: ${error.message}`);
}

export const config = { schedule: "0 */6 * * *" };
