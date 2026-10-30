# AI analysis evaluation: Claude vs manual reference analysis

**Date:** 30 October 2026
**Model:** `claude-opus-5-5`, adaptive thinking, effort `high`, structured output
**Path:** each PDF was uploaded to private Storage through the app (connected mode, signed-in administrator), and **Analyse with AI** was clicked
**Compared against:** [reference-document-analysis.md](reference-document-analysis.md), which was prepared by hand with programmatic grid verification

The test estimate and its files were deleted afterwards.

| Document | Pages | Time | Measurements | Conflicts / questions | Tokens (in / out) | Cost* |
|---|---:|---:|---:|---:|---|---:|
| EMDAD 14 × 5 | 16 | 265 s | 51 | 4 / 13 | not logged | — |
| IDCUBE 6 × 6 | 11 | 156 s | 27 | 4 / 11 | 20,310 / 15,825 | ≈ $0.40 |
| SMC Paddock | 22 | 145 s | 21 | 4 / 14 | 38,691 / 15,479 | ≈ $0.46 |

\* At $4 per million input tokens and $20 per million output tokens. Output tokens include thinking. The first EMDAD run happened before token logging was added. Its re-test (below) measured ≈ $0.62.

## Verdict

- **No invented figures.** Every number traces to a printed label, a product of labels, or a grid reading that is marked as such.
- Items that cannot be sized are returned as *unresolved* with null quantities.
- **All the key conflicts in the manual analysis were found independently:**
  - the EMDAD LED label vs elevation
  - the SMC width (3 m vs 3.5 m)
  - the SMC peak height (5 m vs 2.5 m)
  - the SMC curved-runway area
  - the SMC Type 01 vs Type 02 choice
- **Several further genuine conflicts were raised** that the manual pass did not record.
- **One false conflict:** the IDCUBE wall height. It was marked low confidence, so review catches it.
- **The output is a strong first draft, not a finished take-off.** Grid-scaled sizes are approximate, and an estimator still has to approve each line.

## Timing and deployment

The request time on the server was 2.4 to 4.4 minutes per document. EMDAD (16 pages) took **265 s**, close to the route's `maxDuration` of 300 s.

On Vercel, functions are capped at 300 s on Hobby. Pro allows up to 800 s. On Hobby, a larger drawing set will probably fail with a 504. The options are:

- a Pro plan with `maxDuration` raised, or
- moving analysis to a background job.

## Prompt fix for grid overlays (applied and re-tested on IDCUBE)

The IDCUBE false conflict came from reading the extent of a grid overlay as the object's height.

**Rule added** to the `grid_scale` definition in `src/ai/prompt.ts`:

> Measure the object's own drawn edges against the grid pitch; a grid or overlay frame often extends beyond the object, so its extent is not the object's size.

**Cache change:** the analysis cache key now includes a fingerprint of the prompt, so a prompt change is never answered from cache.

**Re-test** (IDCUBE: 162 s, 20,359 input / 16,172 output tokens, ≈ $0.40):

- **Fixed.** The wall height is recorded only as the printed 3.5 m. The note states that the grid frame is about 4 m and extends above the wall. No 4 m measurement and no "3.5 m or 4 m?" question remain. The model now asks instead whether 3.5 m is measured from the hall floor or the platform top, which is a valid question.
- **Residual.** It still lists the grid frame among the conflicts. That entry says the frame is not taken as the wall height, so it is informational rather than misleading.
- **No regressions in the key figures:**
  - 36 m² floor and 21 m² back wall
  - two 75" TVs at ≈ 1.65 × 0.95 m
  - demo stations ≈ 1.55 × 0.65 m
  - central panel ≈ 1.6 × 2.45 m (first run: 2.4 m)
  - storage runs ≈ 1.9 m
  - 5 chairs, 1 table and 1 plant
  - both logo finishes, and the platform notch
- **Normal run-to-run variation.** There were 26 measurements (first run: 27) and 3 conflicts (first run: 4); the "plant on the boundary" conflict was not repeated. There were 12 questions (first run: 11).

**EMDAD re-test under the new rule** (252 s, 28,273 input / 25,520 output tokens, ≈ $0.62). EMDAD relies most on grid readings, so it was re-run to check for side effects.

| Grid reading | First run | Re-test | Manual |
|---|---|---|---|
| LED screen as drawn | 4.44 × 2.0 m (low) | 4.45 × 2.0 m (medium) | ≈ 4.4 × 2.0 m |
| Screen bottom / top above floor | 1.07 m / — | 1.1 m / 3.1 m | ≈ 1.1 m / ≈ 3.1 m |
| Header band height | 0.9 m | 0.9 m | ≈ 0.9 m |
| Red fascia LED line | 14.1 lm | 14.0 lm | — |
| Wooden louvers | 2.6 × 3.0 m | 2.5 × 3.0 m | — |
| Podium footprint | 1.37 × 1.37 m | 1.45 × 1.4 m | — |
| Bar / coffee counters | 1.55 × 0.45 / 1.3 × 0.5 m | same | — |
| Carpet zone | 11.6 m² (notch deducted) | 12.58 m² (gross trapezoid) | — |
| Extinguisher niche height | 2.3 m | 1.85 m | — |

- **No degradation.** Readings with a manual reference agree within ≈ 0.1 m, and the screen edges now match the manual reading exactly. The labelled vs drawn LED conflict, the logo count, the louvers and the 56 m² "not a material quantity" note all recur.
- **New in the re-test:**
  - sizes for the two front portals (≈ 2.7 × 3.0 m) and their LED strips
  - the fascia logo (≈ 1.65 × 0.62 m)
  - the reception desk (≈ 1.4 × 0.9 m)
  - storage and meeting room partitions as linear metres
  - an LED skirting conflict: is it 3 sides (24 lm) or 4 sides (38 lm)?
- **More conservative.** Grey vinyl is now *unresolved*, with ≈ 57–58 m² given only in the notes, because the floor inside the rooms is not confirmed.
- **Run-to-run variation.** The re-test returned 40 measurements (first run: 51) and 15 queries (first run: 17).
  - Some items appeared in only one run, for example the carpet-edge LED strip and the room footprints in m².
  - Low-confidence grid readings moved by up to ≈ 0.45 m (the extinguisher niche).
  - This is why every AI measurement is reviewed before use, and missing items are added by the estimator.

SMC uses no grid, so it was not re-run.

## EMDAD

**Agrees with the manual analysis**

- 14 m × 5 m footprint and 4 m height. Read from the labels and cross-checked against the 1 m grid.
- **70 m²** floor area.
- **56 m²** front elevation, flagged as *not* a material quantity.
- **The LED screen conflict.** The label reads 450 × 250 cm (11.25 m²), but the elevation grid gives about 4.44 × 2.0 m (≈ 8.9 m²). Manual reading: ≈ 4.4 × 2.0 m.
  - Screen bottom ≈ 1.07 m above the floor (manual: ≈ 1.1 m).
  - Header band ≈ 0.9 m (manual: ≈ 0.9 m).
- Three "Push through logo" callouts.
- Platform height, lightbox sizes, glass and doors are left **unresolved** rather than guessed.

**Went further than the manual analysis**

- **Two** graphics lightboxes in the renderings against one label (a new conflict).
- About five logo instances in the renderings, compared with three callouts.
- A grid estimate of the carpet zone (≈ 11.6 m²) and the vinyl remainder (≈ 58.4 m²).
- The wooden louver run.
- A full furniture count (2 tables, 8 chairs, 2 stools, 2 sofas), each flagged as probably rented.
- Ten fire extinguishers, flagged as probably client-supplied.

**Missed or not applicable**

- It saw that the LED wall is tiled but did not count the ≈ 9 × 4 tile seams.
- The "45 m² = 45 cabinets" hypothesis needs the costing sheet, which is not in the PDF. That gap is expected.

**Engine behaviour seen:** the podium was stated as 1.88 m². The app recomputed 1.37 × 1.37 = 1.8769 and recorded the discrepancy. This is as designed.

## IDCUBE

**Agrees with the manual analysis**

- 6 × 6 = **36 m²** floor area.
- 6 × 3.5 = **21 m²** back wall, flagged as not a material quantity.
- Two 75" TVs, each ≈ 1.65–1.7 m wide on the grid.
- Demo stations ≈ 1.55 × 0.65 m (manual figure is identical).
- Storage runs ≈ 1.9 m.
- Central panel ≈ 1.6 × 2.4 m (manual figure is identical).
- 5 chairs, 1 table and 1 plant.

**Went further than the manual analysis**

- The two IDCUBE logos look identical in the renderings, but they are labelled with different finishes (3D acrylic cutout vs push-through). This is raised as a conflict.
- A notch or step in the platform at the left front.
- The plant straddles the booth boundary on the plan.
- A question on whether the orange circuit lines are real LED or printed graphics.

**Disagrees**

- It read the red elevation grid box (4 cells) as the wall height, ≈ 4 m, and flagged this against the printed 3.5 m.
- Manual measurement shows the wall's top edge at ≈ 3.45–3.5 m; the overlay box extends above the wall.
- This is a **false conflict**. It was correctly marked low confidence, and the printed 3.5 m was kept as its own measurement. The estimator should reject the grid-scaled 4 m item.

**Not applicable:** the PDF metadata title ("SERB Booth") is not visible to page analysis.

## SMC Paddock

**Agrees with the manual analysis.** Every row of the manual SMC tables is matched:

- **Two design options.** Type 01 has the car at the low end; Type 02 has it at the elevated end. The model asks which option to quote.
- **Width conflict.** 3 m on pages 15, 16 and 21, against 3.5 m on pages 4 and 18.
- **Peak height conflict.** 5 m against 2.5 m on page 15.
- **The "0.4/5m" label** is split into a 0.4 m base height and a 5 m peak height, not merged into one figure.
- **OLED panels:** 2 × 9 × 0.75 = **13.5 m²**, with the product type left open.
- **Floor LED runway:** **90 m²** nominal (105 m² at 3.5 m). It is flagged that the area along the curve is larger than 30 m on plan, and the developed length is left unresolved.
- **Left unresolved:**
  - cladding along the curved side walls
  - the MS structural frame
  - the LED neon length
  - RGB underlighting
  - DMX and media server
- **Structural design and loads** are raised, including the Type 02 car mounted at height.

**Went further:**

- A gross 3 × 5 m (15 m²) end face for the high-end cladding, at medium confidence.
- Questions on outdoor and daylight suitability, wind and ballast, and content production.
