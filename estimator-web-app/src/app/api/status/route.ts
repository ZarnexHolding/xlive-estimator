import { connection } from "next/server";
import { systemStatus } from "@/lib/env";

/** Reports configuration (never secrets) so the UI can show the correct mode banner. */
export async function GET() {
  await connection(); // evaluate at request time, not at build time
  return Response.json(systemStatus());
}
