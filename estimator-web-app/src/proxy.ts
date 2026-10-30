import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, PUBLIC_PATHS, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

/**
 * Refreshes the Supabase session on every request and sends signed-out visitors to /login.
 * API routes are not redirected: they check the session themselves and return 401.
 * Without Supabase configuration (demo mode) requests pass through unchanged.
 */
export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Do not run code between creating the client and getClaims() (session refresh).
  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;

  // Confirmation links fall back to the site root when the redirect URL is not allow-listed.
  const code = request.nextUrl.searchParams.get("code");
  if (path === "/" && code) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/confirm";
    url.search = `?code=${encodeURIComponent(code)}&next=/onboarding`;
    return NextResponse.redirect(url);
  }
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`)) || path.startsWith("/api/");

  if (!data?.claims && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // .netlify/: platform paths such as the background analysis function, which checks its own key.
  matcher: ["/((?!_next/static|_next/image|\\.netlify/|favicon.ico|pdf.worker.min.mjs|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
