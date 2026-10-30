# Costing rules

This document defines how the costing engine (`estimator-web-app/src/domain/costing/`) turns approved quantities and rates into a pre-VAT selling price. Each rule here is covered by a test in `estimator-web-app/tests/`.

## 1. Units

| Code | Label | Typical use |
|---|---|---|
| `each` | Each / piece | Counters, TVs, logos |
| `lm` | Linear metre | Header fascia, LED strip, skirting |
| `m2` | Square metre | Flooring, wall panels, LED wall, graphics |
| `m3` | Cubic metre | Volumetric fill, transport volume |
| `sheet` | Sheet | MDF, ply, acrylic, where a sheet count is known |
| `kg` | Kilogram | Steel |
| `day` | Day | Rentals, labour days |
| `hour` | Hour | Labour hours |
| `lump_sum` | Job / lump sum | Electrical job, installation, transport |
| `unit_tbc` | Unit to be confirmed | Reference data whose unit is unknown (EMDAD *Header 24*, *Branding 5*, *Glass 18*) |

## 2. Line-item calculation

Every line declares a **calculation method**.

### `quantity_x_rate`

```
amount = round2(quantity × unitRate)
```

- `quantity.unit` must equal `rate.unit`. If they differ, the engine reports a blocking `UNIT_MISMATCH`, sets the amount to `null`, and excludes the line from totals.
- `lump_sum` is not allowed here, so a lump sum is never multiplied by a quantity.
- `unit_tbc` × `unit_tbc` calculates, so reference totals can be checked, but it raises a blocking `UNIT_TBC` until the unit is confirmed.
- A quantity or rate below zero is rejected.

### `lump_sum`

```
amount = round2(lumpSumAmount)
```

The quantity is fixed at *1 job* and is not multiplied.

### Rules that apply to both methods

- **No rate gives no amount.** The engine reports a blocking `PRICE_NOT_CONFIGURED`, the amount is `null`, and the line is excluded from totals. Zero is never assumed.
- **Quantity linked to a measurement.** If the measurement is not `approved`, the engine reports a blocking `MEASUREMENT_NOT_APPROVED`. If it is `rejected`, the engine reports a blocking `MEASUREMENT_REJECTED`.
- **Open queries.** An unresolved query on the line raises a blocking `OPEN_QUERY`.
- **Supply basis.** Lines can mark items as `produce`, `rent`, `reuse` or `client_supplied`. A `client_supplied` line must have a zero amount or no rate (it raises `CLIENT_SUPPLIED_HAS_COST` otherwise). This lets estimators record visible items that XLive does not build.

## 3. Totals

```
directCost        = Σ amount of every included line whose amount is not null
overhead          = allowance(directCost, overheadConfig)
contingency       = allowance(directCost + overhead, contingencyConfig)
costBase          = directCost + overhead + contingency
```

Costs are also broken down by cost type: material, labour, equipment rental, subcontract, transport, other, and unclassified.

### Allowance modes

| Mode | Value |
|---|---|
| `not_set` | 0, with a warning `ALLOWANCE_NOT_SET`. The company has not supplied a policy, so the estimator must choose one explicitly, even if the choice is `none`. |
| `none` | 0. A deliberate decision. |
| `percent` | `round2(base × pct)`, where 0 ≤ pct ≤ 1 |
| `fixed` | A fixed amount, which must be ≥ 0 |

Contingency is applied after overhead. This is a documented default, open to company confirmation.

## 4. Pricing (pre-VAT)

| Mode | Formula | Validation |
|---|---|---|
| `markup` | `sell = round2(costBase × (1 + r))` | 0 ≤ r ≤ 10 |
| `margin` | `sell = round2(costBase ÷ (1 − r))` | 0 ≤ r < 1 (r = 1 is impossible) |
| `fixed_price` | `sell = fixedPrice` | Requires a written reason. The resulting effective markup and margin are reported. |

For every mode the engine also reports:

- `profit = sell − costBase`
- `effectiveMarkup = profit ÷ costBase`
- `effectiveMargin = profit ÷ sell`

**Markup and margin are different.** On a cost of SAR 65,550:

| Rule | Selling price |
|---|---|
| 30 % markup | SAR 85,215.00 |
| 30 % margin | SAR 93,642.86 |

The UI always names the active mode.

**VAT** is outside the estimate. The figures here are pre-VAT, and the quotation shows "Prices exclude VAT". VAT belongs to a future invoicing stage with a configurable rate and business confirmation.

## 5. Rounding

- Calculations use `decimal.js` with 28 significant digits.
- Line amounts and allowance amounts are rounded **half-up to 2 dp** at the point they are created.
- Totals are sums of rounded amounts, so displayed lines always reconcile with displayed totals.
- Quantities keep up to 4 dp and rates up to 4 dp.
- Persisted values (`numeric`), displayed values, and quotation values all come from the same engine output.

## 6. Readiness

An estimate is **Ready for quotation** only when **all** of the following hold:

- there are no blocking issues: `PRICE_NOT_CONFIGURED`, `UNIT_MISMATCH`, `UNIT_TBC`, `MEASUREMENT_NOT_APPROVED`, `MEASUREMENT_REJECTED`, `OPEN_QUERY`, `RECONCILIATION_UNRESOLVED`, `INVALID_PRICING`, `INVALID_LINE`, `NO_LINES`
- the pricing configuration is valid

Warnings, such as `ALLOWANCE_NOT_SET`, `PROVISIONAL_RATE` and `QUANTITY_BASIS_UNKNOWN`, are shown but do not block. Approval also requires the estimator to acknowledge the warnings.

## 7. Reconciliation

An estimate may record **separately reported totals**: a total that came from another source, such as IDCUBE's SAR 15,000. The engine compares each one with the line sum:

```
difference = reportedTotal − directCost
```

The result is `reconciled` (the difference is 0), `explained` (an estimator has recorded a note), or `unresolved`. An `unresolved` result is blocking. The engine never adjusts lines to force a match.

## 8. Quantity rule templates (`costing_rules`)

These templates only produce quantities. They never produce money.

| Rule | Formula | Output unit |
|---|---|---|
| `rect_area` | length × width | m2 |
| `wall_area` | width × height (gross; openings are subtracted separately) | m2 |
| `wall_area_net` | width × height − Σ openings | m2 |
| `perimeter_open_sides` | sum of the listed edge lengths | lm |
| `count` | n | each |
| `duration` | days | day |
| `labour` | crew × days | day |

More complex rules are added only when their assumptions are documented. The table below marks that status for each one.

| Rule | Status |
|---|---|
| **Sheet-material optimisation**: sheet size, kerf, offcuts, grain, waste | **Not implemented.** The assumptions are undocumented. Use a per-m² rate, or enter a sheet count manually with a note. Catalogue items can already record sheet length, width and thickness for future use. |
| **Labour productivity** (m² per carpenter-day, etc.) | **Not implemented.** XLive has not supplied productivity norms. Labour is entered as a lump sum or as days × day rate. |
| **Waste allowance** | Must be entered explicitly as a separate quantity adjustment with a note. There is no hidden default. |

## 9. Reference data (provisional)

The figures below come from earlier XLive costings. They are stored as **provisional** catalogue rates and reference estimates, **not** verified market prices.

### EMDAD (14 m × 5 m)

The engine reproduces the reference cost of SAR 65,550 and, with a 30 % markup, a pre-VAT price of SAR 85,215.

| Item | Qty | Unit | Rate (SAR) | Amount (SAR) | Open question |
|---|---:|---|---:|---:|---|
| Floor | 70 | m2 | 165 | 11,550 | Two finishes (vinyl and carpet) and platform height not stated |
| Header | 24 | unit_tbc | 150 | 3,600 | Unit TBC: possibly 24 lm (14 + 5 + 5) |
| Counter | 4 | each | 1,500 | 6,000 | Which four items are "counters"? |
| Wall | 56 | m2 | 150 | 8,400 | Equals the gross front elevation, not a wall schedule |
| LED wall | 45 | m2 | 350 | 15,750 | **Conflicts with the drawing**: the label gives 4.5 × 2.5 m = 11.25 m². 45 may be a count of 0.5 × 0.5 m cabinets. |
| Electrical | 1 | lump_sum | 3,000 | 3,000 | |
| Carpentry | 1 | lump_sum | 5,000 | 5,000 | |
| Branding | 5 | unit_tbc | 350 | 1,750 | Unit TBC |
| Installation | 1 | lump_sum | 3,000 | 3,000 | |
| Glass | 18 | unit_tbc | 250 | 4,500 | Unit TBC (m² or panels?) |
| Hidden | 1 | lump_sum | 3,000 | 3,000 | **Label meaning unknown.** The label is preserved and flagged. |

### IDCUBE (6 m × 6 m)

The twelve listed lump sums sum to SAR 11,750. The separately reported total is SAR 15,000, which leaves an **unresolved difference of SAR 3,250**. Quantities and unit rates are not known for any IDCUBE line, so each one carries `QUANTITY_BASIS_UNKNOWN`.

### SMC Paddock Car Display

No rates exist. The demo estimate lists the measurable quantities from the reference analysis, with every line marked *Price not configured*.

## 10. Configuration still needed from XLive

- an overhead and contingency policy
- verified current rates, with suppliers and effective dates
- labour productivity norms
- standard quotation terms and exclusions
- quotation validity period
- company legal and VAT registration details for the quotation header
