/**
 * Database integration tests: applies the Supabase migrations to PGlite (Postgres 17 in WASM)
 * with small stand-ins for Supabase's auth/storage schemas, then exercises the app functions
 * exactly as the browser and server call them.
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { calculateEstimate } from "@/domain/costing/engine";
import { EstimateSchema, type Estimate } from "@/domain/estimate";
import { remapCostingIds, resolveQuery } from "@/domain/factories";
import { setReviewStatus } from "@/domain/measurements";
import { emdadSampleEstimate } from "@/domain/reference-data/emdad";
import { DEFAULT_COMPANY_SETTINGS } from "@/domain/settings";
import { approveEstimate } from "@/domain/versioning";

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
const SERVER_KEY = "test-server-key-" + randomUUID();
const userA = randomUUID(); // first user: creates the organisation (admin)
const userB = randomUUID(); // signs up later, added by A as estimator
const userV = randomUUID(); // viewer
const userX = randomUUID(); // member of a different organisation

let db: PGlite;

async function as<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  await db.exec("set role authenticated");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
const rpc = async <T = unknown>(fn: string, args: unknown[]) => {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await db.query<{ r: T }>(`select public.${fn}(${placeholders}) as r`, args);
  return rows[0].r;
};

function emdadForDb(): Estimate {
  const sample = emdadSampleEstimate();
  return { ...sample, id: randomUUID(), sample: null, costing: remapCostingIds(sample.costing, randomUUID) };
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  `);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  // Supabase grants table privileges to API roles by default; RLS does the filtering.
  await db.exec(`grant usage on schema public to anon, authenticated; grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);
  await db.query(`insert into private.server_keys (name, key_hash) values ('app_server', encode(sha256(convert_to($1, 'UTF8')), 'hex'))`, [SERVER_KEY]);
  await db.query(`insert into auth.users values ($1, 'a@xlive.test'), ($2, 'b@xlive.test'), ($3, 'v@xlive.test'), ($4, 'x@other.test')`, [userA, userB, userV, userX]);
}, 60_000);

describe("onboarding and membership", () => {
  it("lets only the first user create the organisation; later users must be added by an admin", async () => {
    const org = await as(userA, () => rpc<string>("create_organisation", ["XLive Production", "Admin A"]));
    expect(org).toMatch(/[0-9a-f-]{36}/);
    await expect(as(userB, () => rpc("create_organisation", ["Rogue Co", "B"]))).rejects.toThrow(/already exists/);
    expect(await as(userB, () => rpc<{ organisationId: string | null }>("get_app_context", []))).toMatchObject({ organisationId: null, organisationsExist: true });

    await expect(as(userB, () => rpc("add_member", ["b@xlive.test", "estimator", "B"]))).rejects.toThrow(/administrators/);
    await as(userA, () => rpc("add_member", ["b@xlive.test", "estimator", "Estimator B"]));
    await as(userA, () => rpc("add_member", ["v@xlive.test", "viewer", "Viewer V"]));
    const members = await as(userA, () => rpc<{ email: string; role: string }[]>("list_members", []));
    expect(members.map((m) => `${m.email}:${m.role}`)).toEqual(["a@xlive.test:admin", "b@xlive.test:estimator", "v@xlive.test:viewer"]);

    // A second, unrelated tenant created directly (multi-company support is a later milestone).
    await db.query(`insert into organisations (id, name) values ('00000000-0000-0000-0000-0000000000bb', 'Other Co')`);
    await db.query(`insert into profiles (id, organisation_id, role) values ($1, '00000000-0000-0000-0000-0000000000bb', 'admin')`, [userX]);
  });
});

describe("save_estimate / load_estimates round trip", () => {
  const original = emdadForDb();

  it("stores the estimate relationally and loads it back in the domain shape with exact figures", async () => {
    await as(userB, () => rpc("save_estimate", [JSON.stringify(original)]));
    const [loaded] = await as(userA, () => rpc<unknown[]>("load_estimates", [original.id]));
    const parsed = EstimateSchema.parse(loaded); // the browser validates exactly like this
    expect(parsed.costing.lineItems.map((l) => l.name)).toEqual(original.costing.lineItems.map((l) => l.name));
    expect(parsed.costing.measurements).toHaveLength(original.costing.measurements.length);
    expect(parsed.costing.lineItems.find((l) => l.name === "Floor")?.quantitySource.measurementId).toBe(original.costing.lineItems[0].quantitySource.measurementId);
    expect(parsed.costing.lineItems.find((l) => l.name === "LED wall")?.queries[0].text).toMatch(/4\.5 × 2\.5/);

    const calc = calculateEstimate(parsed.costing);
    expect(calc.directCost).toBe("65550.00");
    expect(calc.sellingPriceExVat).toBe("85215.00");
    expect(calc.blockingCount).toBe(calculateEstimate(original.costing).blockingCount);
  });

  it("applies edits atomically: removed lines disappear, queries resolve, review history appends once", async () => {
    const [loaded] = await as(userB, () => rpc<unknown[]>("load_estimates", [original.id]));
    const e = EstimateSchema.parse(loaded);
    const at = new Date().toISOString();
    e.costing.lineItems = e.costing.lineItems.filter((l) => l.name !== "Hidden");
    e.costing.lineItems = e.costing.lineItems.map((l) => ({ ...l, queries: l.queries.map((q) => resolveQuery(q, "Confirmed", at)) }));
    e.costing.measurements = e.costing.measurements.map((m) => (m.componentName.startsWith("Booth floor") ? setReviewStatus(m, "approved", "Checked p14", at) : m));
    await as(userB, () => rpc("save_estimate", [JSON.stringify(e)]));
    await as(userB, () => rpc("save_estimate", [JSON.stringify(e)])); // idempotent re-save

    const [again] = await as(userA, () => rpc<unknown[]>("load_estimates", [original.id]));
    const reloaded = EstimateSchema.parse(again);
    expect(reloaded.costing.lineItems.some((l) => l.name === "Hidden")).toBe(false);
    expect(reloaded.costing.lineItems.flatMap((l) => l.queries).every((q) => q.status === "resolved")).toBe(true);
    const floor = reloaded.costing.measurements.find((m) => m.componentName.startsWith("Booth floor"))!;
    expect(floor.reviewStatus).toBe("approved");
    expect(floor.reviewHistory.filter((h) => h.action === "approved")).toHaveLength(1);
    expect(calculateEstimate(reloaded.costing).directCost).toBe("62550.00"); // 65,550 − 3,000 ("Hidden")
  });

  it("enforces roles and tenant isolation", async () => {
    await expect(as(userV, () => rpc("save_estimate", [JSON.stringify(original)]))).rejects.toThrow(/read-only/);
    expect(await as(userV, () => rpc<unknown[]>("load_estimates", []))).toHaveLength(1);
    expect(await as(userX, () => rpc<unknown[]>("load_estimates", []))).toHaveLength(0);
    await expect(as(userX, () => rpc("save_estimate", [JSON.stringify(original)]))).rejects.toThrow(/another organisation|row-level security/);
    // A status of "approved" sent by a browser without a recorded version is downgraded.
    await as(userB, () => rpc("save_estimate", [JSON.stringify({ ...original, status: "approved" })]));
    const { rows } = await db.query<{ status: string }>(`select status from estimates where id = $1`, [original.id]);
    expect(rows[0].status).toBe("draft");
  });
});

describe("server-recorded approvals and quotations", () => {
  it("accepts an approval only with the server key, and versions are immutable", async () => {
    const [loaded] = await as(userB, () => rpc<unknown[]>("load_estimates", [])) as unknown[];
    const e = EstimateSchema.parse(loaded);
    const at = new Date().toISOString();
    // Prepare as an estimator would: confirm units, answer queries, approve the measured floor.
    e.costing.lineItems = e.costing.lineItems.map((l) => ({
      ...(l.quantityUnit === "unit_tbc" ? { ...l, quantityUnit: "each" as const, rateUnit: "each" as const } : l),
      queries: l.queries.map((q) => (q.status === "open" ? resolveQuery(q, "Confirmed", at) : q)),
    }));
    e.costing.measurements = e.costing.measurements.map((m) =>
      m.componentName.startsWith("Booth floor") && m.reviewStatus !== "approved" ? setReviewStatus(m, "approved", "Checked p14", at) : m,
    );
    const approved = approveEstimate(e, { versionId: randomUUID(), approvedBy: "Estimator B", note: "", acknowledgeWarnings: true, at: new Date().toISOString() });
    const version = approved.versions.at(-1)!;

    await expect(as(userB, () => rpc("record_approved_version", ["wrong-key", e.id, JSON.stringify(version)]))).rejects.toThrow(/Not permitted/);
    await expect(as(userX, () => rpc("record_approved_version", [SERVER_KEY, e.id, JSON.stringify(version)]))).rejects.toThrow(/not found/);
    await as(userB, () => rpc("record_approved_version", [SERVER_KEY, e.id, JSON.stringify(version)]));
    await expect(as(userB, () => rpc("record_approved_version", [SERVER_KEY, e.id, JSON.stringify(version)]))).rejects.toThrow(/expected v2/);

    const [after] = await as(userA, () => rpc<unknown[]>("load_estimates", [e.id]));
    const reloaded = EstimateSchema.parse(after);
    expect(reloaded.status).toBe("approved");
    expect(reloaded.versions[0].calculation.sellingPriceExVat).toBe(version.calculation.sellingPriceExVat);
    await expect(db.query(`update estimate_versions set selling_price_ex_vat = 1`)).rejects.toThrow(/immutable/);

    // Quotations: numbered per organisation and year, total must equal the approved price.
    const settings = JSON.stringify(DEFAULT_COMPANY_SETTINGS);
    const total = version.calculation.sellingPriceExVat;
    await expect(as(userB, () => rpc("record_quotation", [SERVER_KEY, version.id, "2026-10-29", "2026-11-28", "1.00", settings]))).rejects.toThrow(/does not match/);
    const q1 = await as(userB, () => rpc<{ number: string }>("record_quotation", [SERVER_KEY, version.id, "2026-10-29", "2026-11-28", total, settings]));
    const q2 = await as(userB, () => rpc<{ number: string }>("record_quotation", [SERVER_KEY, version.id, "2026-10-30", "2026-11-29", total, settings]));
    expect([q1.number, q2.number]).toEqual(["XLQ-2026-0001", "XLQ-2026-0002"]);
    const [quoted] = await as(userA, () => rpc<unknown[]>("load_estimates", [e.id]));
    expect(EstimateSchema.parse(quoted)).toMatchObject({ status: "quoted", quotations: [{ number: "XLQ-2026-0001" }, { number: "XLQ-2026-0002" }] });
  });

  it("blocks direct inserts of versions by signed-in users", async () => {
    await expect(
      as(userB, () => db.query(`insert into estimate_versions (organisation_id, estimate_id, version_no, snapshot, engine_version, currency, direct_cost, cost_base, selling_price_ex_vat, approved_by_name) select organisation_id, id, 9, '{}', 'x', 'SAR', 1, 1, 1, 'forged' from estimates limit 1`)),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("background analysis jobs", () => {
  const estimate: Estimate = { ...emdadForDb(), documents: [] };
  const docId = randomUUID();
  const sha = "ab".repeat(32);
  const [job1, job2, job3] = [randomUUID(), randomUUID(), randomUUID()];
  const output = JSON.stringify({ result: { measurements: [] }, model: "claude-opus-5-5", warnings: [] });
  const create = (uid: string, key: string, id: string, force = false) =>
    as(uid, () => rpc<string>("create_analysis_job", [key, id, estimate.id, docId, "claude-opus-5-5", "prompt-1", force]));
  // The worker calls with the publishable key and no user session: the anon role.
  async function asWorker<T>(fn: () => Promise<T>): Promise<T> {
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    await db.exec("set role anon");
    try {
      return await fn();
    } finally {
      await db.exec("reset role");
    }
  }
  const jobs = (uid: string) => as(uid, async () => (await db.query<{ id: string; status: string; reused: boolean }>(`select id, status, reused from analysis_jobs order by created_at`)).rows);

  beforeAll(async () => {
    estimate.documents = [{ id: docId, fileName: "Booth.pdf", sha256: sha, sizeBytes: 1000, pageCount: 4, uploadedAt: new Date().toISOString(), storage: "supabase" }];
    await as(userB, () => rpc("save_estimate", [JSON.stringify(estimate)]));
  });

  it("creates a job only with the server key, for an editor, for a document in their organisation", async () => {
    await expect(create(userB, "wrong-key", job1)).rejects.toThrow(/Not permitted/);
    await expect(create(userV, SERVER_KEY, job1)).rejects.toThrow(/Not permitted/);
    await expect(create(userX, SERVER_KEY, job1)).rejects.toThrow(/Document not found/);
    expect(await create(userB, SERVER_KEY, job1)).toBe("queued");
    await expect(create(userB, SERVER_KEY, job1)).rejects.toThrow(/duplicate key/);
  });

  it("lets the worker claim a job once and record the result; only the organisation can read it", async () => {
    await expect(asWorker(() => rpc("claim_analysis_job", ["wrong-key", job1]))).rejects.toThrow(/Not permitted/);
    expect(await asWorker(() => rpc("claim_analysis_job", [SERVER_KEY, job1]))).toMatchObject({ fileName: "Booth.pdf", pageCount: 4, sha256: sha });
    expect(await asWorker(() => rpc("claim_analysis_job", [SERVER_KEY, job1]))).toBeNull(); // a retried invocation does nothing
    expect(await asWorker(() => rpc("finish_analysis_job", [SERVER_KEY, job1, output, null, null, false, 1000, 2000]))).toBe(true);
    expect(await asWorker(() => rpc("finish_analysis_job", [SERVER_KEY, job1, null, "upstream", "late failure", true, null, null]))).toBe(false);

    expect(await jobs(userV)).toMatchObject([{ id: job1, status: "succeeded" }]);
    expect(await jobs(userX)).toEqual([]);
    expect(await asWorker(async () => (await db.query(`select id from analysis_jobs`)).rows)).toEqual([]);
    // Members cannot write jobs directly: the result can only come from the worker.
    const forged = await as(userB, () => db.query(`update analysis_jobs set status = 'failed'`));
    expect(forged.affectedRows ?? 0).toBe(0);
  });

  it("reuses a stored result for the same file, model and prompt unless forced; failures are recorded", async () => {
    expect(await create(userB, SERVER_KEY, job2)).toBe("succeeded");
    expect(await create(userB, SERVER_KEY, job3, true)).toBe("queued");
    expect(await asWorker(() => rpc("finish_analysis_job", [SERVER_KEY, job3, null, "rate_limited", "Wait and retry.", true, null, null]))).toBe(true);
    const { rows } = await db.query<{ id: string; status: string; reused: boolean; output: unknown; error_code: string | null; retryable: boolean }>(
      `select id, status, reused, output, error_code, retryable from analysis_jobs where id in ($1, $2)`,
      [job2, job3],
    );
    expect(rows.find((r) => r.id === job2)).toMatchObject({ status: "succeeded", reused: true, output: JSON.parse(output) });
    expect(rows.find((r) => r.id === job3)).toMatchObject({ status: "failed", reused: false, output: null, error_code: "rate_limited", retryable: true });
  });

  it("deletes jobs with their document", async () => {
    await as(userB, () => rpc("save_estimate", [JSON.stringify({ ...estimate, documents: [] })]));
    expect(await jobs(userB)).toEqual([]);
  });
});
