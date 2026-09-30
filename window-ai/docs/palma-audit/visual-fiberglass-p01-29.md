# Visual audit: Fiberglass Entry Door Price Book 2024 [Interactive].pdf, pages 1-29

## Method

- `pdftoppm` is not installed, so the Read tool could not render the PDF. I rendered every page (1-29) to PNG at 2000 px wide with the built-in Windows PDF API (`Windows.Data.Pdf`) via `audit/render_pdf_1_29.ps1`. The images are in `audit/render_1_29/pNN.png`. For small details (p21 table, p24 header) I used zoomed crops (`audit/crop.ps1`).
- I read each page image and compared it cell by cell against the `=== PAGE n ===` block in `fg_clean.txt`.
- Programmatic cross-checks with pypdf, as a complement to the visual pass:
  - I checked for invisible text (`Tr 3`) and for duplicated or overlapping text runs. None found on pages 1-29; the only "duplicate" was the repeated `NEW in 2025` string.
  - I extracted link annotations and resolved their internal targets.
  - I checked the column-offset pattern of every price row. All 262 DOOR rows are base / +180 / +950 / +1250 / +1300; all 63 Panel SIDELITE rows are +170 / +810 / +1010 / +1090; all 96 Direct Glazed rows are +60 / +190 / +240 / +300. So no single cell is mistyped; every anomaly below affects a whole row.
- **Headline result:** on every page, every printed price, size, panel name, glass name and group letter matches the text layer. No page shows a value that differs from the extraction. The problems that matter are:
  - (a) errors in the source document itself, which the image confirms (page 21 and others under "Anomalies");
  - (b) visual-only information: colour coding, NEW badges, hyperlinks, a blank group cell;
  - (c) text-layer delimiter artifacts that can misalign columns in a naive " | " split.

## Text-layer artifacts (all pages): these can cause column misalignment if the parser splits on " | "

1. **Merged cells.** A double space instead of " | " joins two cells, so the row has one fewer field. The prices are still correct.
   - p5, p6, p7, p8, p9: `22x14-7/16 (x4)  Oak Flush` (size merged with panel)
   - p13, p15, p17, p19, p21, p23, p25, p27: `22x15-1/4**  Craftsman FIR03` (size merged with panel)
   - p11: `Craftsman FIR03  $4,261`; p29: `Craftsman FIR03  $3,251` (panel merged with the first price)
   - p12: `Oak 3/4 Panel  $4,634` (door 22x48) and `Oak 3/4 Panel  $3,207` (sidelite 8x48)
   - p14: `Oak 42" Flush  $5,304` and `$5,824`; p20: `Oak 42" Flush  $5,491` and `$6,058`
   - p26: `Oak 3/4 Panel  $2,568` (sidelite 8x48)
   - p28: `Oak 3/4 2-Panel  $4,460` (22x48); p29: `Oak 3/4 2-Panel  $3,357` (22x48)
   - p3: every "stained - welded" row joins the type and the group letter with a double space (`stained - welded  B`).
2. **Vertical side-tab labels land at the end of arbitrary rows.** The labels are "Fiberglass Doors", "Textured Composite Frames" and "Composite Sills", printed as a rotated tab strip in the right margin of pages 5-29. The text layer appends them as an extra trailing field to whichever row is at the same height. Examples:
   - p5 `22x12 (x4) … $5,844 | Textured Composite Frames`
   - p7 `22x17** … | Textured Composite Frames` and `7x64 … | Composite Sills`
   - p9 `22x14-7/16 (x4) … | Textured Composite Frames` and `28x80 … | Composite Sills`
   - p15 and p17 `22x15-1/4** … | Textured Composite Frames`
   - p25 `12x12 (x4) … | Textured Composite Frames` and `22x17** … | Composite Sills`
   - p24 `Aqualite | 71" x 83" | Composite Sills`

   These labels are navigation tabs, not data.

## Page 1: Cover

- **Values:** no differences. The text is "FIBERGLASS DOORS / 2024/2025 / PRICE BOOK".
- **Visual only:**
  - Palma Door Systems Inc. logo at top left.
  - A full-page photo of a woodgrain (stained, medium oak) fiberglass door with 3 horizontal rectangular lites of textured obscure glass (rain/glue-chip look), one narrow textured sidelite on the left, black multipoint handle and escutcheon, and a black sill.
  - No product name, model or code is printed on the photo.
- **Footnotes:** none.
- **Anomalies:** none.

## Page 2: Table of contents

- **Values:** no differences.
  - The text layer interleaves the left column (Doors with Glass) and the right column (Solid Doors / Transoms / Extras) on the same lines, but every page number is correct.
  - "Effective: Jun 15, 2024 - Last Updated: Oct 21, 2025" matches.
- **Visual only:**
  - Yellow "NEW" badge to the left of "Pull Bars (Straight) … 47-48". It is in the text as "NEW  Pull Bars (Straight)".
  - Footer: "support: sales@palmadoor.com", Palma logo, "resources: www.palmadoor.com". This footer is not in the text layer (it sits inside a form XObject). The same footer appears on most pages; it is absent on p9 and p10.
  - The footer mailto link has the subject "From: Steel Entry Door Price Book 2023", a stale subject line.
- **Footnotes:** none.
- **Anomalies:** none on the page itself. See the cross-reference note under p5 ("pages 30 - 32").

## Page 3: Novatech decorative glass pricing groups (part 1)

- **Values:** no differences. In `fg_clean.txt` every name / type / group / NEW marker lines up with the image (see the table in the "Pages 3-4" section).
- **Visual only:**
  - **Row colour coding by group**, which is not in the text: A = light green, B = light blue, C = pink, D = salmon/orange. Every row's colour agrees with its letter.
  - **Yellow "NEW in 2025" badges** in the left margin next to Distance, Echo, Luxe, Prism and Rubik. These are in the text too.
  - Glass names and group letters are underlined as hyperlinks. The names link to `palmadoor.com/doorlites/<name>-by-novatech`.
  - Not underlined and no link: Chinchilla, Masterline, Oso.
  - Underlined but no link annotation: Distance, Echo, Luxe, Prism, Rubik, Kallima.
  - Evangeline: only "Evangeline" is underlined; the "II" is not.
- **Footnotes:** none on the page.
- **Anomalies:**
  - "Masterline" is out of alphabetical order (after Mystique).
  - Chinchilla, Fluid and Masterline are listed as "textured" group A here, and the same names also appear on the OBSCURE list (p23). This is a potential double classification. It is not a price error.

## Page 4: Novatech (part 2) and Trimlite decorative glass pricing groups

- **Values:** no differences against the text layer.
- **Visual only:**
  - Same A/B/C/D colour coding. Trimlite rows **Pemberton and Verona are grey**, a colour used only for "wrough iron".
  - **Verona's group cell is visibly empty.** No letter is printed.
  - "NEW in 2025" badges next to Solstice and Zen.
  - Both **Textile** rows link to the same URL, `palmadoor.com/doorlites/textile-by-novatech`, so it is a duplicated row, not two different products.
  - The Granville link URL is misspelled: `…/graville-trimlite`.
  - "palmadoor.com/glass-selector" is in pink/red. It has two link annotations with a malformed URL, `http://https://www.palmadoor.com/glass-selector`, and one valid one.
- **Footnotes:** the "Online Glass Selector" paragraph (italic) matches the text.
- **Anomalies:**
  - Textile is listed twice, both silkscreen B.
  - "Zen" (stained - welded D, NEW) sits out of alphabetical order before Winchester.
  - Pemberton's group is "W", which is not one of the A-D pricing groups. It presumably means the Wrought Iron page (p11), but the page does not say so.
  - Verona has no group letter at all.
  - The typo "wrough iron" appears in both the image and the text.
  - Pages 5-8 say groups include "Novatech, Trimlite and Verre Select brochures", but no Verre Select table appears on pages 3-4.

## Pages 3-4: exact visual list (brand, glass name, type, group, NEW)

Row colour always matches the group: A = green, B = blue, C = pink, D = salmon; W and blank = grey.

| # | Brand | Glass name | Type | Group | NEW |
|---|---|---|---|---|---|
| 1 | Novatech | Allure | stained - welded | B | |
| 2 | Novatech | Alys | v-groove | B | |
| 3 | Novatech | Arima | stained - welded | C | |
| 4 | Novatech | Attraction | stained - welded | D | |
| 5 | Novatech | Avenue | stained - welded | C | |
| 6 | Novatech | Azur | silkscreen | B | |
| 7 | Novatech | Balance | silkscreen | B | |
| 8 | Novatech | Belmont | stained - welded | C | |
| 9 | Novatech | Bistro | stained - welded | C | |
| 10 | Novatech | Bolero | stained - welded | C | |
| 11 | Novatech | Cachet | stained - welded | C | |
| 12 | Novatech | Cathedrale | stained - welded | C | |
| 13 | Novatech | Celeste | stained - welded | B | |
| 14 | Novatech | Chanelle | stained - welded | D | |
| 15 | Novatech | Chinchilla | textured | A | |
| 16 | Novatech | Crystal | stained - welded | B | |
| 17 | Novatech | Distinction | v-groove | A | |
| 18 | Novatech | Distance | v-groove | A | NEW in 2025 |
| 19 | Novatech | Echo | silkscreen | B | NEW in 2025 |
| 20 | Novatech | Edge | sandblast | A | |
| 21 | Novatech | Emori | v-groove | B | |
| 22 | Novatech | Equation | silkscreen | A | |
| 23 | Novatech | Evangeline II | stained - welded | C | |
| 24 | Novatech | Fluid | textured | A | |
| 25 | Novatech | Kallima | stained - welded | D | |
| 26 | Novatech | Kira | silkscreen | B | |
| 27 | Novatech | Liano | stained - welded | C | |
| 28 | Novatech | Louisbourg | silkscreen | A | |
| 29 | Novatech | Luxe | stained - welded | B | NEW in 2025 |
| 30 | Novatech | Mist | silkscreen | B | |
| 31 | Novatech | Mistral | stained - welded | D | |
| 32 | Novatech | Mystique | stained - welded | B | |
| 33 | Novatech | Masterline | textured | A | |
| 34 | Novatech | Nobel | stained - welded | C | |
| 35 | Novatech | Nuando | silkscreen | A | |
| 36 | Novatech | Opal | stained - welded | C | |
| 37 | Novatech | Ophir | stained - welded | C | |
| 38 | Novatech | Oso | silkscreen | A | |
| 39 | Novatech | Portrait | stained - welded | C | |
| 40 | Novatech | Prism | stained - welded | C | NEW in 2025 |
| 41 | Novatech | Pure | silkscreen | A | |
| 42 | Novatech | Rhythm | v-groove | A | |
| 43 | Novatech | Rubik | stained - welded | B | NEW in 2025 |
| 44 | Novatech | Satin | textured | A | |
| 45 | Novatech | Side | silkscreen | A | |
| 46 | Novatech | Soft | textured | A | |
| 47 | Novatech | Solstice | silkscreen | B | NEW in 2025 |
| 48 | Novatech | Textile | silkscreen | B | |
| 49 | Novatech | Textile (duplicate row, same link) | silkscreen | B | |
| 50 | Novatech | Transit | silkscreen | A | |
| 51 | Novatech | Verso | v-groove | A | |
| 52 | Novatech | Zen | stained - welded | D | NEW in 2025 |
| 53 | Novatech | Winchester | decorative | B | |
| 54 | Novatech | Zenith | v-groove | B | |
| 55 | Trimlite | Adelaide | stained - welded | B | |
| 56 | Trimlite | Artisan | stained - welded | B | |
| 57 | Trimlite | Canterbury | stained - welded | C | |
| 58 | Trimlite | Eastmount | stained - welded | B | |
| 59 | Trimlite | Everton | stained - welded | B | |
| 60 | Trimlite | Granville | stained - welded | A | |
| 61 | Trimlite | Harlow | stained - welded | A | |
| 62 | Trimlite | Hollister | stained - welded | A | |
| 63 | Trimlite | Lexington | stained - welded | B | |
| 64 | Trimlite | Lonsdale | sandblast | B | |
| 65 | Trimlite | Manhattan | stained - welded | B | |
| 66 | Trimlite | Modena | stained - welded | A | |
| 67 | Trimlite | Niagara | stained - welded | B | |
| 68 | Trimlite | Pemberton | wrough iron | W | |
| 69 | Trimlite | Riverton | v-groove | A | |
| 70 | Trimlite | Royston | stained - welded | B | |
| 71 | Trimlite | Sullivan | sandblast | A | |
| 72 | Trimlite | Verona | wrough iron | (blank: no letter printed; grey cell) | |
| 73 | Trimlite | Waterton | stained - welded | B | |
| 74 | Trimlite | Winslow | stained - welded | B | |

## Page 5: Decorative Glass, Group A, 6'8"

- **Values:** no differences. All 17 door rows and 3 sidelite rows match; for example 07x64 $3,374 … 22x80 $4,072, and sidelites 8x36 $2,643, 8x48 $2,750, 7x64 $2,846.
- **Visual only:**
  - Yellow-shaded Glass Sizes column.
  - "Craftsman FIR03" and "Craftsman 3DP" are underlined links to `palmadoor.com/door-panels/3-panel-fir-craftsman-shaker-fir03` and `…/fir-shaker-craftsman-3dp`.
  - The 3-line NOTE is printed in red.
  - "Page 9" and "pages 30 - 32" are underlined links.
  - **The "pages 30 - 32" link actually jumps to PDF page 40** (6'8" Solid Fiberglass Doors). The printed reference looks stale: per the TOC, pages 30-32 are SDLs and Internal Blinds.
  - Right-margin side tabs: Fiberglass Doors | Textured Composite Frames | Composite Sills.
- **Footnotes (verbatim):**
  - "NOTE: Price Goups A, B, C and D include only items available in current Novatech, Trimlite and Verre Select brochures. / Any customization to the size or caming will be priced as "Special Order" on Page 9. / Special Order sidelites and doorlites will be ordered together, therefore both will be priced as Special Order."
  - "Panels: Fiberglass as listed.  For applicable fiberglass panel upcharges refer to pages 30 - 32."
  - "Hinges: Ball Bearing Steel (Heavy-Duty Stainless Steel and Matte Black hinges +$60/door)."
  - "Jambs: Textured Composite (available in 4-5/8", 6-5/8", and *7-5/8").  *extra charges apply". The single * attaches to the 7-5/8" jamb only.
  - "Sill: Fixed - Mill (Clear Anodized)"
  - "Black Anodized Sill: +$20/box"
  - "Standard Glass Frame: Textured Colonial PVC"
  - "Contemporary Woodgran glass frame: +$80/doorlite (included with Shaker Craftsman panels)"
  - "7'0" System: +$275/box"
  - "8'0" System: +$375/box"
  - `**` marks: `22x15-1/4**` (Craftsman FIR03) and `22x17**` (Craftsman 3DP). **The page does not explain `**`.** No page in 1-29 defines it, and no `**` legend appears anywhere in the extracted text.
- **Anomalies:**
  - The sidelite 8x48 panel is "Oak 3/4 Lite", unique to this page; elsewhere it is "Oak 3/4-Panel".
  - There is no 8x80 sidelite row.
  - Otherwise plausible.

## Page 6: Decorative Glass, Group B, 6'8"

- **Values:** no differences (19 door rows, 4 sidelite rows).
- **Visual only:** same styling and links as p5. The "pages 30 - 32" link again goes to p40.
- **Footnotes:** identical to p5 (same NOTE, same list). `**` is on 22x15-1/4** (FIR03) and 22x17** (3DP) and is not explained.
- **Anomalies:**
  - **22x15-1/4** Craftsman FIR03 = $5,556 / $5,736 / $6,506 / $6,806 / $6,856.**
    - This is implausible. It is $1,616 more than the larger 22x17** 3DP on the same page ($3,940).
    - It is $1,627 more than the Special Order FIR03 ($3,929, p9) and $2,378 more than Group A FIR03 ($3,178).
    - On every other page FIR03 is about $364-$580 *below* 3DP. The image confirms $5,556 is what is printed.
  - **Half-Moon (Oak 4-Panel BT) = $3,094 / $3,274 / $4,044 / $4,344 / $4,394**, identical in all five columns to the *Clear/LowE* Half-Moon on p25. It is also cheaper than the Grills Half Moon ($3,145, p29) and Group C Half-Moon ($3,383). This looks like a copy from the Clear page.

## Page 7: Decorative Glass, Group C, 6'8"

- **Values:** no differences (14 door rows, 3 sidelite rows).
- **Visual only:**
  - In the sidelite panels, "6-Panel" in "Oak 6-Panel" and "3/4-Panel" in "Oak 3/4-Panel" are underlined, but there are no link annotations behind them.
  - Otherwise the same as p5; the "pages 30 - 32" link goes to p40.
- **Footnotes:** identical to p5. `**` is only on 22x17** (3DP), not explained.
- **Anomalies:** Group C has no 22x80, no 22x12 rows and no FIR03 row. This is a coverage gap, not a price error.

## Page 8: Decorative Glass, Group D, 6'8"

- **Values:** no differences (10 door rows, 3 sidelite rows).
- **Visual only:** the same sidelite panel-name underlining as p7; the "pages 30 - 32" link goes to p40.
- **Footnotes:** identical to p5. `**` is on 22x17** (3DP), not explained.
- **Anomalies:**
  - Observation: Group D is priced *above* Special Order (p9) for most shared sizes:
    - doors: 07x64 $4,106 vs $3,849; 07x64 (x2) $5,504 vs $4,990; 08x48 (x2) $5,090 vs $4,946; 22x14-7/16 (x4) $7,412 vs $6,524; 22x17** $4,425 vs $4,409; 22x17 (x3) $6,179 vs $6,131; 22x36 $4,163 vs $3,978; 22x48 $4,629 vs $4,370; 22x64 $5,191 vs $4,805;
    - sidelites: 8x48 $3,461 vs $3,376; 7x64 $3,703 vs $3,402.
  - This is not necessarily an error, but it conflicts with the idea that customization moves the price up to "Special Order".

## Page 9: Decorative Glass, Special Order, 6'8" (Stained Welded ONLY)

- **Values:** no differences (21 door rows, 4 sidelite rows).
- **Visual only:**
  - No support/resources footer, only the page number "9". The text layer's extra " | 9" is that page number.
  - Sidelite "6-Panel" and "3/4-Panel" are underlined.
  - FIR03 (2 rows) and 3DP are links. The "pages 30 - 32" link goes to p40.
- **Footnotes:**
  - Red "NOTE: Special Order sidelites and doorlites will be ordered together, therefore both will be priced as Special Order."
  - Then the same Panels / Hinges / Jambs (*7-5/8" extra) / Sill / Black Anodized Sill / Standard Glass Frame / Contemporary Woodgran / 7'0" / 8'0" lines as p5.
  - `**` is on 22x15-1/4**, 22x16** (both FIR03) and 22x17** (3DP), not explained.
- **Anomalies:** 22x15-1/4** and 22x16** carry identical prices ($3,929), which is plausible (same panel). This is the only page with 22x16, 25x15 (Oak 6-Lite WG66), 28x17 (x3) and 28x17 (x4).

## Page 10: Decorative Glass, Special Order (Direct Glazed sidelite), 6'8"

- **Values:** no differences. The 8 Direct Set rows run from $2,728 to $4,240, in steps of $216.
- **Visual only:**
  - The TOC calls this "Decorative Glass - Direct Glazed S/L", but the printed page header reads "Decorative Glass - **Special Order** / includes: Stained Welded ONLY".
  - No footer; the "pages 30 - 32" link goes to p40.
- **Footnotes (verbatim):**
  - Red "NOTE: Special Order sidelites and doorlites will be ordered together, therefore both will be priced as Special Order."
  - "Panels: Fiberglass as listed.  For applicable fiberglass panel upcharges refer to pages 30 - 32."
  - "Black Anodized Sill: +$20/box"
  - "Contemporary Woodgran glass frame: +$80/doorlite (included with Shaker Craftsman panels)"
  - "7'0" System: +$275/box"
  - "8'0" System: +$375/box"
  - The Hinges, Jambs, Sill and Standard Glass Frame lines are absent on this page.
- **Anomalies:** none.

## Page 11: Wrought Iron, 6'8"

- **Values:** no differences (7 door rows, 4 sidelite rows, 8 Direct Set rows). Only the text-layer merge `Craftsman FIR03  $4,261` differs.
- **Visual only:** FIR03 and 3DP are links; the "pages 30 - 32" link goes to p40.
- **Footnotes:** the standard list from p5, with no red NOTE. `**` is on 22x15-1/4** and 22x17**, not explained.
- **Anomalies:** none within the page.

## Page 12: Laser-Cut Iron, 6'8"

- **Values:** no differences (4 door rows, 4 sidelite rows, 8 Direct Set rows). The text merges `Oak 3/4 Panel  $4,634` and `Oak 3/4 Panel  $3,207`.
- **Visual only:** no links in the table; the "pages 30 - 32" link goes to p40.
- **Footnotes:** the standard list from p5. There is no `**` on this page.
- **Anomalies:** the **Panel SIDELITE and Direct Glazed SIDELITE tables are identical, row for row, to p11 Wrought Iron**: 8x36 $3,112, 8x48 $3,207, 7x64 $3,374, 8x80 $3,645, and Direct Set $2,773 through $4,285. This may be intentional shared pricing, or a copy.

## Page 13: Sandblast standard Dual Glazed, standard sizes, 6'8"

- **Values:** no differences (17 door rows, 4 sidelite rows).
- **Visual only:** FIR03 and 3DP links; the italic note "(custom sizes on the next page)" (in text); side tabs.
- **Footnotes:** the standard list from p5. `**` is on 22x15-1/4** and 22x17**, not explained.
- **Anomalies:** 22x09 = 22x10 ($3,154), which is plausible.

## Page 14: Sandblast standard Dual Glazed, custom sizes, 6'8"

- **Values:** no differences: 28x64 $5,304, 28x80 $5,824, and Direct Set $2,323 through $3,079 in steps of $108.
- **Visual only:** styling only.
- **Footnotes:** the standard list from p5. No `**`.
- **Anomalies:** none.

## Page 15: Sandblast TRIPLE Glazed, standard sizes, 6'8"

- **Values:** no differences (14 door rows, 4 sidelite rows).
- **Visual only:** FIR03 and 3DP links; side tabs.
- **Footnotes:** the standard list from p5. `**` is on 22x15-1/4** and 22x17**, not explained.
- **Anomalies:**
  - **22x15-1/4** Craftsman FIR03 = $4,871 / $5,051 / $5,821 / $6,121 / $6,171.** This is implausible:
    - it is $1,002 more than the larger 22x17** 3DP on the same page ($3,869);
    - on p13 (dual glazed) FIR03 is $480 *below* 3DP;
    - it is also more than the Sandblast 6mm Laminated FIR03 ($3,613).
  - The image confirms $4,871 is printed. If the usual pattern held (FIR03 about $480 below 3DP), the value would be around $3,389; this is an inference, not printed anywhere.
  - Triple glazed has no 22x09 or 22x10 rows, although dual glazed (p13) has them.

## Page 16: Sandblast TRIPLE Glazed, custom sizes, 6'8"

- **Values:** no differences. Direct Set runs from $2,587 to $3,343 in steps of $108.
- **Visual only:** styling only. There is no DOOR table (no 28x64 / 28x80), unlike p14.
- **Footnotes:** the standard list from p5.
- **Anomalies:** none.

## Page 17: Sandblast 6mm Laminated, standard sizes, 6'8"

- **Values:** no differences (14 door rows, 4 sidelite rows).
- **Visual only:** FIR03 and 3DP links.
- **Footnotes:** the standard list from p5. `**` is on 22x15-1/4** and 22x17**, not explained.
- **Anomalies:** flat pricing (plausible, but noted):
  - 07x64 (x2) = 08x36 (x2) = 08x48 (x2) = $4,248;
  - sidelites 8x36 = 8x48 = 7x64 = $3,037.

  This page is the source of the p21 copy (see p21).

## Page 18: Sandblast 6mm Laminated, custom sizes, 6'8"

- **Values:** no differences. Direct Set runs from $2,746 to $4,706 in steps of $280.
- **Visual only:** styling only.
- **Footnotes:** the standard list from p5.
- **Anomalies:** none.

## Page 19: Sandblast with Clear Border, standard sizes, 6'8"

- **Values:** no differences (17 door rows, 4 sidelite rows).
- **Visual only:** FIR03 and 3DP links.
- **Footnotes:** the standard list from p5. `**` is on 22x15-1/4** and 22x17**, not explained.
- **Anomalies:** 22x09 = 22x10 ($3,217), which is plausible. This page is the source of p21's last 3 rows.

## Page 20: Sandblast with Clear Border, custom sizes, 6'8"

- **Values:** no differences: 28x64 $5,491, 28x80 $6,058, and Direct Set $2,456 through $3,212 in steps of $108.
- **Visual only:** styling only.
- **Footnotes:** the standard list from p5.
- **Anomalies:** none.

## Page 21: Sandblast with Clear Border 6mm Lami, standard sizes, 6'8"

- **Values:** no differences between the image and the text layer. I checked with a zoomed crop.
- **Visual only:** FIR03 and 3DP links. Nothing in the image flags, greys out or strikes through the bad rows; they look like normal rows.
- **Footnotes:** the standard list from p5. `**` is on 22x15-1/4** and 22x17**, not explained.
- **Anomalies: CONFIRMED from the image. The printed page carries copied rows.** The first price and all four derived columns match the source rows exactly:

  | p21 row (printed label) | p21 printed price | identical to |
  |---|---|---|
  | 22x09 (Oak 6-Panel) | $6,008 / $6,188 / $6,958 / $7,258 / $7,308 | p17 22x12 (x4) |
  | 22x09 (x4) | $6,833 / $7,013 / $7,783 / $8,083 / $8,133 | p17 22x12 (x5) |
  | 22x09 (x5) | $3,613 / $3,793 / $4,563 / $4,863 / $4,913 | p17 22x15-1/4** |
  | 22x10 | $4,093 / $4,273 / $5,043 / $5,343 / $5,393 | p17 22x17** |
  | 22x12 (x4) | $5,183 / $5,363 / $6,133 / $6,433 / $6,483 | p17 22x17 (x3) |
  | 22x48 | $3,510 / $3,690 / $4,460 / $4,760 / $4,810 | p19 22x48 |
  | 22x64 | $3,728 / $3,908 / $4,678 / $4,978 / $5,028 | p19 22x64 |
  | 22x80 | $4,110 / $4,290 / $5,060 / $5,360 / $5,410 | p19 22x80 |

  Resulting implausibilities on the printed page:
  - A single 22x09 lite ($6,008) costs more than 22x09 (x5) ($3,613).
  - 22x48, 22x64 and 22x80 ($3,510 / $3,728 / $4,110) are cheaper than 22x36 ($5,170) and priced exactly like the non-laminated p19.

  **Rows unique to p21:**
  - 07x64 $3,533
  - 07x64 (x2) / 08x36 (x2) / 08x48 (x2) $4,358
  - 08x80 $3,621
  - 22x15-1/4** $3,830
  - 22x17** $4,194
  - 22x17 (x3) $4,683
  - 22x36 $5,170
  - sidelites $3,108 (x3) and $3,218

  **Hypothesis (inference, not printed):** the unique values $3,830 / $4,194 / $4,683 / $5,170 appear to be p21's real **22x36 / 22x48 / 22x64 / 22x80** prices, shifted up 3 rows:
  - They sit exactly $74 / $100 / $135 / $170 above p17's 22x36 / 48 / 64 / 80 ($3,756 / $4,094 / $4,548 / $5,000).
  - That is the same clear-border premium seen from p13 to p19 ($92 / $101 / $129 / $179).
  - The layout fits a price column built on p17's 14-row size list (07x64 … 22x12 (x4), 22x12 (x5), 22x15-1/4, 22x17, 22x17 (x3), 22x36, 22x48, 22x64, 22x80). Rows 6-10 were never repriced (still p17 values). The label column was then replaced with p19's 17-row size list and p19's last 3 rows appended.
  - If this is right, p21's true prices for 22x09, 22x09 (x4), 22x09 (x5), 22x10, 22x12 (x4), 22x15-1/4**, 22x17** and 22x17 (x3) are **not present anywhere on the page**.

## Page 22: Sandblast with Clear Border 6mm Lami, custom sizes, 6'8"

- **Values:** no differences. Direct Set runs from $2,872 to $4,979 in steps of $301.
- **Visual only:** styling only. There is no 28x64 / 28x80 door table, unlike p20.
- **Footnotes:** the standard list from p5.
- **Anomalies:** none within the table.

## Page 23: OBSCURE, 6'8"

- **Values:** no differences (19 door rows, 4 sidelite rows).
  - The header glass list matches: Acid, Aqualite, Bronze, Chinchilla, Delta Frost, Fluid, Glue Chip, Grey, Listral, Masterline, Monumental, Niagara, Oceana, Pinhead, Rain, Reeded, Screen, Soft.
- **Visual only:** FIR03 and 3DP links.
- **Footnotes:** the standard list from p5. `**` is on 22x15-1/4** and 22x17**, not explained.
- **Anomalies:**
  - **22x36 = 22x09 = 22x10 = $3,502** (all columns). A 22x36 lite is about 4 times the glass of 22x09. On other pages 22x36 is $196-$225 above 22x09 (p13, p19). This is possibly a copy or error.
  - The header glass names differ slightly from the p24 chart: "Grey" vs "Super Grey", and "Reeded" vs "1/8" Reeded" / "1/2" Reeded".

## Page 24: OBSCURE Direct Glazed and Glass Size Chart

- **Values:** no differences. Direct Set runs from $2,451 to $3,207 in steps of $108.
  - The Glass Size Chart matches, including the source typos "Msterline" and "Maximium Sheet Size" (confirmed in a zoomed crop; both are printed like that).
  - Glue Chip is printed as `72" x 96 "` (stray space).
- **Visual only:** chart in yellow and teal styling; no links.
- **Footnotes (verbatim):**
  - "Jambs: Textured Composite (available in 4-5/8", 6-5/8", and *7-5/8").  *extra charges apply"
  - "Sill: Fixed - Mill (Clear Anodized)"
  - "Black Anodized Sill: +$20/box"
  - "7'0" System: +$275/box"
  - "8'0" System: +$375/box"
  - "NOTE: Glass types and sizes are based on current availability and may change without notice."
  - The Panels, Hinges, Standard Glass Frame and Woodgran lines are absent.
- **Anomalies:** none in prices.

## Page 25: Clear, Double Galzed: LowE, 6'8" (doors)

- **Values:** no differences (29 door rows).
- **Visual only:** FIR03 and 3DP links. "Double Galzed" is a typo in both the image and the text.
- **Footnotes:** the standard list from p5. `**` is on 22x15-1/4** and 22x17**, not explained.
- **Anomalies:**
  - Size labels **"2036", "2064", "2080"** are printed without the "x" (presumably 20x36 / 20x64 / 20x80). A parser expecting `NNxNN` will miss them.
  - 2036 ($3,155) is priced above 22x36 ($3,129), so the smaller glass costs more.
  - **22x17 (x3) $3,635 < 22x15 (x3) $3,782**: larger glass priced lower.
  - Half-Moon $3,094 is identical to p6 Group B Half-Moon (see p6).
  - 22x09 = 12x12 ($3,008) and 22x09 (x4) = 12x12 (x4) ($3,908) are flat pairs, plausibly intentional.
  - The Panel SIDELITE table is on p26.

## Page 26: Clear, Double Galzed: LowE (sidelites)

- **Values:** no differences. 4 sidelite rows; Direct Set runs from $2,133 to $2,889 in steps of $108. The text merges `Oak 3/4 Panel  $2,568`.
- **Visual only:** styling only.
- **Footnotes:** the standard list from p5.
- **Anomalies:** none.

## Page 27: Clear/LowE TRIPLE Glazed, 6'8"

- **Values:** no differences (13 door rows, 3 sidelite rows).
- **Visual only:** FIR03 and 3DP links.
- **Footnotes:** the standard list from p5. `**` is on 22x15-1/4** and 22x17**, not explained.
- **Anomalies:**
  - **22x36 = 22x15-1/4** Craftsman FIR03 = $3,263** (all columns): possibly a copy.
  - 08x80 $3,513 vs 08x36 (x2) / 08x48 (x2) $3,514 ($1 apart).
  - There are no 22x80, 28x64 or 28x80 door rows and no 8x80 sidelite (coverage gap).
  - Sidelites 8x36 = 8x48 = $2,573.

## Page 28: Clear/LowE 6mm Laminated, 6'8"

- **Values:** no differences (14 door rows, 4 sidelite rows, 8 Direct Set rows). The text merges `Oak 3/4 2-Panel  $4,460`.
- **Visual only:** FIR03 and 3DP links.
- **Footnotes:** the standard list from p5. `**` is on 22x15-1/4** and 22x17**, not explained.
- **Anomalies:**
  - **22x64 $3,500 and 22x80 $3,754 are cheaper than 22x36 $3,852 and 22x48 $4,460.**
    - They are only $186 and $300 above non-laminated Clear (p25: $3,314 / $3,454).
    - By contrast, 22x36 and 22x48 carry laminated premiums of $723 and $1,196.
  - **22x48 = 22x17** 3DP = $4,460** (identical row).
  - **22x17 (x3) = 22x12 (x4) = $5,044** (identical row).
  - The FIR03-to-3DP gap is $1,088, against about $480 elsewhere.
  - These look like copied or shifted rows.
  - Flat pricing: 07x64 (x2) = 08x36 (x2) = 08x48 (x2) = $3,876; sidelites 8x36 = 8x48 = 7x64 = $2,803.

## Page 29: Grills, Standard White 1/4" x 5/8", 6'8"

- **Values:** no differences (12 door rows, 3 sidelite rows, 8 Direct Set rows from $1,929 to $2,685 in steps of $108).
- **Visual only:** FIR03 and 3DP links. The TOC calls this "Internal Grills"; the header reads "Grills - Standard White 1/4" x 5/8" / includes: Standard patterns only".
- **Footnotes (verbatim):**
  - The standard list from p5, plus:
    - "Direct Glazed Glass: Tempered"
    - "Standard Grills: White with standard patterns (see brochure(s) for details)"
    - "Custom Grills: +$40/box"
  - `**` is on **22x14-7/16**** (Craftsman FIR03) and 22x17** (3DP), not explained.
- **Anomalies:** the FIR03 row is labelled **22x14-7/16**** here, while every other page pairs FIR03 with 22x15-1/4**. A label inconsistency: a lookup keyed on "22x15-1/4" will not find the Grills FIR03 price.
