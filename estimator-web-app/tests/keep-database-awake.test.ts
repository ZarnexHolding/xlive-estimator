/**
 * The scheduled function that stops Supabase pausing the Free plan project: it must be a real
 * database read as an anonymous visitor, and a failure must be logged rather than thrown.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// Read when the Supabase config module loads, so set before the import below runs.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
});

import keepDatabaseAwake, { config } from "../netlify/functions/keep-database-awake.mjs";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("keep-database-awake", () => {
  it("runs several times a day, as Supabase's activity rule asks", () => {
    expect(config.schedule).toBe("0 */6 * * *");
  });

  it("reads one row of a protected table with the publishable key", async () => {
    const fetchMock = vi.fn(async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await keepDatabaseAwake();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://example.supabase.co/rest/v1/organisations?select=id&limit=1");
    expect(init.method).toBe("GET");
    expect(new Headers(init.headers).get("apikey")).toBe("sb_publishable_test");
    expect(init.signal).toBeInstanceOf(AbortSignal); // the time limit that keeps it inside Netlify's 30 seconds
    expect(error).not.toHaveBeenCalled();
  });

  it("logs a failure without throwing, after the client's own retries", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("fetch failed"))));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const run = keepDatabaseAwake();
    await vi.runAllTimersAsync();
    await expect(run).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toContain("[keep-database-awake] the database did not answer");
  });
});
