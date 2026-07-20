# Window Price Drivers Report  
## Better View · Window City / Keystone Manufacturer Estimates

**Data source:** 6 historical manufacturer order PDFs (180 line items)  
**Date of analysis:** 2026-07-17  
**Price basis:** Unit price (CAD) before tax, as printed on order checklists  
**Models:** CatBoost quote predictor trained on these rows  

---

## 1. Executive summary

| Rank | Driver | How it moves price | Strength |
|------|--------|--------------------|----------|
| 1 | **Size (area / width × height)** | Almost linear: **~$33 per extra sq ft** overall | Very strong (r ≈ 0.95) |
| 2 | **Window type** | Patio ≫ Casement ≫ Fixed | Strong |
| 3 | **Options package** | Wood jamb, brickmould, screen, mulled, flange | Moderate–strong |
| 4 | **Glass (Double vs Triple)** | Triple ≈ **+$3.3 / sq ft** (~10%) | Moderate |
| 5 | **Gas fill (Argon / Krypton)** | Premium gas mix slightly higher $/sqft | Moderate (model uses it) |
| 6 | **Exterior color / color upcharge** | Dark Bronze & Black vs White | Mild in raw averages |
| 7 | **Tempered glass** | Large in absolute $ but confounded with patio doors | Sparse data |
| — | Frame / grids / shape | No variation in this sample (all Vinyl, no grids) | Not measurable here |

**Rule of thumb for sales:**

> Start from **type + size**, then layer **options** and **glass**.  
> Expect roughly **$30–40 per sq ft** for operable windows, **~$29 / sq ft** for fixed, **~$38–40 / sq ft** for patio / awning-class products.

---

## 2. Dataset snapshot

| Metric | Value |
|--------|------:|
| Line items | 180 |
| Orders | 6 |
| Unit price range | $150.92 – $2,434.86 |
| Median unit price | **$369** |
| Mean unit price | **$494** |
| Size range | 2.5 – 55.8 sq ft |
| Frame material | 100% Vinyl (Classic / Sliding collections) |
| Grids | None observed in sample |

### Orders included

| Order | Customer | Lines | Net price (PDF) |
|-------|----------|------:|----------------:|
| 125401074 | Frank Hanna - Final | 53 | $18,832 |
| 125401101 | Dorothy - 613 Eden | 27 | $10,006 |
| 125401111 | Marisa - 5 Furlan Ct | 41 | $12,870 |
| 125401144 | Ranj - 7403 - 106 ST NW | 21 | $19,253 |
| 125401151 | Ranj - 111 Triplex | 31 | $18,927 |
| 125401152 | Ranj - 4184 Cameron Heights | 7 | $44,078 |

---

## 3. Size effects (strongest driver)

### 3.1 Correlation

| Dimension | Correlation with unit price |
|-----------|----------------------------:|
| **Area (W × H)** | **0.95** |
| Width | 0.85 |
| Height | 0.47 |
| Aspect ratio (W/H) | 0.27 |
| Quantity | 0.08 |

**Interpretation:** Price scales mainly with **opening size**. Width matters more than height alone because wider openings are often mulled assemblies or patio doors.

### 3.2 Price by size band

| Size (sq ft) | Count | Mean unit $ | Median unit $ | Mean $/sq ft |
|-------------:|------:|------------:|--------------:|-------------:|
| 0–5 | 7 | $221 | $227 | $58.5* |
| 5–10 | 67 | $283 | $271 | $33.7 |
| 10–15 | 46 | $378 | $374 | $31.9 |
| 15–20 | 24 | $567 | $600 | $33.0 |
| 20–30 | 16 | $678 | $691 | $29.3 |
| 30–50 | 17 | $1,204 | $1,171 | $32.2 |
| 50+ | 3 | $2,013 | $1,802 | $38.2 |

\*Very small units show high $/sq ft because of **fixed setup / minimum charges** (hardware, frame, processing).

### 3.3 Size elasticity by type

Linear fit: `unit_price ≈ intercept + slope × sq_ft`

| Type | $/sq ft slope | Approx base | Correlation | n |
|------|--------------:|------------:|------------:|--:|
| **Fixed** | **$21.9** | ~$61 | 0.94 | 57 |
| **Casement** | **$31.4** | ~$43 | 0.98 | 109 |
| **Slider** | **$44.5** | (small n) | ~1.0 | 5 |
| **Patio Door** | **$52.6** | (small n) | 0.95 | 5 |
| **Overall** | **$32.7** | ~$0 | 0.95 | 180 |

**Sales intuition:**

- Double a casement’s area → roughly **double the unit price** (near-linear).  
- Fixed windows grow cheaper per sq ft (~$22) than casements (~$31).  
- Patio doors are the steepest size curve in this set.

### 3.4 Worked size examples (illustrative)

Using overall ~$33/sq ft for a mid-range casement-like product:

| Opening | Sq ft | Rough material ballpark |
|---------|------:|------------------------:|
| 24″ × 24″ | 4.0 | ~$130–$250 (min-price floor applies) |
| 24″ × 48″ | 8.0 | ~$260–$320 |
| 36″ × 60″ | 15.0 | ~$490–$550 |
| 48″ × 72″ | 24.0 | ~$790–$900 |
| 72″ × 80″ patio | 40.0 | ~$1,400–$1,600+ |

Always refine with type + options (sections below).

---

## 4. Window type effects

| Type | Count | Mean unit $ | Median unit $ | Mean $/sq ft | Mean size (sq ft) |
|------|------:|------------:|--------------:|-------------:|------------------:|
| **Patio Door** | 5 | **$1,515** | $1,462 | **$38.5** | 38.8 |
| **Casement** | 109 | **$537** | $398 | **$35.4** | 15.7 |
| **Awning** | 4 | $480 | $495 | **$40.4** | 12.4 |
| **Slider** | 5 | $395 | $417 | $32.8 | 12.0 |
| **Fixed** | 57 | **$331** | $268 | **$29.4** | 12.4 |

### How to read this

1. **Patio doors** are top of the stack — large, hardware-heavy, often tempered multi-pane.
2. **Casements** are the workhorse: mid $/sqft, wide size range; mulled triples push means up.
3. **Fixed** is the value play: same frame family, less hardware → **~17% lower $/sqft** than casement ($29 vs $35).
4. **Awning** samples are few but priced **rich per sq ft** (~$40), similar intensity to patio-class glazing/hardware.
5. **Slider** sits between fixed and casement on a small sample.

### Mulled assemblies (mostly casement composites)

| Casement | Count | Mean unit $ | Mean size | Mean $/sq ft |
|----------|------:|------------:|----------:|-------------:|
| Single (not mulled) | 68 | **$333** | 9.7 sq ft | $35.3 |
| **Mulled multi-unit** | 41 | **$876** | 25.7 sq ft | $35.5 |

**Important:** Mulled lines are expensive mostly because they are **bigger openings**, not because $/sqft jumps.  
$ / sq ft is almost identical (~$35). The mulled flag still helps the model because large multi-sash configs differ from a single huge fixed lite.

---

## 5. Glass (glazing) effects

| Glass | Count | Mean unit $ | Mean size | Mean $/sq ft |
|-------|------:|------------:|----------:|-------------:|
| Double | 135 | $532 | 16.4 sq ft | **$32.8** |
| Triple | 45 | $380 | 11.2 sq ft | **$36.1** |

### Interpretation

- **Triple pane is more expensive per square foot** (+$3.3 / sq ft, ~**+10%** vs double).  
- Raw mean unit $ for triple looks *lower* only because triple units in this sample are **smaller** on average.  
- Always compare **$/sq ft** (or same size), not raw averages alone.

**Sales rule:** For the same size/type, expect triple to add on the order of **~8–12%** material vs double (sample-based).

---

## 6. Exterior color & color upcharge

| Exterior color | Count | Mean unit $ | Mean $/sq ft |
|----------------|------:|------------:|-------------:|
| White | 55 | $481 | **$34.9** |
| Black | 72 | $456 | $33.3 |
| Dark Bronze | 53 | $558 | $32.8 |

### Interpretation

- PDFs frequently list **“color upcharge”** for non-standard exterior finishes (Black, Dark Bronze).  
- In this small sample, **$/sqft does not cleanly rank Dark Bronze > White** because color is mixed with different sizes, types, and projects.  
- The ML model still uses color + `color_upcharge` (combined importance ~2–3%), treating them as **secondary adjusters**, not primary drivers.  
- **Practical rule:** assume **some premium** for Black / Dark Bronze vs White, but size/type dominate; refine with more PDFs before quoting a fixed “+$X color” table.

---

## 7. Gas fill (Argon vs Krypton)

| Gas fill | Count | Mean unit $ | Mean $/sq ft |
|----------|------:|------------:|-------------:|
| Argon | 104 | $393 | $32.5 |
| Krypton (incl. Argon/Krypton mixes) | 35 | $346 | **$34.9** |
| None / not parsed | 41 | $876 | $35.5 |

### Interpretation

- **Krypton / mixed gas** lines show **higher $/sqft** than pure Argon (~+$2.4 / sq ft).  
- “None” rows are often **mulled parent lines** where gas text lives on sub-sashes → averages are distorted.  
- Model importance for gas_fill is material (~5% of total importance) — useful once size/type are fixed.

---

## 8. Option packages (from PDF line text)

These options appear constantly on Window City checklists and were added to the parser, model, and quote UI.

| Option | Prevalence | Mean $ with | Mean $ without | Δ $/sq ft | Approx lift |
|--------|------------:|------------:|---------------:|----------:|------------:|
| **Wood jamb** | 48% | $649 | $352 | **+$6.5** | **~+21%** $/sqft |
| **Brickmould** | 20% | $857 | $403 | **+$5.1** | **~+16%** $/sqft |
| **Nailing flange** | 21% | $521 | $487 | **+$3.8** | **~+12%** $/sqft |
| **Full screen** | 46% | $416 | $559 | **+$3.6** | **~+11%** $/sqft* |
| **Mulled** | 23% | $876 | $381 | **+$2.4** | ~+7% $/sqft |
| **Tempered** | 3% | $1,515 | $465 | **+$5.0** | confounded w/ patio |

\*Screen “with” mean unit $ is lower because screens sit on smaller operable windows, not patio doors — **$/sqft still rises** when a screen is present.

### Installation style

| Installation | Count | Mean unit $ | Mean $/sq ft |
|--------------|------:|------------:|-------------:|
| Replacement (typical brickmould/jamb) | 143 | $487 | $32.9 |
| New Construction (nailing flange) | 37 | $521 | **$36.7** |

New construction packages (flange ± jamb) trend **~11% higher per sq ft** in this sample.

### Option sensitivity (model, same size)

Example: **Awning 48″ × 42″, Triple, White** (Dorothy line actual **$535.92**)

| Configuration | Model predicted |
|---------------|----------------:|
| + brickmould + wood jamb + screen + Krypton | **$538.81** |
| No options, no premium gas | **$508.72** |
| **Option package effect** | **≈ +$30 (~6%)** |

---

## 9. What the ML model “thinks” (feature importance)

Aggregated CatBoost importance on real PDF training data:

| Feature family | Relative importance | Role |
|----------------|--------------------:|------|
| Area / log(area) / width / height | **~72%** | Primary price engine |
| Window type | ~6% | Patio / casement / fixed tiering |
| Gas fill | ~5% | Premium glazing package |
| Oversized flag / aspect | ~7% | Non-linear size effects |
| Brickmould | ~3% | Exterior trim package |
| Wood jamb / color upcharge | ~2% | Common upcharges |
| Screen, tempered, mulled, glass layers | ~3% | Secondary |
| Frame / grid / shape | ~0% | No variation in data |

This aligns with the raw statistics: **size first, type second, options third**.

---

## 10. Extremes in the data (intuition checks)

### Least expensive lines
Small **fixed** double-pane units (~$151–$200), e.g. 36″×18″ fixed White **$150.92**.

### Most expensive lines
- Patio door ~96″×84″ Dark Bronze double **$2,434.86**  
- Mulled casement ~101″×72.5″ Dark Bronze **$1,801.92**  
- Mulled casement 97″×69″ White **$1,622.23** (Dorothy living room)

---

## 11. Category-by-category cheat sheet for quoting

| Category | Effect on price | How to use in the UI |
|----------|-----------------|----------------------|
| **Width × Height** | Dominant; ~$22–$53 / sq ft by type | Always enter exact manufacturer sizes |
| **Type: Fixed** | Lowest tier | Baseline for picture openings |
| **Type: Casement / Awning** | Mid–high $/sqft | Operable = more money |
| **Type: Patio Door** | Highest | Large + hardware + often tempered |
| **Mulled** | Big absolute $ via size; mild $/sqft | Check when multi-sash one frame |
| **Triple glass** | ~+10% $/sqft vs double | Energy upgrade |
| **Double glass** | Baseline | Default volume product |
| **Krypton / premium gas** | Small premium vs Argon | Matches ENERGY STAR lines |
| **Wood jamb** | Strong package lift | Replacement / finish-out |
| **Brickmould** | Strong package lift | Exterior trim |
| **Nailing flange** | NC premium | New construction |
| **Screen** | Moderate lift on operables | Casement/awning default |
| **Exterior color** | Mild; upcharge flag for non-white | White baseline; Black / Dark Bronze |
| **Tempered** | Large when present | Code / patio / door glass |
| **Frame material** | Unknown (all Vinyl here) | Leave Vinyl for this manufacturer |
| **Grids** | Unknown (none in sample) | Don’t expect model skill yet |

---

## 12. Limitations (read before over-trusting)

1. **Only 6 jobs / 180 lines** — hold-out MAPE is still ~**23%**. Spot checks on *seen* configs can look excellent; brand-new combos will vary more.  
2. **Confounding** is real (e.g. tempered ≈ patio; mulled ≈ large casement). Prefer **$/sq ft** and model predictions over raw group averages alone.  
3. **All Vinyl / no grids** — cannot estimate aluminum, wood, or grille premiums yet.  
4. **Labour / install / tax** are not in unit prices (net material-style manufacturer pricing).  
5. Parent **mulled** lines + **child sash** lines both appear — good for training variety, but order totals ≠ simple sum of every line (sub-items may be components).

---

## 13. Recommendations

1. **For sales today:** Use the quote builder with accurate **size + type + glass + options**; treat confidence bands as the uncertainty range.  
2. **To hit ±3–4%:** Import many more historical PDFs (dozens of jobs). Size/type curves will stabilize; option premiums will become quotable as fixed “+$X” tables.  
3. **Next data fields worth capturing** when available: hardware series, brickmould size, exact jamb depth, Low-E product code, interior color when different from exterior.  
4. **Separate labour model later** if you sell installed quotes, not just manufacturer material.

---

## 14. One-page formula (practical)

```
Est. unit price
  ≈  Base_by_type(size_sqft)
  ×  Glass_factor          # Double ≈ 1.00, Triple ≈ 1.08–1.12
  ×  Options_factor        # jamb/brickmould/screen/flange stack ≈ 1.05–1.20
  ×  Color_factor          # White ≈ 1.00, dark exterior mild premium
  +  noise / project-specific extras
```

With current data, the empirical base slopes are approximately:

| Type | Base slope |
|------|------------|
| Fixed | ~$22 / sq ft |
| Casement | ~$31 / sq ft |
| Patio door | ~$50+ / sq ft |

The AI model encodes these relationships (and option interactions) automatically when you use **Generate quote**.

---

*Generated from parsed Window City / Keystone PDFs in `data/raw/` and model artifacts in `models/`.*
