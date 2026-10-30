# XLive Estimator

XLive Estimator is the internal costing, estimation and quotation tool for XLive Production. It:

- reads design PDFs (with AI, where configured)
- lets an estimator review every measurement against its source page
- costs approved quantities with a deterministic engine
- produces a pre-VAT customer quotation from an immutable approved version

Design documents live in [`../docs`](../docs):

| Document | Contents |
|---|---|
| [reference-document-analysis.md](../docs/reference-document-analysis.md) | What the three reference PDFs show, and do not show |
| [architecture.md](../docs/architecture.md) | System design, data model, persistence and security |
| [costing-rules.md](../docs/costing-rules.md) | Formulas, units, rounding, readiness rules |
| [ai-analysis-evaluation.md](../docs/ai-analysis-evaluation.md) | Claude's analysis of the reference PDFs compared with the manual analysis |

## Quick start

```bash
npm install          # also copies the pdf.js worker into public/
npm run dev          # http://localhost:3000
```

The app runs in one of two modes:

| Mode | When | Storage |
|---|---|---|
| **Connected** | `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set | Supabase Postgres plus private Storage, with sign-in and Row Level Security |
| **Demo** | No Supabase variables | Browser only (localStorage and IndexedDB), with three labelled reference samples |

### First sign-in (connected mode)

1. Open `/login` and choose **Create an account**. Confirm the email, then sign in.
2. The **first** account to sign in creates the organisation and becomes its administrator.
3. Colleagues create accounts the same way. The administrator then adds each one under **Settings → Team members** as estimator, viewer or admin. An account that has not been added gets no access, and no one else can create a second organisation.
4. As administrator, check **Settings** (quotation terms are placeholders), then **Price catalogue → Import provisional XLive reference rates** if wanted.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm test` | Vitest: costing engine, reference figures, quotation PDF, database integration (PGlite) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint |
| `npm run build` | Production build (Cache Components enabled) |
| `npm run check` | typecheck + lint + tests |

## Supabase

- **Project:** `xlive-estimator` (ref `noccjwfcurghtfmpyupi`, region eu-central-1 / Frankfurt), in the ZarnexHolding organisation.
- **Schema:** `supabase/migrations/` (four files, all applied):
  - tables
  - Row Level Security on every table
  - private Storage buckets
  - immutability triggers
  - the app functions
- **Applying the schema to a new project:** `supabase db push`, or run the four files in order in the SQL editor.
- **Persistence boundary:** the browser reads and writes through `load_estimates` and `save_estimate`. Both run as the signed-in user, so RLS applies, and each save is one atomic transaction.
- **Approvals and quotations:** recorded only by the app server, through `record_approved_version` and `record_quotation`. The server reloads the estimate from the database, recalculates it with the costing engine, then calls these functions with the **server key**.
- **Server key:** `ESTIMATOR_SERVER_KEY` stays in the server environment. The database stores only its SHA-256 hash (`private.server_keys`). To rotate it:

  ```sql
  update private.server_keys set key_hash = encode(sha256(convert_to('<new key>', 'UTF8')), 'hex') where name = 'app_server';
  ```

- **PDFs:** stored at `project-documents/{organisation}/{estimate}/{document}.pdf`. In connected mode, AI analysis reads the file from Storage on the server, so large PDFs never pass through an API request body.
- **AI analysis jobs:** `create_analysis_job`, `claim_analysis_job` and `finish_analysis_job` (fourth migration).
  - The background worker has no user session. It reads the PDF through a 15-minute signed URL, and records the result with the server key.
  - A job for a file, model and prompt that was already analysed reuses the stored result, with no new AI call, unless the estimator chooses *Re-run*.

## Status of this milestone

### Working and verified

- **Costing engine:** 35 unit tests, covering:
  - EMDAD SAR 65,550 → SAR 85,215 at a 30 % markup
  - the IDCUBE SAR 3,250 unresolved difference
  - markup vs margin, missing prices, unit mismatch
  - historical versions and the quotation PDF text
- **Database (6 PGlite integration tests on the real migrations):**
  - only the first user can bootstrap the organisation; later members are added by an admin
  - the save/load round trip keeps exact decimals
  - edits are atomic, review history is append-only, and viewer and cross-tenant access are blocked
  - approvals and quotations require the server key; versions are immutable; quotation numbering is per organisation
- **Live Supabase:**
  - migrations applied; the security advisor reports only the intended exposure of key-checked or self-checking functions
  - a smoke test as a simulated user, rolled back afterwards, confirmed the same behaviour
- **App against the live project:**
  - signed-out visitors are redirected to `/login`
  - approve, quotation and analysis routes refuse requests without a session
  - direct database calls without a session are denied

- **Signed-in workflow (29 Oct 2026, with the administrator's session):**
  - sign-up, email confirmation and onboarding created the organisation, the admin profile and the default settings
  - a test estimate went through creation, a 10.9 MB PDF upload to private Storage, the reference extraction, measurement approval and costing (SAR 14,550 → SAR 18,915 at a 30 % markup)
  - after a full reload, the data and the PDF came back from Supabase
  - the server-recorded approval (v1) and quotation XLQ-2026-0001 were each checked in the database
  - all test records were then removed, so live numbering starts at XLQ-2026-0001

- **Claude document analysis (30 Oct 2026, `claude-opus-5-5`):** all three reference PDFs were analysed through the app in connected mode.
  - Each run took 2.4 to 4.4 minutes and cost about $0.40–0.65.
  - A prompt rule for grid overlays was added afterwards. It was re-tested on IDCUBE (the false conflict is fixed) and on EMDAD (no degradation).
  - All key conflicts in the manual analysis were found independently, and no figures were invented.
  - Results are in [ai-analysis-evaluation.md](../docs/ai-analysis-evaluation.md). The test estimate was deleted afterwards.

### Not built yet

- Several people editing the *same* estimate at once: the last save wins (no live merge).
- Customer quotation formats other than "scope + total".
- Editable costing rules.
- Password reset.

## Deployment (Netlify Free plan)

**Why Netlify Free:**

- The Free plan allows business use. Vercel's free Hobby plan does not.
- It runs Next.js 16 with Cache Components through its own adapter.
- Its **Background Functions** run for up to 15 minutes. AI analysis takes 2.5–4.5 minutes, so it runs in one (`netlify/functions/analysis-job.mts`, see [architecture](../docs/architecture.md#ai-analysis-flow)).

### Steps

1. **Put the code in a private Git repository** (for example GitHub). The root `.gitignore` keeps `reference-docs/` (client files) and `.env*` (secrets) out of it.
2. **Create the site.** In Netlify, go to *Add new project → Import an existing project*, choose the repository, and set **Base directory** to `estimator-web-app`. The build command (`npm run build`) and Next.js output are detected.
3. **Add environment variables.** Under *Project configuration → Environment variables*, use the values from `.env.local`, with the **Builds, Functions and Runtime** scopes:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `ESTIMATOR_SERVER_KEY` (mark as secret)
   - `ANTHROPIC_API_KEY` (mark as secret)
   - optionally `ANTHROPIC_MODEL`
4. **Configure Supabase sign-in.** Under *Auth → URL Configuration*:
   - set *Site URL* to `https://<site>.netlify.app`
   - add `https://<site>.netlify.app/auth/confirm` to *Redirect URLs*
5. **Deploy, then check the result.** Sign in and run one analysis. In the Netlify function logs, `analysis-job` prints `[analyse] … input_tokens=… output_tokens=…`. It never logs document content.

### Free plan limits

The Free plan has 300 credits a month, with no card and no overage charges. If the credits run out, the site pauses until the next month.

| Use | Credits |
|---|---|
| Production deploy | 15 each (deploy previews are free), so batch changes rather than deploying every edit |
| One analysis (4.5 min at 1 GB) | ≈ 0.75 (compute is 10 credits per GB-hour) |
| Page views | 2 per 10,000 requests |
| Bandwidth | 20 per GB |

### Other notes

- **Claude usage** is billed by Anthropic separately: about $0.40–0.65 per analysis at current prices.
- **Running elsewhere:** analysis jobs run in the app process (`after()`) when the app is not built on Netlify, for example `next start` on your own server. On a host with short request limits, use a background worker as on Netlify.
- **Client files:** do not deploy or commit `../reference-docs`.
