# Reference document analysis

Analysis of the three design PDFs in `reference-docs/`, prepared before the costing workflow was built. It records what the drawings actually support, so that the costing engine, the AI extraction prompt, and the demo data never claim more than the documents show.

## Method

- **Text layer.** Extracted with PyMuPDF. EMDAD and IDCUBE are Canva exports in which every page except the cover and contact page is a flat image: **the text layer contains no dimensions or labels at all.** A text-only extractor returns nothing useful for these two files. SMC has a text layer for its labels and its specification page.
- **Visual inspection.** Every page was rendered at 60 dpi to classify it. Pages with dimensions were rendered at 130–260 dpi and read visually.
- **Grid verification.** EMDAD and IDCUBE overlay a red 1 m grid on their plan and elevation views. The grid lines were detected programmatically (by counting red pixels per row and column). Labelled dimensions were checked against the number of equal-pitch cells. Pixel distances were converted to metres using the measured grid pitch.

### Evidence classes used below

| Code | Meaning |
|---|---|
| **E** | Dimension explicitly printed on the drawing |
| **D** | Derived mathematically from E values |
| **G** | Inferred from the drawing grid/scale (accuracy about ±0.1–0.3 m) |
| **V** | Visual inference from a rendering (counts and presence, not dimensions) |
| **U** | Cannot be determined from the PDF |

### Document fingerprints (SHA-256)

| File | Pages | SHA-256 |
|---|---|---|
| `Costing EMDAD 14m x 5m.pdf` | 16 | `b728b281c3d829dc4569d616d0d0510628d108c3f1404e506880344b98dbff1b` |
| `IDCUBE 6m X 6m XLive.pdf` | 11 | `701a9d022752366c9c7e2a70db8ab78353b998280a79bb432ac0fb3fe1b0c2ac` |
| `SMC Paddock Car Display V2.pdf` | 22 | `f825e8bf9786049c36ed8c10993649069832b65f6edf2535bd5aafb6be5dc03c` |

The app uses these hashes to recognise a reference file. When AI analysis is not configured, it can then offer the developer-prepared extraction below, clearly labelled as **not AI output**.

### General observation

All three files are **client presentation decks**: renderings plus annotated overlays. They are not construction drawings. None has a title block, drawing scale, revision number, section, construction detail, or material schedule. Any estimate built from them needs estimator confirmation of the construction method.

---

## Document A — EMDAD 14 m × 5 m booth

File `Costing EMDAD 14m x 5m.pdf`: 16 pages at 960 × 540 pt, XLive-branded.

### Page map

| Page | Content |
|---|---|
| 1 | Cover (XLive branding) |
| 2–6 | Exterior perspective renderings |
| 7–11 | Interior renderings: reception desk, display shelves, LED wall, bar counter, meeting-room lounge with wall-mounted screen |
| 12 | Aerial rendering |
| 13 | **Annotated aerial rendering**: component labels, including "LED screen 450x250cm" |
| 14 | **Top view / floor plan**: labels `14m` and `5m`, 1 m grid |
| 15 | **Front elevation**: labels `14m` and `4m`, 1 m grid |
| 16 | Contact page |

**Component labels on page 13:** Meeting room · Push through logo (×3 labels) · LED screen 450x250cm · Display shelf (×2) · Display podium · Carpet flooring · Reception desk with push through logo · Wooden louvers · Storage room · Graphics lightbox · Display shelves · Storage cabinet · Grey vinyl flooring with LED skirting.

### Verified dimensions

| Item | Value | Source | Class | Verification |
|---|---|---|---|---|
| Booth length | 14 m | p14, p15 | E | 14 equal grid cells on both pages ✔ |
| Booth depth | 5 m | p14 | E | 5 grid cells at the same pitch (square cells) ✔ |
| Front elevation height | 4 m | p15 | E | 4 grid cells, square to the horizontal pitch ✔ |
| LED screen | 4.50 m × 2.50 m | p13 label | E | See conflict 1 |

### Reliably derived quantities

| Quantity | Formula | Value | Class | Caveat |
|---|---|---|---|---|
| Floor plot area | 14 × 5 | **70 m²** | D | Gross plot. It includes the storage-room and meeting-room footprints and two different finishes (carpet and grey vinyl). |
| Front elevation, gross rectangle | 14 × 4 | **56 m²** | D | **Not** a wall material quantity. The booth front is open. The elevation shows the back wall, header and openings seen from the front. |
| LED screen (labelled) | 4.5 × 2.5 | **11.25 m²** | D | From the p13 label. Conflicts with the elevation (see below). |

### Grid-inferred measurements (estimator must confirm)

| Item | Approximate value | Page | Class |
|---|---|---|---|
| LED screen as drawn in elevation | ≈ 4.4 m wide × ≈ 2.0 m tall (≈ 8.9 m²). Bottom edge ≈ 1.1 m and top edge ≈ 3.1 m above floor. | p15 | G |
| LED panel seams visible in elevation | ≈ 9 columns × 4 rows of ≈ 0.5 m tiles | p15 | G/V |
| Header / fascia band height | ≈ 0.9 m | p15 | G |
| Storage room footprint | ≈ 1.9 m × 2.2 m (top-left of plan) | p14 | G (low) |
| Meeting room footprint | ≈ 3.0 m × 2.6 m (top-right of plan) | p14 | G (low) |
| Carpet area (trapezoid in front of podium) | ≈ 12 m² | p14 | G (low) |

### Conflicts and discrepancies

1. **LED wall quantity.** The label gives 4.5 × 2.5 m = 11.25 m². The elevation grid shows ≈ 4.4 × 2.0 m. The costing reference lists **45 m²** at SAR 350/m², four times the labelled area, which the drawings cannot support.
   *Hypothesis (unconfirmed):* 45 is the count of 500 × 500 mm LED cabinets in a 4.5 × 2.5 m wall (9 × 5 = 45). In that case the unit is "cabinet", not m².
   The demo estimate keeps the reference value as provided but carries a **blocking query** until an estimator confirms it.
2. **"Wall 56 m²"** in the costing reference equals the gross front-elevation rectangle. The built walls are different: a 14 m back wall below the header, end walls, storage-room and meeting-room partitions, and possibly both faces of each wall. The wall quantity needs a wall schedule.
3. **Header 24 (unit unknown).** One plausible reading is 24 linear metres of fascia (14 m front + 5 m + 5 m side returns). Renderings p2–p6 show the header wrapping both short sides. This is unconfirmed; the unit is kept as *TBC*.
4. **Counter 4.** The drawings show a reception desk (p7, p13), a bar/coffee counter (p10), a display podium (p8, p9, p13) and storage cabinets. Which four items the reference calls "counters" cannot be determined.
5. **Branding 5 / Glass 18 (units unknown).** At least five "BRANDING" placeholder panels are visible in p15, plus three push-through logos and a graphics lightbox. Glass appears only as the meeting-room partition (p4, p6, p9, p11). It has no dimensions, and it is unknown whether 18 means m² or panels.
6. **"Hidden" SAR 3,000.** The label's meaning is unknown. It is preserved verbatim and flagged for clarification; it has not been renamed.
7. **Floor finishes.** The drawing specifies *grey vinyl flooring with LED skirting* and *carpet flooring*. The reference prices one 70 m² floor at SAR 165/m². Whether the floor is a raised platform is not stated (renderings suggest a low platform with LED edge lighting), and no platform height is given.
8. **Meeting-room screen.** A wall-mounted display is visible in p11. It has no corresponding line in the reference costing.

### Not determinable from the PDF (U)

Platform height and build-up · wall thickness and construction (frame, MDF or ply, finish) · header depth and construction · door sizes · shelf counts and sizes · lightbox and push-through logo sizes · lighting fixture counts and power load · LED pixel pitch, processor and rigging · furniture supply (rent, buy or client-supplied) · plants · event duration · venue and access · transport · build and dismantle schedule.

---

## Document B — IDCUBE 6 m × 6 m booth

File `IDCUBE 6m X 6m XLive.pdf`: 11 pages, XLive-branded.

> Metadata note: the PDF's internal title is "SERB Booth _Hajj & Umrah XLive.pdf", which does not match the file name or content. It is probably a reused Canva template, but this should be confirmed before the file is archived as the IDCUBE source.

### Page map

| Page | Content |
|---|---|
| 1 | Cover |
| 2–7 | Perspective renderings |
| 8 | **Front elevation**: labels `6m` and `3.5m`, 1 m grid |
| 9 | **Top view**: labels `6m` and `6m`, 1 m grid |
| 10 | **Annotated rendering**: component labels |
| 11 | Contact page |

**Component labels on page 10:** 3D acrylic cutout logo (×2 labels) · "Arcylic [sic] push through logo" · 75" LED TV (×2) · Storage cabinet (×2) · Grey carpet flooring · Demo station (×2).

### Verified dimensions

| Item | Value | Source | Class | Verification |
|---|---|---|---|---|
| Booth width | 6 m | p8, p9 | E | 6 equal grid cells ✔ |
| Booth depth | 6 m | p9 | E | 6 grid cells (square) ✔ |
| Back-wall height | 3.5 m | p8 | E | The visible top edge of the wall measures ≈ 3.45–3.5 m against the grid pitch ✔. The red overlay box itself is ≈ 4 cells tall, so it extends above the wall. Minor; noted only. |
| TV size | 75" (diagonal) | p10 label | E | Grid width of each screen ≈ 1.65 m, consistent with a 75" 16:9 panel ✔ |

### Reliably derived quantities

| Quantity | Formula | Value | Class | Caveat |
|---|---|---|---|---|
| Floor area | 6 × 6 | **36 m²** | D | Grey carpet throughout (p10). A raised platform with an LED edge is visible in the renderings; its height is not stated. |
| Back wall, gross rectangle | 6 × 3.5 | **21 m²** | D | The booth is open on three sides (p9, p10), so this is one face of the single back wall. Thickness, the second face and the central white panel are not specified. |

### Counts (from labels and renderings)

| Item | Count | Class |
|---|---|---|
| 75" LED TV | 2 | E (label) |
| Demo station | 2 | E (label) + V |
| Storage cabinet run | 2 | E (label) + V |
| IDCUBE 3D acrylic logo | 2 | E/V |
| "Access360 Core" lettering (push-through / acrylic) | 1 | V |
| Round table | 1 | V |
| Chairs | 5 in top view (p9); 4–5 in renderings | V (conflict, minor) |
| Plant | 1 | V |

### Grid-inferred sizes (G)

Demo station ≈ 1.55 × 0.65 m (p9) · storage cabinet run ≈ 1.9 m long each (p9) · central white graphic panel ≈ 1.6 m wide × ≈ 2.4 m tall (p8).

### Costing reference and reconciliation

| Item (label preserved) | Amount (SAR) |
|---|---:|
| 18 mm MDF | 3,000 |
| 8 mm MDF | 950 |
| Melanin | 700 |
| Paint | 800 |
| Carpenter | 1,200 |
| Painter | 800 |
| Electrical | 800 |
| Removing | 1,000 |
| Installation | 1,000 |
| TV rental | 500 |
| Logo | 500 |
| Chair and table | 500 |
| **Sum of listed amounts** | **11,750** |
| Separately reported total | 15,000 |
| **Difference to reconcile** | **3,250 (unresolved)** |

The SAR 3,250 is **not allocated** to any category. As leads for whoever reconciles it (not allocations), the drawing shows items that have no matching line in the list:

- grey carpet flooring (36 m²)
- raised platform and LED edge lighting
- printed graphics
- plant
- transport

Other observations:

- "Melanin" probably means *melamine* laminate. The original label is preserved.
- "TV rental SAR 500" does not say whether it covers one or both TVs, or how many days.
- "Chair and table" does not say whether the furniture is rented or bought.
- None of the amounts carry quantities or unit rates.

---

## Document C — SMC Paddock Car Display V2

File `SMC Paddock Car Display V2.pdf`: 22 pages at 1440 × 810 pt.

> Authorship note: the PDF metadata author is "Fernando puthlangpani". The pages carry STC Saudi Arabian Grand Prix branding and a third-party studio wordmark in the footer, **not XLive branding**. The deck links to an external Google Drive simulation video; it was not accessed.

### Page map

| Page | Content |
|---|---|
| 1 | Cover |
| 2 | Introduction text (Saudi Arabian GP, Jeddah Corniche Circuit) |
| 3 | Divider: **Type 01** |
| 4 | Rendering + text "F1 Car Display Stand / Dim : 3.5 x 30 x 0.4/5m Height" |
| 5–7 | Front view, front-left perspectives |
| 8 | Top view (unscaled site plan, no dimensions) |
| 9–14 | Back perspective, paddock building views, POV renderings |
| 15 | **"Material Specifications + Dimensions"**: annotated rendering with `3M`, `40cm (H)`, `30M`, `2.5M (H)`, `OLED Side Panels 9m x 0.75m`, `SS Mirror Finish Cladding`, `LED Neon Lights`, `Floor LED Screens` |
| 16 | **"Base Structure"** diagram: `30M Length`, `3m Width`, `40cm Height`, `5M Height`, `LED Floor Screen`, `ss Mirror Finish Cladding` |
| 17 | Divider: **Type 02** |
| 18–20 | Type 02 renderings + same dimension text (car elevated at the high end) |
| 21 | **Specification text**: podium platform, floor LED runway, OLED side panels |
| 22 | Thank-you page |

**The deck presents two design options.** Type 01 is a runway that curves upward to a tall end, with the car at the low end. Type 02 has the car mounted at the elevated end. The specification page (p21) does not say which type it describes. **The design option must be chosen before costing.**

### Dimensions, separated into components

| Component | Value | Source | Class | Status |
|---|---|---|---|---|
| Platform / runway length | 30 m | p4, p15, p16, p21 | E | Consistent. *Ambiguity:* p16 draws the 30 m along the ground, so the developed length of the curved surface is longer. |
| Platform width | **3 m** (p15, p16, p21) **vs 3.5 m** (p4, p18) | — | E | **CONFLICT** |
| Base height | 0.4 m | p15, p16, p21 | E | Consistent |
| Tallest structural height | **5 m** (p16, p21) **vs 2.5 m** (p15 label at the tall end) | — | E | **CONFLICT** |
| `0.4/5m Height` | Two values, not one: 0.4 m at the base end, 5 m at the tall end | p4, p18, p21 | E | Interpreted, not merged |
| OLED side panel | 9 m × 0.75 m each, 2 sides | p15, p21 | E | Consistent |
| Floor LED runway | "30m×3m" | p21 | E | See derived quantities |
| LED pixel pitch | P3–P5, outdoor-rated | p21 | E | A range: product not chosen |
| OLED type | "Transparent OLED screens or flexible OLED video walls" | p21 | E | Product not chosen |
| Frame / cladding material | MS frame with mirror-finish SS cladding | p21 | E | Quantities not given |
| Lighting | Embedded RGB underlighting; LED neon lights along the edges | p15, p21 | E/V | Lengths not given |
| Control | DMX + media server | p21 | E | Specification not given |

### Derived quantities

| Quantity | Formula | Value | Class | Status |
|---|---|---|---|---|
| OLED side panels | 2 × 9 × 0.75 | **13.5 m²** | D | Reliable. Product type unresolved. |
| Floor LED runway, nominal | 30 × 3 | **90 m²** (upper-bound nominal) | D | **Unresolved.** (a) The width conflict (3 vs 3.5 m) gives 90 vs 105 m². (b) The surface along the curve is longer than its 30 m plan length. (c) The renderings show the LED inset within a cladding border (V). (d) The steep upper section may need a different product from a load-rated floor LED. |
| Cladding area | — | — | U | **Unresolved.** The side profile curve is not defined (no radius or coordinates). It cannot be derived. |
| Structural frame | — | — | U | **Unresolved.** Needs a structural design: a 5 m (or 2.5 m) curved structure carrying an F1 car outdoors. |
| LED neon / RGB lighting length | — | — | U/V | **Unresolved.** It appears to run along both runway edges, but no length is given. |

### Missing information for a reliable estimate

- the chosen design option (Type 01 or Type 02)
- the confirmed width and peak height
- a profile drawing of the curve
- structural design and loads: car weight, wind, outdoor exposure
- LED and OLED product selection: pitch, cabinet size, outdoor rating
- the cladding schedule
- the lighting schedule and power requirements
- media server and DMX specification
- content production scope
- event duration (rental or purchase)
- transport, crane and installation access
- permits

**No purchase prices or labour rates exist for this project.** The demo estimate lists the measurable quantities with *Price not configured* rather than inventing costs.

---

## Information requested before reliable estimates can be issued

1. **EMDAD:** the unit and meaning of *Header 24*, *Branding 5*, *Glass 18* and *Hidden*. The basis of the *LED wall 45* (m² or cabinets). Which four items are *counters*. A wall schedule and construction method. The platform height.
2. **IDCUBE:** an explanation of the SAR 3,250 difference. Whether *TV rental* covers both TVs, and for how many days. The rental status of the furniture. The carpet cost.
3. **SMC:** every item listed in the SMC section above.
4. **Company-wide:** overhead and contingency policy · verified current material and labour rates (all reference rates are provisional) · labour productivity norms · standard exclusions and quotation terms · company legal details for the quotation header.
