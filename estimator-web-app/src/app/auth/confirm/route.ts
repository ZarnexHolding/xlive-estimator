import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { RESET_PASSWORD_PATH } from "@/lib/supabase/config";
import { getServerSupabase } from "@/lib/supabase/server";

/** Email confirmation and password reset links land here: exchange the code (PKCE) or verify the token, then continue. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const rawNext = url.searchParams.get("next");
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const supabase = await getServerSupabase();

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : { error: new Error("The confirmation link is incomplete.") };

  const target = url.clone();
  target.search = "";
  if (error) {
    target.pathname = "/login";
    target.searchParams.set(
      "error",
      next === RESET_PASSWORD_PATH
        ? "This reset link has expired or was already used. Choose “Forgot your password?” to get a new one."
        : // The email is usually confirmed by Supabase before this redirect; only the browser session is missing.
          "Your email may already be confirmed: try signing in. If that fails, the link has expired; sign up again to get a new one.",
    );
  } else {
    target.pathname = next;
  }
  return NextResponse.redirect(target);
}
