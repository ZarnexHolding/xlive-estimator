/**
 * Password reset: the rules for a new password, and the /auth/confirm route that an emailed reset
 * link lands on. Supabase is replaced by a fake; the real email is checked on the live site.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ verifyOtp: vi.fn(), exchangeCodeForSession: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getServerSupabase: async () => ({ auth }) }));

import { GET } from "@/app/auth/confirm/route";
import { MIN_PASSWORD_LENGTH, newPasswordProblem } from "@/lib/password";

const confirm = (query: string) => GET(new NextRequest(`https://site.example/auth/confirm?${query}`));
const location = (response: Response) => new URL(response.headers.get("location")!);

beforeEach(() => {
  auth.verifyOtp.mockReset().mockResolvedValue({ error: null });
  auth.exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
});

describe("new password rules", () => {
  it("accepts a long enough password that matches its confirmation", () => {
    expect(newPasswordProblem("long-enough-1")).toBeNull();
    expect(newPasswordProblem("long-enough-1", "long-enough-1")).toBeNull();
  });

  it("rejects a short password, and a confirmation that differs", () => {
    expect(newPasswordProblem("x".repeat(MIN_PASSWORD_LENGTH - 1))).toBe("Use a password of at least 10 characters.");
    expect(newPasswordProblem("long-enough-1", "long-enough-2")).toBe("The two passwords do not match.");
  });
});

describe("/auth/confirm", () => {
  it("verifies a reset link from any browser and goes to the new-password page", async () => {
    const response = await confirm("token_hash=abc&type=recovery&next=/reset-password");
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "abc" });
    expect(location(response).pathname).toBe("/reset-password");
    expect(location(response).search).toBe(""); // the one-time token is not kept in the address
  });

  it("explains an expired reset link and points to a new one", async () => {
    auth.verifyOtp.mockResolvedValue({ error: new Error("expired") });
    const response = await confirm("token_hash=abc&type=recovery&next=/reset-password");
    expect(location(response).pathname).toBe("/login");
    expect(location(response).searchParams.get("error")).toContain("reset link has expired");
  });

  it("keeps the sign-up message for a confirmation link", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: new Error("no verifier") });
    const response = await confirm("code=abc&next=/onboarding");
    expect(location(response).searchParams.get("error")).toContain("email may already be confirmed");
  });

  it("never redirects to another site", async () => {
    const response = await confirm("token_hash=abc&type=recovery&next=//evil.example");
    expect(location(response).origin).toBe("https://site.example");
    expect(location(response).pathname).toBe("/");
  });
});
