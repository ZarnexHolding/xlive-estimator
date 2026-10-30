# Architecture

XLive AI Estimator is an internal costing and quotation tool. It is built so that it can later serve other production companies.

## Repository layout

```
xlive-estimator/
├── reference-docs/          Client design PDFs used for analysis and testing (confidential: do not deploy or publish)
├── docs/                    Reference analysis, architecture, costing rules
└── estimator-web-app/       Next.js application (deploy this folder: Netlify "Base directory")
    ├── src/domain/          Pure TypeScript business logic: no React, no I/O, no AI
    │   ├── units.ts           Units of measure and labels
    │   ├── money.ts           Decimal arithmetic and rounding policy
    │   ├── schemas.ts         Zod schemas and inferred types for every domain object
    │   ├── costing/           Deterministic costing engine (line items, allowances, pricing, issues)
    │   ├── catalogue.ts       Versioned price catalogue operations
    │   ├── versioning.ts      Immutable approved-version snapshots
    │   ├── quotation.ts       Customer-facing quotation model built from an approved version
    │   └── reference-data/    Provisional XLive reference estimates (EMDAD, IDCUBE, SMC)
    ├── src/ai/              Server-only AI document analysis (provider interface, Claude implementation, prompt, schema)
    ├── src/lib/             App plumbing: env, store (demo + Supabase behind one interface), Supabase clients, server session helpers
    ├── src/proxy.ts         Session refresh and sign-in redirect (connected mode)
    ├── src/components/      UI: ui/ (shadcn), layout/, estimate/, pdf/, catalogue/, quotation/
    ├── src/app/             Routes (App Router) and API route handlers
    ├── supabase/migrations/ Reproducible SQL schema with Row Level Security and storage policies
    └── tests/               Vitest unit tests (costing engine and reference validation)
```

## The two systems

| | AI interpretation | Deterministic costing |
|---|---|---|
| Location | `src/ai/` (server only) | `src/domain/` (pure functions) |
| Input | PDF document | Approved measurements, line items, rates, pricing config |
| Output | `ExtractionResult`: measurements, components, conflicts, questions, each with page, basis and confidence | `EstimateCalculation`: line amounts, subtotals, allowances, selling price, blocking issues and warnings |
| Trust | Untrusted. Validated with Zod, then stored as **unreviewed** | Reproducible: same input gives the same output (unit-tested) |
| May do | Read drawings, propose quantities, suggest categories | Multiply, sum, apply allowances and markup or margin, validate units |
| May not do | Produce money figures that reach an estimate | Invent quantities or rates |

AI output never becomes a line-item amount directly. A measurement must be reviewed (`approved`) before a line item that uses it can be part of an approved estimate. The engine re-checks this every time it calculates.

## Key decisions

1. **Decimal arithmetic.** `decimal.js` runs every money and quantity calculation. Values move between layers as decimal **strings** (`"11550.00"`), never as JS floats. Line amounts are rounded half-up to 2 dp. Subtotals sum the rounded line amounts, so displayed lines always add up to displayed totals. Postgres columns use `numeric`.
2. **Units are explicit and enforced.** A line has a quantity unit and its rate has a rate unit. `quantity_x_rate` requires both to match, so a square-metre quantity cannot be multiplied by a per-piece rate. Lump sums use the `lump_sum` method with a fixed amount and no multiplication. A reference quantity whose unit is unknown uses `unit_tbc`. It calculates, so the reference total can still be checked, but it raises a **blocking** issue until someone confirms the unit.
3. **Missing never means zero.** A line without a rate is reported as *Price not configured*. Its amount is `null`, it is excluded from totals, and the estimate is marked incomplete. The engine never substitutes 0.
4. **Markup, margin and fixed price are distinct modes.** The selected mode is stored and shown wherever the price is shown. Markup gives `cost × (1 + r)`. Margin gives `cost ÷ (1 − r)`, valid for `0 ≤ r < 1`. Fixed price requires a recorded reason.
5. **Allowances are separate lines of the calculation.** Overhead and contingency are each set per estimate (`not_set`, `none`, `percent`, or `fixed`). `not_set` raises a warning, because the company has not supplied a policy and an estimator must choose. Allowances are never folded into line items, so nothing is charged twice.
6. **Open queries block approval.** Any line or measurement can carry clarification queries, such as "What does 'Hidden' mean?". Unresolved queries are blocking issues. The same applies to unresolved reconciliation differences (IDCUBE: SAR 3,250).
7. **Approved versions are immutable snapshots.** Approving an estimate stores a complete snapshot: line items with the copied rates, the measurements used, pricing config, computed totals, and the engine version. Later catalogue edits cannot change it. Catalogue rates are append-only versions. A line stores the rate value *and* the catalogue entry or version it came from.
8. **Quotations come only from approved versions.** A quotation stores the version id and the totals it was generated from. Quotation totals exclude VAT and say so. The default customer format shows item descriptions and the final price only, with no internal rates, labour costs or markup.
9. **The AI provider sits behind an interface.** `DocumentAnalysisProvider` has one Claude implementation (`@anthropic-ai/sdk`). The model comes from `ANTHROPIC_MODEL` (default `claude-opus-5-5`). Structured output is constrained by a JSON schema and re-validated with Zod.

## Runtime modes

The UI talks to one `AppStore` interface (`src/lib/store/types.ts`), which has two implementations. A persistent banner always shows which one is active.

| Mode | When | Persistence | Sign-in |
|---|---|---|---|
| **Connected** | `NEXT_PUBLIC_SUPABASE_URL` and the publishable key are set | Supabase Postgres and private Storage, protected by RLS (`SupabaseStore`) | Supabase Auth (email and password). `src/proxy.ts` refreshes the session and redirects signed-out visitors to `/login`. |
| **Demo** | No Supabase variables | Browser only: `localStorage` for estimates, IndexedDB for PDFs (`DemoStore`). The banner says the data is not saved to a database. | None |

AI analysis is real Claude analysis whenever `ANTHROPIC_API_KEY` is set. Otherwise the estimator can explicitly load the **developer-prepared reference extraction** for a recognised reference PDF, labelled *"Reference analysis · not AI"*. The app never switches to mock results silently.

### Connected-mode data flow

- **Edits.** Each change updates the screen immediately and is queued per estimate. Queued saves are merged into one, because `save_estimate(payload)` writes the complete estimate in a single transaction. A failed save reloads the estimate from the database, so unsaved data is never shown as saved.
- **Loads.** `load_estimates()` and `load_catalogue()` return the domain JSON, with numbers as exact decimal strings (`trim_scale(numeric)::text`). The browser re-validates them with Zod.
- **Approval** (`POST /api/estimates/{id}/approve`):
  1. The server, acting as the signed-in user, reloads the estimate from the database.
  2. It runs `approveEstimate`, which recalculates with the engine.
  3. It calls `record_approved_version(server_key, …)`.
  4. The database checks the key's SHA-256 against `private.server_keys`, allocates the next version number under a lock, and writes the immutable snapshot plus an audit event.
- **Quotation** (`POST /api/estimates/{id}/quotations`):
  1. The server builds the quotation from the stored version.
  2. `record_quotation` re-checks the total against the version and allocates `PREFIX-YEAR-NNNN` under a per-organisation lock.
  3. It stores the settings snapshot, so a re-download reproduces the issued document.
  4. The PDF is rendered in the browser from the returned document.
- **Onboarding.** The first signed-in user creates the organisation (`create_organisation`) and becomes admin. After that, `create_organisation` refuses. Further users must be added by an admin (`add_member`), so an open sign-up page grants no access by itself.

## AI analysis flow

An analysis takes 2.5–4.5 minutes, longer than a synchronous request may run on free hosting. In connected mode it therefore runs as a **background job**. The browser uploads PDFs straight to Supabase Storage (RLS-checked path `{org}/{estimate}/{doc}.pdf`), so no large file passes through the app server.

```
Browser ── POST /api/analysis-jobs {jobId, estimateId, documentId, force}
             ├─ requireEditor (session, role) · document lookup under RLS · size check
             ├─ create_analysis_job (server key): job row "queued", or "succeeded" when an earlier
             │    result for the same file SHA-256 + model + prompt exists (reused, no AI call)
             ├─ signed Storage URL for the PDF (15 min)
             └─ dispatch, then answer 202 at once:
                  Netlify   → POST /.netlify/functions/analysis-job (Background Function, ≤ 15 min, server key)
                  otherwise → after() in the app process (development, self-hosting)

Worker (src/lib/server/analysis-job.ts)
             ├─ claim_analysis_job (server key): queued → running; a retry finds nothing to claim
             ├─ download via signed URL · %PDF check · SHA-256 must match the document record
             ├─ ClaudeDocumentAnalysisProvider (streamed messages, structured output, Zod re-validation)
             └─ finish_analysis_job (server key): { result, model, warnings } + token usage, or error code/message

Browser (useAnalysisJobs, on every step of the open estimate)
             └─ polls the job row every 5 s (RLS read) → imports measurements as "unreviewed",
                or marks the run failed (also when a job is unfinished after 17 minutes)
```

- Claude receives the PDF as a `document` block. The API rasterises each page, so drawings and image-only pages (EMDAD, IDCUBE) are read visually, not just as text.
- **Streaming.** The request is streamed so a multi-minute connection carries data rather than sitting idle; the final message carries the parsed structured output.
- **Errors** are mapped to: `not_configured` · `invalid_file` · `rate_limited` · `timeout` · `upstream` · `invalid_output` · `refused`. The worker records every outcome and never throws, because Netlify retries a failed background invocation.
- **The prompt** (`src/ai/prompt.ts`) is generic. It carries no XLive rates or rules: company-specific costing knowledge lives in the catalogue and rules data, not in prompts.
- **Demo mode** (no database) keeps the synchronous `POST /api/analyse` with a multipart upload, for local use only.

## Data model (Postgres)

The full SQL is in `estimator-web-app/supabase/migrations/`. Every private table has `organisation_id` and RLS: `organisation_id = private.current_org_id()`.

| Table | Purpose |
|---|---|
| `organisations`, `profiles` | Tenant and user (role: `admin`, `estimator`, `viewer`) |
| `company_settings` | Quotation header details, validity, terms, exclusions, default currency |
| `projects` | Client, project type, venue, currency, status |
| `documents` | Uploaded PDF metadata (storage path, SHA-256, size, pages) |
| `document_analyses` | Each AI run: provider, model, status, error, validated output (audit) |
| `analysis_jobs` | Background analysis jobs: status, validated output, token usage, reuse. Written only by key-checked functions; members read their organisation's jobs |
| `estimates` | Working draft: pricing mode, markup or margin, allowances, status |
| `measurements` | Extracted or manual measurements: dimensions, derived quantity, formula, page, basis, confidence, review status |
| `measurement_reviews` | Review history: approve, reject or edit, with before/after values and reason |
| `line_items` | Cost lines: method, quantity and unit, rate and rate unit, sources, catalogue link, measurement link |
| `estimate_queries` | Open clarification questions attached to an estimate, line or measurement |
| `reconciliations` | Separately reported totals to reconcile against the line sum |
| `catalogue_items`, `catalogue_rates` | Price catalogue. Rates are append-only versions with a `provisional` or `verified` flag |
| `costing_rules` | Reusable formula templates (`length × width`, `count × rate`, …) |
| `estimate_versions` | Immutable approved snapshots. A trigger blocks update and delete. |
| `quotations` | Issued quotations: version id, number, dates, total, VAT treatment. Immutable. |
| `audit_events` | Important changes: approvals, overrides, catalogue edits |

The JSON snapshot in `estimate_versions.snapshot` is deliberate: an approved version is a document that must not change. Its headline totals are duplicated into numeric columns for querying.

**Storage:** the private buckets `project-documents` and `quotations` use object paths that start with `{organisation_id}/`. Policies compare the first path segment with the caller's organisation.

**Authorisation:** RLS enforces tenant isolation in the database, not just in the UI.

- Catalogue, settings and member management require the `admin` role.
- Viewers can read but `save_estimate` refuses them.
- Signed-in users have no insert policy on `estimate_versions` or `quotations`. Those rows are written only by the key-checked SECURITY DEFINER functions, so a browser cannot submit a doctored approved total.
- Every app function is revoked from `anon`.

The Supabase security advisor flags the six SECURITY DEFINER functions as callable by signed-in users. This is intentional: each one checks role and organisation itself, and the two recorders also require the server key.

**Functions** (`supabase/migrations/20261029000100_app_functions.sql`):

| Group | Functions |
|---|---|
| Session and membership | `get_app_context`, `create_organisation`, `add_member`, `list_members` |
| Load and save (as the user) | `load_estimates`, `load_catalogue`, `save_estimate` |
| Server-only recorders | `record_approved_version`, `record_quotation` |

**Verification:** `tests/db.test.ts` applies the real migrations to PGlite (Postgres 17 in WASM), with stand-ins for Supabase's `auth` and `storage` schemas. It exercises bootstrap, the round trip, roles, tenant isolation, the server key, immutability and quotation numbering.

## Status model

```
draft ──▶ in_review ──▶ approved (vN snapshot) ──▶ quoted
  ▲            │              │
  └────────────┘   edit after approval starts a new draft; vN is kept
```

`Ready for quotation` is computed, not stored. It requires:

- zero blocking issues: missing rates, unit mismatches, unconfirmed units, unapproved measurements, open queries, or unresolved reconciliation
- a valid pricing configuration

## Testing

- `tests/` (Vitest) covers the costing engine: the EMDAD and IDCUBE reference figures, markup vs margin, missing prices, unit mismatch, snapshot immutability, and the quotation model and VAT exclusion.
- Run the checks with `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`.

## Status of implementation

The README in `estimator-web-app/` has the current milestone checklist (what works, what remains, and what needs external credentials).
