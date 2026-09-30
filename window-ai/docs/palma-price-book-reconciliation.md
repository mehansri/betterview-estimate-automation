# Palma price book re-scan — reconciliation report

**Status (2026-09-30): implemented on best judgement, at the user's request; the remaining uncertainties went to Palma.** See section 11 for what changed and [palma-questions-to-send.md](palma-questions-to-send.md) for the send-ready questions. Each finding has an ID (M, C, R, X, P, D, A).

| | |
|---|---|
| Sources | *Fiberglass Doors Price Book 2024/2025* (58 pp.) and *Steel Doors Price Book 2024/2025* (49 pp.), both "Effective: Jun 15, 2024 – Last Updated: Oct 21, 2025" |
| Tool snapshot | `main` @ `1afbc6d`: `data/doors/{fiberglass,steel,options,glass_groups}.json`, `config/door_pricing.json`, `services/doors/pipeline.py` (step-by-step configurator), `services/doors/pricing.py`, classic editor in `DoorQuoteBuilder.tsx` |
| Price-book overrides | The local DB has no published override (`price_books.active_versions()` is empty). **Production was not checked.** If a manager has published a door import under Admin → Price books, re-run the diff against it. |
| Page references | FG = fiberglass book, ST = steel book, page numbers as printed |
| Web sources (added 2026-09-30) | docs.palmadoor.com; palmadoor.com/resources and literature; Panel Selector (216 panels); order forms D and D-RT (Sep 2025); Novatech accent sheets 2022–2025. See **section 10**. |

Appendix: [palma-slab-profiles.md](palma-slab-profiles.md) (per-slab option profiles). Evidence: page-by-page visual notes and the Panel Selector snapshot in [palma-audit/](palma-audit/).

---

## 1. Summary

**How the audit was done**
1. **Fresh extraction.** All 107 pages were extracted with `pdftotext -table`. That gave 1,260 priced slab rows (589 FG, 671 ST), parsed independently of the tool's old extraction.
2. **Visual review of every page.** Pages were rendered as images and compared cell by cell with the text. The review also looked for content that exists only in the image, hidden text layers, footnotes and misprints. The per-page notes are in `palma-audit/`.
3. **Line-by-line diffs.** The tool's slab rows, option rows, panel upcharges, transoms, pull bars and glass groups were each diffed against the book.
4. **Configurator exercised.** The step-by-step configurator was run to see what a rep can actually select and what it charges.

**Results**

| Check | Result |
|---|---|
| Slab price rows (every finish column) | **1,246 / 1,246 match.** The 14 unmatched rows are label formatting only: SDL per-square rows, the FG p40 repeat of the Oak Flush base, and "Embossed + $95". **0 price mismatches.** |
| Extras / options rows (FG pp. 44–46, 51–52; ST pp. 40–41, 44–46) | All match. 0 mismatches. |
| Fiberglass panel upcharges (58 rows, FG pp. 39–42) | All match. |
| Transoms (FG p43, ST p39) | All match. |
| Pull bars (540 cells) | All match the **visible** prices. The PDF also holds a hidden, older price grid under every pull-bar table (see X5). |
| Glass pricing groups (73 names) | All match the printed book. |

**Conclusion.** The price *data* is faithful to the books. The completeness problem is elsewhere:

1. **The step-by-step configurator (the default quoting path) can't reach much of the book.** Decorative accents, casing, glass frames, sliding screens, pull bars, 7'0" doors, Executive panels, steel 5-1/4"/7-1/4" jambs, steel non-standard widths and more are missing (section 3).
   - The classic editor can add any option row, but nothing links the row to the slab.
   - The classic editor also can't be combined with a door built in the configurator.
2. **Footnote rules aren't encoded.** Examples: retractable-screen jamb limits, Tedee compatibility, special-order pairing, SDL per-square adders (sections 4 and 7).
3. **Logic errors in how the tool prices** (section 6). Examples: fiberglass 8'0" solid doors are charged the 8' system twice; vented units are priced at the dearest variant; steel fire rating has no book price in the tool.
4. **Parse artefacts.** Phantom slab models, mistyped rows, a stale hidden-layer column (section 5).
5. **Errors printed in the Palma books themselves.** These need Palma or you to resolve (section 8).

---

## 2. Missing from the tool's data entirely

| ID | Option (book reference) | What the tool does today |
|---|---|---|
| **M1** | **Steel 20-min fire rating: +$230, includes self-closing hinges** (ST p38 footnote) | Treated as "not in the Palma book". The rep must type a price. `pipeline.fire_rated_panel_list` is null, and `test_fire_rated_needs_a_price_because_the_book_has_none` encodes the wrong assumption. The fiberglass book has **no** fire rating (see X2). |
| **M2** | Custom grills: +$40/box (FG p29, ST p27) | Not in the data. |
| **M3** | Casing backband: +50% (FG p45 painted and stained casing; ST p40) | Not in the data. |
| **M4** | Hinge finishes: heavy-duty stainless in Satin Nickel or Black, "other finishes available in steel: Patina and Brass" (ST p38) | One line only, "HD hinges +$60/door", with no finish. |
| **M5** | **Vented-unit sub-variants** (FG pp. 36–38, ST pp. 34–36):<br>• Elevation: Clear/LowE · Grills Standard (CAFA)/Georgian (CAAL) · Edge/Masterline/Optika/Transit · V-Groove-Murano-Clear · V-Groove-Murano-Sandblast<br>• Q550: Clear/LowE vs Grills/LowE<br>• Peak 470: Clear/Grills/Decorative, and a BLACK-OUT version<br>• Elite: plain / Rain Glass / Grills / with extension, and BLACK-OUT<br>• EZ Lift, and BLACK-OUT | The rows are stored, but **without the sub-table name**, so the variants can't be told apart or selected. The configurator prices the dearest one (see P2). |
| **M6** | Palma standard colours:<br>• 50 paint colours plus Standard (Polytex) White (FG pp. 53–55, ST pp. 47–49)<br>• 16 stains (FG pp. 56–58) | The configurator offers 9 paint and 7 stain presets, and most are not Palma names (see X1). |
| **M7** | Non-decorative glass patterns:<br>• Obscure list, 19 patterns with maximum sheet sizes (FG pp. 23–24, ST pp. 21–22)<br>• Solution Series sandblast glasses Mistlite / Narrow Reed / Rain / Sable (FG p34, ST p32)<br>• Elevation glass names<br>• Grill patterns CAFA / CAAL | A design picker exists only for decorative groups A–D. |
| **M8** | Executive-panel layout legend, letters A–M with panel sizes (ST p37) | Printed **only in the image**; the text layer has just scrambled letters. The tool stores the price rows but not the layouts they refer to. |

## 3. In the data, but not selectable in the step-by-step configurator

"Classic only" means a rep can add it in the classic price-book editor as a free-standing option row. There it has no link to the slab and no validation.

| ID | Option (book reference) | Notes |
|---|---|---|
| **C1** | **Decorative accents** (ST p44, FG p52):<br>• Vog 1 / Vog 2 Alunox/SS $650, Vog 2 Black $810<br>• Oso 1 / Oso 2 SS $650<br>• Uno 1 / 2 / 3 SS $650; Uno 1 / 2 Black or Matte Gold $810; Uno 3 Black $810<br>• Era 1 SS $650, Era 1 Matte Gold $810<br>All of the above are **per side**.<br>• Vertical accent for 7"x64", exterior only: SS $1,780, Black $1,890<br>• [NEW] vertical accent, reeded wood: $1,415 | **The confirmed gap.** Classic only. The configurator does offer Vog, Oso, Era, Linea and Tao as steel solid slabs, but no accents; "Uno" doesn't appear anywhere. **Neither book has product images on these pages**, so nothing in the books ties an accent to a slab. See A1 and A2. |
| **C2** | Dentil shelf: steel White $400, Painted $470; FG Painted $550, Stained $650. Kick panel: steel $250, FG $300 (ST p44, FG p52) | Classic only. Mail slot and peep viewer *are* in the configurator. |
| **C3** | Casing trim, painted (both books) and stained (FG), in five layouts each (FG p45, ST p40) | Classic only. |
| **C4** | Glass frame options, per doorlite: contemporary PVC $80, aluminum colonial $260, aluminum urban smooth $250, aluminum urban textured $400 (FG p45, ST p44) | Classic only. See R6 for the `**` sizes that already include the contemporary frame. |
| **C5** | Laminated glass $420; tempered direct-glazed sidelite or rectangular transom glass $160 (FG p45, ST p45) | Transom tempering *is* in the configurator. |
| **C6** | Sliding screens: white $450, painted one side $575, painted two sides $700 (FG p45, ST p40) | The configurator offers only retractable screens. |
| **C7** | Pull bars, all 540 prices: straight in 4 hardware blocks (both books), offset in 4 blocks (FG only) (FG pp. 47–50, ST pp. 42–43) | Classic only. A pull bar replaces the handle set, so it also belongs in step 7. |
| **C8** | Key alike $80; Tedee temporary knob $40 (FG p46, ST p41) | Tedee keypad, bridge and sensor are in the configurator. |
| **C9** | Operating (hinged) sidelite with astragal, $250, "for standard panel sizes only" (FG p44, ST p40) | Classic only. |
| **C10** | Custom PVC brickmould, 3 pcs up to 6", $685; custom textured brickmould, 3 pcs up to 4-1/2", $855 (FG p44, ST p40) | Classic only. |
| **C11** | Custom colour match $750 ("colour chip required"); trim supplied by customer, $120 painted / $200 stained per piece (FG p51, ST p44) | A rep can type any colour name and no colour-match charge is added. |
| **C12** | Steel jambs 5-1/4" (+$60, smooth only) and 7-1/4" (+$135) (ST p40) | Steel frame depths are limited to 4-5/8", 6-5/8" and 7-5/8". |
| **C13** | Steel triple-glazing upcharge, LowE 1x / 2x, 13 lite sizes, "applicable ONLY for Novatech Silkscreen and V-Groove doorlites" (ST p45) | Not offered. The fiberglass book has no equivalent table. |
| **C14** | Steel non-standard widths 24", 26", 28", 38", 40" (flush only, +$375), and custom-size steel panels +$750 (ST pp. 38, 40) | Widths offered are 30–36" and 42" only. The 14x64 clear lite in a **24" flush** slab (ST p23) is dropped by the configurator. |
| **C15** | **7'0" height** for every door: +$275 system on the glass pages; FG 7'0" solid table on p41 (WG00, WG25, TG71) | The configurator offers 6'8" and 8'0" only. |
| **C16** | **Steel Executive panels** (ST p37):<br>• 10 solid layouts<br>• "below doorlite glass" adders for door and sidelite, standard and custom | The rows are stored as series `executive_panels`, but the configurator skips that series. |
| **C17** | Steel Sandblast Triple direct-glazed sidelites (ST p16) | Stored as *door* rows with no panel (see X4), so the configurator drops them. |
| **C18** | SDL per-square adders: steel white $80 and painted $90; FG $90 / $90 / $100 / $100 / $100 across the five finishes (FG pp. 30–31, ST pp. 28–29) | Stored as `per_square_adder` rows, but **never charged**, and the rep is never asked for the square count (see P4). |
| **C19** | Fiberglass panel upcharges on *glazed* doors. Every FG glass page says "For applicable fiberglass panel upcharges refer to pages 30-32" (really pp. 39–42). | Panel upcharges are applied to solid doors only. A glazed door can't be ordered in another skin such as Teak, Fir Shaker or Rustic. See A9. |
| **C20** | Steel "Upcharge used for pricing with glass" column: Flush base, 6 Panel +30 … Era/Tao +290 (ST p38) | Stored as `glass_upcharge` and unused. A glazed door can't be priced in Victoria, Oso, Vog, Era and similar panels unless a glass row names that panel. See A10. |
| **C21** | Per-component paint and stain items: door panel one side $320, sidelite panel $200, glass frame $70, and the stain equivalents (FG p51, ST p44) | Only "Door frame and brickmould" is used, for the split frame colour. See A19. |
| **C22** | Steel PARTS page: glass frames, steel panels, hinges, astragal, sweeps, weatherstrip (ST p46) | In the data, classic only. **Proposed: not applicable to new-door quoting** (these are replacement parts); keep for service quotes. |

## 4. Footnote rules not encoded

| ID | Book rule (reference) | Tool behaviour |
|---|---|---|
| **R1** | Retractable screen: "Compatible ONLY with 6-5/8" and 7-1/4" jambs, and assembled Regular 2" BM with no more than 1" reveal" (FG p45 and ST p40, printed in red) | Offered with any jamb depth and with flat or no brickmould. Verified: steel 4-5/8" jamb with flat brickmould is accepted. |
| **R2** | "For Double Door: RETRACTABLE Screen cost x 2" (FG p45, ST p40) | Quantity defaults to 1 on double doors. |
| **R3** | "Tedee Smart Lock is only compatible with all FERCO handles, Miami handles and all Pull Bars" (FG p46, ST p41) | The configurator only requires "multipoint". Verified: Tedee is accepted with the Verona large lever. The "Large Lever" row lumps compatible Miami with incompatible Verona, Miliano, Country and Ribbon (see A26). |
| **R4** | "Special Order sidelites and doorlites will be ordered together, therefore both will be priced as Special Order" (FG and ST pp. 5–10) | A special-order door can be paired with stock-priced sidelites. |
| **R5** | "Any customization to the size or caming will be priced as Special Order" (FG and ST pp. 5–8) | No custom-glass path. Informational. |
| **R6** | `**` sizes include the contemporary glass frame.<br>• Steel: "(**included with Victoria and Soho panels)"<br>• FG: "(included with Shaker Craftsman panels)", with `**` on the FIR03 and 3DP sizes (the FG book never defines `**`) | Doesn't matter until C4 exists. Then the +$80 frame must not be charged on `**` sizes. |
| **R7** | Operating sidelite "for standard panel sizes only"; non-standard steel sizes carry "extended lead times by 10–12 weeks" | Not applicable yet (C9, C14). |
| **R8** | Transom "Glass with Grills / SDLs: additional charges per box apply" (FG p43, ST p39); "Casing Trim: not included" (rectangle) vs "Colonial 3-1/2" included" (shapes) | The extra charge isn't priced and its amount is unknown (A17). There is no casing line for transoms. |
| **R9** | Steel triple glazing is "applicable ONLY for Novatech Silkscreen and V-Groove doorlites" (ST p45) | Applies once C13 exists. |
| **R10** | Energy Star eligibility by lite size and glazing (ST p45) | Informational. Propose showing it as a note only (A21). |

**Already encoded correctly** (listed so every footnote is accounted for):
- Wheelchair sill not with 5-5/8"/7-5/8" (FG)
- Outswing sill not with 7-5/8"
- 5-5/8" jamb smooth only
- HD / matte black hinges +$60/door
- Black anodized sill +$20 (but see A4)
- Transom minimum glass area (10 sq.ft; shapes 15 sq.ft on multi-panel openings)
- Transom tempering +$160 / +$320
- Mill sill included

## 5. In the tool but not in the book (possible errors or stale data)

| ID | Item | Detail |
|---|---|---|
| **X1** | Colour presets | Paint presets: White, Black, Iron Ore, Charcoal, Commercial Brown, Sandtone, Forest Green, Barn Red, Navy.<br>• Palma equivalents exist for Black (525), Commercial Brown (562), Forest Green (556) and Iron Ore (5P6, printed "Irion Ore").<br>• **Charcoal, Sandtone (the book has 540 Sandstone), Barn Red and Navy are not Palma colours.**<br>• "White" is ambiguous: Standard Polytex White, 429 Ice White, 430 Rainwear White or 431 Bright White.<br>Stain presets: Light Oak, Honey, Medium Oak, Walnut, Mahogany, Espresso, Ebony. **None of these is a Palma stain.** Palma stains: Timber Grey, White Oak, Slate Grey, Bleached Oak, Charcoal Grey, Driftwood, Teak, English Oak, Rustic Cherry, Light Pecan, Red Mahogany, Early American, Dark Walnut, Early American Black, Jacobean, Dark Pecan. |
| **X2** | Fire-rated panel on fiberglass | The configurator offers a fire-rated fiberglass door at a rep-typed price. Neither book offers a fiberglass fire rating. |
| **X3** | Phantom slab models from parse errors | • "Camber 4-Panel BT" (steel) and "Camber Oak 4-Panel BT" (FG): the book row is a **22x10 Camber** lite in a 4-Panel BT slab (FG and ST pp. 6–7).<br>• "Oval Flush" (steel): the book row is an **18x42 Oval** lite in a Flush slab (ST p23).<br>Reps see models that don't exist, and the real 4-Panel BT and Flush models don't show those lites. Prices are unaffected. |
| **X4** | Steel p16 rows typed as doors | The 8 "Sandblast Triple, custom sizes" rows are direct-glazed sidelite frame sizes (5.5"–27.5"). The page header says DOOR, but see D3. |
| **X5** | Pull-bar `companion_column` | All 540 rows store a second number: the **hidden, superseded** price grid that the PDF draws underneath the visible table ($1,850 series, identical in every block). Pricing doesn't use it (verified), but it is stale. Proposed: remove. |
| **X6** | Panel-upcharge brand/texture mis-splits | • "Trimlite Deep" + "Oak" should be Trimlite / Deep Oak (6 rows)<br>• "Richersons Brush" + "Stroke" should be Richersons / Brush Stroke (BW28)<br>• "Smooth Trimlite" + blank should be Trimlite / Smooth (5 SMO-80 rows)<br>Cosmetic. |
| **X7** | Vented rows without sub-table names | See M5 and P2. |
| **X8** | Group "W" for wrought-iron glass | Verona gets "W" in both materials, but the FG book prints **no** group letter for Verona (FG p4); steel prints W. Neither book defines a group-W page. Mapping W to the Wrought Iron page (FG and ST p11) is a reasonable inference; confirm. |
| **X9** | Unconfirmed assumption: "Steel 8' is flush only" | The book says only that non-standard *widths* are flush-only. See A22. |
| **X10** | Unconfirmed assumption: 8'0" is offered only for x80 lites (plus solid) | The glass pages print "8'0" System +$375/box" on every table, which suggests any lite can go in an 8' slab. See A12. |
| **X11** | Decorative glass priced at the dearest group A–D offered on the slab (`flat_max`) | A business rule, not a book rule. Keep, but it is a deliberate over-quote whenever the customer picks a group A or B design. |
| **X12** | Three book panels merged into one model, "Oak 3/4 Panel" | "Oak 3/4 4-Panel" (FG pp. 5–6), "Oak 3/4 Panel" (pp. 7–9) and "Oak 3/4-Panel"/"Oak 3/4 Lite" (sidelites) are merged, with widths taken from OAK3P. The book lists WG49 "4-Panel 3/4" and OAK3P "3-Panel 3/4" as different slabs. See A14. |

## 6. Pricing values that don't match the book

**Row level: none.** Every stored price equals the printed price.

**Pricing logic in the tool that the book doesn't support:**

| ID | Issue | Evidence | Impact |
|---|---|---|---|
| **P1** | **Fiberglass 8'0" solid doors are charged the 8' system twice** | The FG p42 8'0" base is exactly the p39 6'8" base + $375 in all five finish columns, and the 7'0" base (p41) is exactly +$275. So those tables already include the system adder. The configurator still adds "8' System – 95" Slab $375" per door. Verified: 36" Oak Flush, 8'0", painted → tool list **$3,698**; expected **$3,323**. | +$375 list per door (+$150 at 60% off). Steel and fiberglass *glazed* 8' doors are fine: their x80 rows don't include the system. |
| **P2** | **Vented units priced at the dearest sub-variant** | The rows can't be told apart (M5), so the configurator takes the maximum and adds "Confirm the exact unit with Palma". Verified with 22x64 Elevation Clear/LowE in a flush slab, painted 2 sides 1 colour: FG book **$3,988**, tool **$5,144**; steel book **$3,668**, tool **$4,824**. Across all sizes the spread is up to **$1,156 list**. The 22x36 Q550 and Peak 470 rows also collapse together. | Over-quote on every Elevation Clear, Q550, Peak and Elite order. |
| **P3** | Black anodized sill charged $20 on every door | The book line reads "Black Anodized / box (included with painted doors) $20" (FG p44, ST p40). The config default adds $20 regardless of finish. | Possibly $20 too much on painted doors (A4). |
| **P4** | SDL per-square adders never charged | See C18. | Under-quote of $80–$100 per square. |
| **P5** | 8' system charged per door **and** per sidelite | The glass pages say "+$375/box"; the extras pages say "(per Door or Sidelite)". | If "box" means the whole frame unit, a single door with two sidelites at 8' is over-quoted by $750 list (A3). |
| **P6** | Steel fire rating has no book price in the tool | See M1. | The rep types a price where the book says $230. |

## 7. Other configurator gaps found while checking rules

- **G1.** The FG 7'0" solid table (p41) prices only WG00, WG25 and TG71. Other skins may not exist at 7'0" (A13).
- **G2.** Steel "Embossed" solid sidelite (+$95): the book never says which panels count as embossed (A16). The configurator offers "Embossed" as a choice.
- **G3.** The fiberglass book has **no** solid-sidelite price table; the configurator correctly offers none (A15).

## 8. Errors printed in the Palma books (confirmed on the page images)

These are the printed values, not extraction errors. **Palma should confirm or correct them before we rely on them.**

| ID | Page | Problem |
|---|---|---|
| **D1** | FG p21, Sandblast with Clear Border 6mm Lami | Rows copied or shifted from other pages:<br>• 22x09 $6,008 · 22x09 (x4) $6,833 · 22x09 (x5) $3,613 · 22x10 $4,093 · 22x12 (x4) $5,183 are p17's 22x12 (x4), 22x12 (x5), 22x15-1/4, 22x17 and 22x17 (x3).<br>• 22x48, 22x64 and 22x80 are identical to p19, with no lamination premium.<br>• The values $3,830 / $4,194 / $4,683 / $5,170 look like the real 22x36–22x80 prices shifted up three rows. |
| **D2** | ST p20, same series | Same defect:<br>• 22x3.5 (x4) $2,633, 22x12 (x5) $2,553 (cheaper than 22x12 (x4)), 22x14-7/16 Victoria $4,013.<br>• 22x48, 22x48**, 22x64 and 22x80 are identical to p17.<br>• The direct-glazed table steps +$301 per bracket; every other table steps +$108. |
| **D3** | ST p16, Sandblast Triple "custom sizes" | Headed DOOR, but it is a direct-glazed sidelite table, **identical** to p17's (6mm laminated) direct-glazed table. Triple-glazed sandblast has no custom-size door pricing. |
| **D4** | Other suspicious printed prices | • FG p6: 22x15-1/4** FIR03 is $5,556, above the larger 22x17** ($3,940).<br>• FG p6 and ST p6: Group B Half-Moon equals the Clear Half-Moon (p25, p23).<br>• FG p15: 22x15-1/4** is $1,002 above 22x17**.<br>• FG p28: 22x64 and 22x80 are cheaper than 22x36 and 22x48; 22x48 = 22x17**; 22x17 (x3) = 22x12 (x4).<br>• FG p23: 22x36 = 22x09 = 22x10. FG p27: 22x36 = 22x15-1/4**. FG p25: 2036 costs more than 22x36.<br>• FG p31 and ST p29: direct-glazed "up to 27.5"" repeats the 25.5" row.<br>• ST p30: 20x64 = 22x64 and 20x80 = 22x80. ST p32: eight decorative rows cheaper than clear (p31).<br>• FG p36 and ST p34: Elevation Grills 20x64 costs more than 22x64. FG p37 and ST p35: Q550 Grills cheaper than Clear. FG p38 and ST p36: EZ Lift 22x64 cheaper than 20x64.<br>• ST p37: Executive "2 sides 2 colours" = "2 sides 1 colour" in the adders; 22x paint deltas differ from 28x.<br>• FG p43: stain 2 sides 2 colours transom frame ($1,140) costs more than stain-out/paint-in ($710).<br>• FG p45 and ST p40: double door + 2 sidelites casing = single door + 2 sidelites.<br>• FG p42: DRF3F80 is $1,800 at 36" but $6,280 at 42"; RG26 plank listed as "Oak" texture.<br>• FG and ST p8: Group D costs more than Special Order for most sizes. |
| **D5** | Stale references | • "Panel upcharges refer to pages 30-32": really FG pp. 39–42.<br>• "Special Order on Page 10": really ST p9.<br>• ST pp. 17 and 20 say "custom sizes on the next page", but no such page exists.<br>• FG table of contents: accents listed on p51 (really p52); stains 56–57 (really 56–58).<br>• FG p29 labels the FIR03 grills lite "22x14-7/16**"; other pages use 22x15-1/4**.<br>• Several internal links broken (e.g. the Tedee link on FG p46). |

## 9. Ambiguities that need your decision

> **Update 2026-09-30:** Palma's websites answered A1, A2, A7 (options), A12, A13, A16, A20 and A22, and partly answered A10, A14 and A15. The answers are in **section 10a** and override the suggested defaults below where they differ. The rest still needs you or Palma (section 10c).

| ID | Question | My suggested default |
|---|---|---|
| **A1** | **Which slab does each accent go on?** No images in either book. | • Vog 1/2 on the Vog slab; Oso 1/2 on Oso; Era 1 on Era; **Uno 1/2/3 on Flush** (as you said).<br>• "Per side": rep picks exterior, interior or both (qty 1 or 2).<br>• Vertical accent 7x64: only on doors with an 07x64 lite, exterior only, qty 1.<br>• Reeded wood vertical accent: same rule as the 7x64 accent (the book gives no size or side), confirm.<br>• No accents on Linea or Tao.<br>• Also confirm: solid slabs only, or glazed too? |
| **A2** | The fiberglass book repeats the steel accent list (FG p52), but there is no Vog, Oso, Uno or Era fiberglass slab. | Don't offer accents on fiberglass until Palma confirms. |
| **A3** | 7'/8' system: "+$275/+$375 per **box**" on the glass pages vs "**per Door or Sidelite**" on the extras pages. | Ask Palma. Until then keep per door/sidelite (current behaviour), with a note. |
| **A4** | Black anodized sill "+$20/box" vs "included with painted doors" on the same line. | Charge $0 on painted or stained doors; $20 only when a white door asks for black. |
| **A5** | "Direct Glazed Glass: Tempered" (standard) vs "Tempered direct glazed sidelite … +$160". | Treat as included; don't add the $160 on direct-glazed sidelites. |
| **A6** | Steel custom sizes: p38 "+$375 (… and all other custom sizes)" vs p40 "Custom-size steel panels $750". | Listed non-standard widths (flush) +$375; any other custom size +$750. |
| **A7** | Steel hinges: p38 prints both "Ball bearing steel (HD +$60)" and "Heavy-duty stainless (SN/Black), other finishes Patina/Brass". | Keep +$60 HD; add finish as a choice at no charge; Patina/Brass by quote. |
| **A8** | Steel fire rating: solid doors only (it is on the solid page) or glazed too? Do the self-closing hinges replace the $60 HD hinge line? | Solid steel only; +$230 replaces the HD hinge line. |
| **A9** | Fiberglass glazed doors in other skins (C19): which skins take which lites? | Keep glazed doors to the panels the glass pages name until Palma confirms. |
| **A10** | Steel `glass_upcharge` (C20): is a glazed door in panel X priced as the glass row − that row's panel upcharge + X's upcharge? | Needs Palma. Until then, offer glazed only where a row names the panel. |
| **A11** | Executive panels:<br>• What base do the "below doorlite glass" adders apply to?<br>• What is "standard" vs "custom"?<br>• "22x64 / 22x11 (B/D)" has no drawing. | Price solid Executive layouts as listed. Adders: glazed row + adder, standard = the listed layouts; confirm. |
| **A12** | 8'0" doors with lites shorter than x80 (e.g. 22x64 in an 8' slab). | Allow: 6'8" row + 8' system (the glass pages imply it). |
| **A13** | FG 7'0": only WG00, WG25 and TG71 are priced solid. Can other skins or glazed doors be 7'? | 7'0" solid only in those three. Glazed 7'0" = 6'8" row + $275 system, but which glazed slabs exist at 7' needs Palma. |
| **A14** | Are "Oak 3/4 4-Panel" (WG49) and "Oak 3/4 Panel" (OAK3P) the same slab? | Keep them separate, with widths from their own codes. |
| **A15** | Fiberglass solid sidelites: the FG book has no price table. | Not offered (current behaviour). |
| **A16** | Steel embossed solid sidelite (+$95): which panels? | Offer as "Embossed (per Palma)" with a note. |
| **A17** | Transom grills/SDL "additional charges per box apply": how much? | Needs Palma. Until then, add a note. |
| **A18** | Laminated glass $420: for which component, and per what unit? | Per glass unit, doorlite or sidelite. Confirm. |
| **A19** | When are the per-component paint and stain items used (C21)? | Only for finishing supplied or loose parts. Not added to complete systems. |
| **A20** | Stain on Smooth (SMO-80) fiberglass skins: the book prices stain columns for every row. | Allow only paint on SMO skins. |
| **A21** | Energy Star table (ST p45). | Show as an informational note only. |
| **A22** | Is steel 8' flush only? The book doesn't say so. | Allow any steel slab at 8' with the system adder, unless you know otherwise. |
| **A23** | Glass size chart: Masterline 71"x95" (FG p24) vs 32"x82" "SL" (ST p22); "SL" is undefined. | Informational only. |
| **A24** | Verona group letter: blank in FG, "W" in steel. | Treat as W (wrought iron) in both. |
| **A25** | Book defects D1–D4: which values do we store? | **Decided 2026-09-30 and implemented:** quote at the printed price, with a rep-only "Check with Palma" note. `services/doors/book_warnings.py` lists the affected records: 55 price rows, 3 casing rows, 2 transom frames, 1 panel upcharge. Each entry is keyed on the printed price, so a corrected book switches its warning off. Tests: `tests/test_book_warnings.py`. |
| **A26** | The "Large Lever Handle: Verona, Miliano, Country, Ribbon and Miami Large" row mixes Tedee-compatible (Miami) and incompatible handles. | Split into Miami (Tedee OK) vs the others, same price. |
| **A27** | Glass names that are both decorative group A and Obscure (Chinchilla, Fluid, Masterline, Soft), and Niagara (Trimlite group B *and* an Obscure pattern). Which table prices them? | Decorative group when chosen as a design; Obscure page when chosen as obscure glass. |

---

## 10. What Palma's websites answer (checked 2026-09-30)

Sources:
- **docs.palmadoor.com**: jamb depths, colours, lead times, accent pages.
- **palmadoor.com Panel Selector**: every panel's heights, widths and "suitable glass sizes". Snapshot in [palma-audit/panel-selector-2026-09-30.md](palma-audit/panel-selector-2026-09-30.md).
- **Order forms D and D-RT** (last modified Sep 7, 2025).
- **Novatech sheets:** Decorative Accents 11/2022 and 10/2024 (matte gold), Vertical Accent 11/2022, Vertical Accent – Reeded wood 10/2024.
- **"Offset Pull Bars Updated"** (June 2025).

None of these sources give prices. They settle availability and compatibility only.

### 10a. Questions answered

| ID | Answer | Source |
|---|---|---|
| **A1** | **Answered.**<br>• Uno 1 (offset or centred, 4 × 5/16"×26"), Uno 2 (5/16"×32"; 5 pieces on the 2024 sheet, 4 on 2022) and Uno 3 (4 × 1"×32") are "for the **Uno** door", Palma's **Uno – Flush** steel slab.<br>• Vogue 1 (4 × 1-1/8"×4") and Vogue 2 (4 × 9/16"×24"; **5 pieces on the 8' Vogue door**) are for the Vogue slab.<br>• Era (7 × 3/4"×8") is for Era. Oso 1 (4 × 2"×2") and Oso 2 (4 × 2"×13" + 2"×3") are for Oso.<br>• Widths per the Panel Selector:<br>&nbsp;&nbsp;– Uno accents 34"–42" (one page says 28"–42")<br>&nbsp;&nbsp;– Vogue and Oso accents 34"/36"<br>&nbsp;&nbsp;– Era accents 32"–36"<br>&nbsp;&nbsp;– all 6'8"<br>• Era accents also pair with a 7x64 lite.<br>• The **vertical accent** is "for doors with vertical windows": sold as accent + contemporary frame + 7x64 lite (Edge, Oso, sandblasted or clear glass), shown on the Uno door in offset or centred alignment.<br>• The **reeded wood** accent is 10"×76" and "attaches to our Uno steel door" (no glass).<br>• Linea and Tao have no accents. | Novatech sheets; Panel Selector; docs.palmadoor.com/decorative-accents |
| **A2** | **Answered: accents are steel-only.** Every accent sheet says they are for Novatech "Design collection" steel doors, and no fiberglass slab carries them. The fiberglass book's accent list (FG p52) looks copied from the steel book. Recommend not offering accents on fiberglass. | Novatech sheets; Panel Selector |
| **A7** | **Answered (options, not prices).** Order form hinge options:<br>• Satin Nickel (heavy-duty stainless)<br>• Matte Black (heavy-duty stainless)<br>• Patina (ball-bearing, *"not suitable for out-swing"*)<br>• Brass (ball-bearing, *"not suitable for out-swing"*)<br>• Self-closing in Satin Nickel, Matte Black or Patina<br>Price for Patina or Brass: still unknown. Self-closing sets are priced on ST p46 ($80 SN/Patina, $120 Black). | Order form D |
| **A10** | **Partly answered: which steel slabs take glass.**<br>• Vogue and Tao: no glass.<br>• Era, Oso, Linea: 7x64.<br>• Victoria: 22x14-7/16.<br>• Soho: 22x12, 22x48.<br>• 2 Panel Planked Camber Top: 22x36.<br>• 3 Panel Scroll Top: 16x40 small oval.<br>• 2 Panel Camber Top: none.<br>Because no glass row in the book names Era, Oso or Linea, the ST p38 "upcharge used for pricing with glass" column (+$190 / +$290) is almost certainly how those are priced: the Flush 07x64 row plus the panel upcharge. **Still confirm with Palma.** | Panel Selector |
| **A12** | **Answered: 8' doors do take shorter lites.**<br>• Steel 8': Uno 22x14-7/16 (x4) and 22x10 (x5); Soho (A) 22x12 and 22x64; London 22x48; Orleans 22x64; 6 Panel 22x12 and 22x48; 2 Panel Blank Top 22x64.<br>• Fiberglass 8': OAK24 and SMO24 22x64; SMO02-80 and SMO22-80 22x48; SMO03-80 22x17.<br>Price is presumably the 6'8" row + 8' system; confirm. | Panel Selector |
| **A13** | **Answered.** Fiberglass 7'0" exists only as:<br>• WG00 Oak Flush<br>• WG25 3/4 Lite 2 Panel (22x48 glass)<br>• TG71 Modern Teak<br>• SG00 smooth flush and SG25 smooth 3/4 lite (not priced in the FG book)<br>Steel 7'0" exists in 13 slabs: Tao, Vogue, Era, Victoria, Soho, Sydney, Orleans (+SL), London (+SL), 4 Panel BT, 6 Panel, 3 Panel SL, Uno Flush (+SL). | Panel Selector; order form D (7'0" frame height) |
| **A14** | **Partly answered.** WG49 ("3/4 Lite 4 Panel", Richersons, 22x48) and OAK3P ("3-Panel", Trimlite, 18x42 oval or 22x48) are different slabs. Keep them separate. The book's "Oak 3/4 4-Panel" rows are most likely WG49. | Panel Selector |
| **A15** | **Partly answered.** Fiberglass solid sidelites do exist:<br>• WS00, WS68, WS49, WS34, WS01, WS37 (woodgrain oak)<br>• SS00, SS46, SS49, SS01 (smooth)<br>• MS35 (rustic), BS28 (brush stroke)<br>• the OAK2R, FIR2S and SMO2R/SMO2S glazed sidelites<br>The fiberglass book prices only the glazed 6-Panel, 3/4-Panel and Flush sidelites. **Solid fiberglass sidelites still need a price from Palma.** | Panel Selector |
| **A16** | **Answered (inference).** Steel solid sidelites are:<br>• Orleans SL, London SL, 2 Panel Reversible SL, 3 Panel SL: raised or embossed, so the "Embossed +$95" row<br>• Uno – Flush SL: the "Flush base" row | Panel Selector |
| **A20** | **Answered.** Stains are "for woodgrain fiberglass doors", "specifically designed for textured fiberglass". **No stain on smooth fiberglass** (SMO, SG, SC, WSSS). | docs.palmadoor.com (stain colours) |
| **A22** | **Answered: steel 8' is not flush-only.** 8'0" steel slabs:<br>• Tao, Vogue (new)<br>• Soho (A) and (B)<br>• London (new)<br>• Orleans (new), Orleans Blank Top, Orleans SL<br>• 6 Panel, 2 Panel Blank Top, 2 Panel SL<br>• Uno Flush (+SL)<br>The tool's assumption is wrong. | Panel Selector |
| **C11** | **Confirmed.** "All other colours will be considered custom and require a physical colour chip", i.e. the $750 custom colour match. | docs.palmadoor.com (paint colours) |
| **C12 / R1** | **Refined.**<br>• 7-1/4" jambs are "reserved for use with retractable screens and Out-Swing Sills"; in-swing 7-1/4" is "available with Retractable Screens only".<br>• 5-5/8" is smooth only (matches the book).<br>• The retractable-screen form (D-RT) allows only 6-5/8" or 7-1/4" jambs and in-swing doors, with a self-draining sill (7-5/8" or 8-1/4" + 1/2" track).<br>• **Unlike the price-book footnote, D-RT lists three brickmoulds with reveal limits:**<br>&nbsp;&nbsp;– Regular 2": side 3/4"–1", top 3/4"–1-3/4"<br>&nbsp;&nbsp;– Flat 1-1/2": 1/4"–1/2"<br>&nbsp;&nbsp;– Flush: 0"<br>So the "Regular 2" only" rule may be out of date. Confirm which applies.<br>• The fiberglass book has no 7-1/4" jamb price, so fiberglass retractable screens can only be quoted on 6-5/8" until Palma prices 7-1/4" for fiberglass. | docs.palmadoor.com (jamb depths); order form D-RT |
| **C7** | **Refined.** Offset pull bars now fit fiberglass doors *with* doorlites (new bracket, 2025). Lengths shown: 6'8" doors 36"–72"; 8' doors 48"–84". **84" bars are for 8' doors only.** | "Offset Pull Bars Updated", Jun 2025 |

### 10b. New findings from the websites (not in either price book)

| ID | Finding | Effect on the tool |
|---|---|---|
| **W1** | **"Multipoint locks are necessary for all Fiberglass doors"** (every fiberglass door page) and **"… for all 8' doors"** (8' steel pages). | The configurator offers double-bore prep on fiberglass and on 8' doors. **Proposed rule: require multipoint on fiberglass and on every 8' door.** |
| **W2** | **Per-slab width availability is narrower than the book's "standard 30"–36"".**<br>• Steel 6'8": Vogue, Tao and Oso 34"/36" only; Era and Linea 32"–36"; Prestige, Shaker and Classic slabs 32"–36"; 6 Panel 28"–36"; Uno Flush 24"–42".<br>• Fiberglass: most skins 32"–36"; flushes add 30" and/or 42"; WG01 (8') goes to 48". | The configurator offers 30" on every steel slab. Proposed: limit widths per slab to the Panel Selector list, with non-standard widths through the +$375 / +$750 rules. |
| **W3** | **Panels Palma sells that the price book doesn't price:**<br>• Fiberglass: Flush Mahogany MAH00, Flush Fir FIR00, all 6'8" smooth skins (SG/SMO/SC/WSSS series), 7'0" SG00/SG25.<br>• Fiberglass: Grooved Oak WC01–07 / WC11–17 and Stainless Steel Oak WGSS01–08. These are probably the patterns behind the book's single "Contemporary Grooved OG-GR" and "Contemporary Stainless Steel OG-SS" prices; confirm.<br>• Fiberglass: smooth grooved and stainless SC/WSSS; solid fiberglass sidelites (A15).<br>• Steel: 8' Altitude (Vogue, London, Orleans new). | These can't be quoted from the book. Ask Palma for prices, or confirm that OG-GR and OG-SS cover every WC and WGSS pattern (the rep would then pick the pattern code). |
| **W4** | Vogue 2 accent in **matte gold** (Novatech 2024 sheet) has no Palma price; the book lists matte gold only for Uno 1/2 and Era 1. The 2024 sheet also lists Uno 3 in Alunox (Palma has it at $650). | Ask Palma for Vogue 2 matte gold, or don't offer it. |
| **W5** | Vertical accent: Novatech sells the accent **with its frame and a 7x64 lite**. The book prices only "Vertical Accent for 7x64 – $1,780 / $1,890". | Decide whether the accent price is added to the Uno 07x64 glazed-door row (my suggestion) or replaces the glass. |
| **W6** | Production lead times (docs):<br>• Factory white 4–5 wk; painted 1 colour 5–6 wk; painted 2 colours 6–7 wk; stained 6–8 wk; stained 2 colours or stained + painted 7–8 wk<br>• Custom colours +2 wk; panel CNC grooving +2 wk; custom steel panels +2–4 wk; shape transoms +2–3 wk | Optional: show as quote notes. |
| **W7** | Order-form choices the tool doesn't model (no prices in the book):<br>• single-bore prep<br>• storm-door prep<br>• loose vs attached brickmould and sill horns<br>• sill depth per jamb (4-7/8" to 11-1/8"; the $20 sill extension)<br>• caming colour (zinc, brass, patina)<br>• "Urbano woodgrain aluminum" glass frame<br>• Polytex (unpainted) jambs and brickmould | Informational. Candidates for order-spec fields rather than priced lines. |

### 10c. Still needs Palma

The websites don't settle these:
- A3 (7'/8' per box vs per door)
- A4 (black anodized sill)
- A5 (tempered direct-glazed sidelite)
- A6 (custom size +$375 vs +$750)
- A8 (fire rating scope)
- A9 pricing (glazed fiberglass in other skins)
- A10 pricing confirmation
- A11 (Executive adders)
- A17 (transom grill/SDL extra)
- A18 (laminated glass)
- A23–A27
- The book misprints D1–D5
- Prices for W3 and W4

---

## 11. Implementation status (2026-09-30)

The user asked for the plan to be implemented "on best judgement", with the remaining uncertainties sent to Palma. **Rule:** a rule printed in a book blocks a selection. A rule that comes only from Palma's websites steers the configurator and adds a rep note, so saved quotes still price. No stored price was changed; the book-vs-data diff still shows **0 price mismatches**.

**Data** (`data/doors/*.json`, by script; formatting preserved):
- M5/X7: 113 vented rows now carry `variant`/`variant_label` from their book sub-table.
- X4: the 8 steel p16 rows are `direct_glazed_sidelite` (the D3 warnings follow them).
- X5: pull-bar `companion_column` removed.
- X6: 13 panel-upcharge brand/texture splits fixed.
- New option records:
  - M1: steel 20-min fire rating $230 (ST p38)
  - M2: custom grills $40/box (FG p29, ST p27)
- Config: steel 5-1/4" (smooth only) and 7-1/4" jambs.

**Pricing fixes** (`services/doors/pipeline.py`, `pricing.py`):
- **P1:** no 7'/8' system charge on fiberglass solid slabs. The 36" Oak Flush 8' painted door is now $3,323 (was $3,698).
- **P2:** each vented unit is priced from its own sub-table (22x64 Elevation Clear: FG $3,988, ST $3,668). Saved selections with the old series still price at the old figure, with a note.
- **P4:** SDL square count × the per-square price.
- **P6/M1:** steel fire rating from the book; the HD hinge line is dropped because self-closing hinges are included. The fiberglass rep-entered fire price is kept only for saved quotes (X2).
- **A4:** black anodized sill $0 on painted/stained doors, $20 on factory white. This applies in the classic editor too; the classic reference quote drops $20 list.

**Configurator coverage:**
- Heights:
  - C15: 7'0".
  - A22: steel 8' in Tao, Vogue, Soho, London, Orleans and 6 Panel.
- Widths:
  - C14: steel 24/26/28/38/40/42" flush with +$375.
  - W2: Panel Selector widths, where other book widths still price with a note.
- Panels and glass:
  - C16: Executive panels.
  - C17: steel triple sandblast direct-glazed sidelites.
  - X3: phantom models folded in, with legacy aliases.
  - X12: WG49 split from OAK3P.
  - M7: obscure and Solution sandblast pattern pickers.
  - M6/X1/C11: Palma's 51 paints and 16 stains, and the $750 colour match for any other colour.
- Extras:
  - C1: accents, steel only, per side, on their own slab. The vertical accent needs a 7x64 Uno lite; reeded wood goes on Uno.
  - C2: dentil shelf and kick panel.
  - C3 + M3: casing and backband.
  - C4 + R6: glass frames, with the contemporary frame included on ** sizes and on Victoria/Soho.
  - C6: sliding screens.
  - C7: pull bars in step 7, with a dummy on the inactive leaf; offset on fiberglass only; 84" on 8' only.
  - C8: key alike and Tedee knob.
  - C9: operating sidelite.
  - C10: custom brickmould.
  - C13: steel triple glazing.
  - M4: satin nickel HD hinges.

**Rules:**
- Printed in the book, so they block:
  - R1: retractable screens need a 6-5/8" or 7-1/4" jamb.
  - R2: retractable screens × 2 on double doors.
  - R3: no Tedee with EMTEK prep.
  - R4: special-order pairing.
  - Operating sidelites are for standard sizes only.
- From Palma's websites, so they add a note:
  - W1: multipoint on fiberglass and 8'. The UI disables double-bore.
  - A20: no stain on smooth skins. The UI hides it.
  - R1: brickmould other than regular with a retractable screen.
  - R3: Tedee with the Large/Small Lever row works with Miami only.
  - A3/P5: per box vs per door.
  - R8: transom notes.
  - W6: lead times.
  - Accent widths and heights.

**API and UI:**
- `api/schemas/doors.py` accepts the new fields. Before this, Pydantic dropped unknown fields silently.
- `frontend/lib/doorPipeline.ts`, `DoorConfigurator.tsx` and `lib/palmaColours.ts` hold the Palma colour list, mirrored from `services/doors/colours.py` and checked by a test.

**Tests:**
- `tests/test_door_pipeline_audit.py`, `tests/test_door_colours.py`, and updated `test_door_pipeline.py` / `test_doors.py`: 295 passed, 1 skipped.
- `frontend/lib/__tests__/doorPipeline.test.ts`: 49 passed.
- Every one of the 4,374 offered slab/width/glass combinations prices.

**Not implemented; waiting on Palma** (see [palma-questions-to-send.md](palma-questions-to-send.md)):
- laminated glass (C5/A18)
- tempered direct-glazed sidelite (A5)
- Patina/Brass hinges (A7)
- 8' glazed steel beyond the x80 rows (A12)
- Executive below-doorlite adders (A11)
- Vogue 2 matte gold and the 8' Vogue accent set (W4)
- glazed Era/Oso/Linea steel (A10)
- glazed fiberglass in other skins (A9)
- transom grille/SDL extra (A17)
- fiberglass 7-1/4" jamb (C12)
- unpriced panels (W3/A15)
- per-component paint/stain (C21)
- the steel PARTS page (C22, left for service quotes)
- single-bore and storm-door prep (W7)

**Estimates already saved:** changing the data files changes the price-source fingerprint, so unsent estimates are asked to reprice before finalization (decision 56). Nothing reprices a saved estimate automatically; ones already sent keep the figures they were sent with until someone reprices them.
