# Visual audit: Palma Door Steel Entry Door Price Book 2024 (Interactive), pages 1-25

Source PDF: `C:\Users\offic\Downloads\Palma Door - Steel Entry Door Price Book 2024 [Interactive].pdf` (49 pages, 600x800 pt).
Text layer compared: `scratchpad\st_clean.txt` (pages 1-25).

## Method

- The Read tool could not render the PDF because poppler is not installed. I rendered every page 1-25 to PNG at 1800x2400 with the Windows built-in `Windows.Data.Pdf` API (`scratchpad\render_pdf.ps1`, output in `audit\img_1_25\pNN.png`). Small regions were zoomed with `scratchpad\crop.ps1`.
- I compared every price row by eye, all four price columns, against st_clean.txt.
- Mechanical cross-checks (`audit\check_1_25.py`, `audit\rawdiff_1_25.py`, `audit\links_1_25.py`):
  - Paint-column deltas for all 430 price rows. Every row matches one of three patterns: door +620/+850/+1030, panel sidelite +500/+690/+860, direct-glazed sidelite +230/+310/+370. **No row breaks the pattern.**
  - Token diff of the raw pypdf text layer against st_clean.txt. **All $ values and sizes are identical** on every page. The only content difference is noted under page 23.
  - Hyperlink annotations (internal and URL links) resolved to their target pages.

**Headline:** on pages 1-25 the extracted **values match the printed page exactly**. I found no price, size, panel name or glass-group letter where the image differs from st_clean.txt, and no hidden or overlapping text. Every problem below is in the **book itself**, or is a formatting or structural trap for a parser.

---

## Page 1: Cover
1. Value/label differences: none. Text is "STEEL DOORS 2024/2025 PRICE BOOK".
2. Visual-only: Palma Door Systems Inc. logo, and a cover photo of a black steel door with a 3/4 clear lite, SDL grille and a lower raised panel. No product name is printed on the photo. The logo is a link to page 2.
3. Footnotes: none.
4. Anomalies: none.
**No differences.**

## Page 2: Table of contents
1. Value/label differences: none. All entries and page numbers match.
2. Visual-only:
   - A yellow "NEW" badge before "Pull Bars" (the text layer has "NEW").
   - Footer "support: sales@palmadoor.com / resources: www.palmadoor.com". It is in the raw text layer but stripped from st_clean.txt on every page, which is harmless.
3. Fine print: "Effective: Jun 15, 2024 - Last Updated: Oct 21, 2025".
4. Anomalies and cross-references:
   - The ToC lists "Decorative Glass - Special Order ....... 9" and "Decorative Glass - Direct Glazed S/L ....... 10". The page 10 header actually reads **"Special Order - Direct Glazed S/L"**.
   - All ToC hyperlinks land on the printed page, with one exception outside my range: the "Pull Bars" label links to p42 but its page-number link goes to **p41**.

## Page 3: Novatech Decorative Glass Pricing Groups (part 1)
1. Value/label differences: **none**. Every name, type and group letter in st_clean.txt is on the correct row. The only defect is cell merging: "stained - welded  B" is one cell instead of two. The full list is in the table at the end of this file.
2. Visual-only:
   - Rows are colour-coded by group: green = A, blue = B, pink = C, salmon/orange = D.
   - Yellow "NEW in 2025" labels in the left margin (also in the text layer) on Distance, Echo, Luxe, Prism and Rubik.
   - Most glass names are hyperlinks to palmadoor.com/doorlites/... pages. Chinchilla, Masterline and Oso are not underlined and not linked. Distance, Echo, Luxe, Prism and Rubik are underlined but have no URL link.
   - **Group letters are internal links**: A goes to p5, B to p6, C to p7, D to p8. I checked all linked letters on pages 3-4 and each one lands on the page for its printed letter.
3. Footnotes: none on the page.
4. Anomalies:
   - Out of alphabetical order: Mystique is listed before Masterline.
   - Chinchilla, Fluid and Masterline (textured, group A) also appear in the OBSCURE glass list on page 21, which uses a different price table. Which price applies is ambiguous.

## Page 4: Novatech (part 2) and Trimlite Decorative Glass Pricing Groups
1. Value/label differences: **none**. The rows are aligned as in the image.
2. Visual-only:
   - Same colour coding as page 3. The **W rows (Pemberton, Verona) are shaded grey**.
   - "NEW in 2025" labels on Solstice and Zen.
   - Trimlite names link to palmadoor.com. Trimlite group letters, **including W, have no internal link**, whereas the Novatech letters do.
   - Online Glass Selector: a heading, the URL "palmadoor.com/glass-selector" in magenta, and a paragraph describing the web tool. Summary only, since it is marketing text. The two clickable areas around the paragraph link to a malformed URL, "http://https://www.palmadoor.com/glass-selector".
3. Footnotes: none.
4. Anomalies:
   - "Textile / silkscreen / B" is printed **twice** (duplicate row, same link).
   - Zen (NEW, D) is out of order, between Verso and Winchester.
   - Winchester's type is "decorative", the only row with that type.
   - The type for Pemberton and Verona is printed **"wrough iron"** (typo is in the image too).
   - **Verona and Pemberton both show group "W"**. No "Group W" price page exists on pages 1-25. The ToC and the page 5-8 notes only define groups A-D. Mapping W to the Wrought Iron page (p11) is an inference; the book does not state it.
   - Hyperlink slugs differ from the printed names: "Eastmount" links to `/doorlites/eastmont-trimlite` and "Granville" links to `/doorlites/graville-trimlite`. I cannot tell which spelling is correct.
   - The page 5-8 NOTE mentions "Verre Select brochures", but **no Verre Select glass is listed** on pages 3-4.
   - "Niagara" is a Trimlite stained-welded group B glass here, and "Niagara" is also in the OBSCURE glass list on pages 21-22. Same name, likely different products.

## Page 5: Decorative Glass - GROUP A (6'8")
1. Value/label differences: **none**. I checked 19 door rows and 3 sidelite rows.
2. Visual-only:
   - Yellow-shaded size column.
   - Panel names (6-Panel, 2-Panel BT, Soho, Victoria, Sydney, London, Orleans) are underlined links to panel pages.
   - Vertical side tabs "Steel Insulated Doors | Smooth PVC Frames | Composite Sills". In the text layer these bleed onto random rows, for example "22x12 (x5) ... | Smooth PVC Frames". A parser must ignore these trailing tokens.
   - The NOTE is printed in red.
3. Footnotes:
   - ** appears on 22x12** (Soho), 22x14-7/16** (Victoria) and 22x48** (Soho). The only explanation on the page is "Contemporary glass frame: +$80/doorlite (**included with Victoria and Soho panels)".
   - The single * is on jamb sizes "*5-1/4"" and "*7-5/8"", with "*extra charges apply". No amount is given.
   - NOTE (red): "Price Goups [sic] A, B, C and D include only items available in current Novatech, Trimlite and Verre Select brochures. / Any customization to the size or caming will be priced as "Special Order" on Page 10. / Special Order sidelites and doorlites will be ordered together, therefore both will be priced as Special Order."
   - Spec block:
     - Panels: Novatech Steel Insulated N600
     - Hinges: Ball Bearing Steel (Heavy-Duty Stainless Steel and Matte Black hinges +$60/door)
     - Jambs: Smooth Composite PVC (4-5/8", *5-1/4", 6-5/8", *7-5/8")
     - Sill: Fixed - Mill (Clear Anodized)
     - Black Anodized Sill: +$20/box
     - Standard Glass Frame: Colonial PVC
     - Contemporary glass frame: +$80/doorlite
     - 7'0" System: +$275/box
     - 8'0" System: +$375/box
4. Anomalies:
   - **Cross-reference error:** "Special Order ... on Page 10". The door Special Order table is on **page 9**; page 10 is "Special Order - Direct Glazed S/L". "Page 10" is underlined but is **not a hyperlink** (no link annotation at that spot).
   - Text-layer format: the Factory White and 1-Side prices share one cell ("$2,204  $2,824"). Values are correct, but a split on " | " gives 3 cells, not 4. The same applies to pages 6, 7, 8, 13, 15, 18, 21 and 25.

## Page 6: Decorative Glass - GROUP B
1. Value/label differences: **none**. I checked 22 door rows and 4 sidelite rows.
2. Visual-only: same as page 5.
3. Footnotes:
   - ** on 22x12** (Soho), 22x14-7/16** (Victoria), **22x15** (Victoria)** and 22x48** (Soho). Same explanation as page 5.
   - NOTE and spec block identical to page 5.
4. Anomalies:
   - Same "Page 10" cross-reference error as page 5.
   - **Group B "Half-Moon / 4-Panel BT" ($2,024 / $2,644 / $2,874 / $3,054) is identical to the Clear double-glazed "Half Moon" on page 23.** A decorative group B half-moon priced the same as clear looks copy-pasted. Group C Half-Moon is $2,313.
   - 22x10 Camber ($2,130) is priced below 22x09 6-Panel ($2,132). This may be intentional.

## Page 7: Decorative Glass - GROUP C
1. Value/label differences: **none**. I checked 16 door rows and 3 sidelite rows.
2. Visual-only: same as page 5. The header reads "includes: Stained Welded and Non Welded".
3. Footnotes: ** on 22x14-7/16** (Victoria) and 22x48** (Soho). NOTE and spec block identical to page 5.
4. Anomalies:
   - Same "Page 10" cross-reference error.
   - 22x10 Camber ($2,198) is below 22x09 6-Panel ($2,411).
   - There are no 22x12 rows, no 22x80 row and no 8x80 sidelite.

## Page 8: Decorative Glass - GROUP D
1. Value/label differences: **none**. I checked 12 door rows and 3 sidelite rows.
2. Visual-only: same as page 5.
3. Footnotes: ** on 22x14-7/16** and 22x48**. NOTE and spec block identical to page 5.
4. Anomalies:
   - Same "Page 10" cross-reference error.
   - **Group D is more expensive than Special Order (page 9) on 11 of the 12 door sizes both pages share.** Examples: 07x64 (x2) is D $4,334 vs Special Order $3,820; 22x14-7/16 (x4) is $6,242 vs $5,354; 22x64 is $4,021 vs $3,635. The sidelites 8x48 and 7x64 follow the same pattern.
   - Because the NOTE says any customisation is priced as "Special Order", a customised group D unit would come out cheaper than a stock one. Worth confirming with the supplier.

## Page 9: Decorative Glass - Special Order ("includes: Stained Welded ONLY")
1. Value/label differences: **none**. I checked 24 door rows and 4 sidelite rows.
2. Visual-only:
   - This page has **no support/resources footer**, only the page number.
   - Text-layer format: for the 28x rows the Panel and Factory White cells are merged, e.g. "up to 42" Flush  $6,077". The header "Factory White  1 Side" and "2 Sides 1 Colour  2" are also merged. Values are correct, but a parser that splits columns could misassign the Factory White price.
3. Footnotes:
   - ** on 22x12** (Soho), 22x14-7/16** (Victoria) and 22x48** (Soho).
   - NOTE: "Special Order sidelites and doorlites will be ordered together, therefore both will be priced as Special Order."
   - Spec block identical to page 5, including 7'0"/8'0".
4. Anomalies: Special Order is cheaper than group D (see page 8). The internal row ordering looks plausible.

## Page 10: Special Order - Direct Glazed S/L ("includes: Stained Welded ONLY")
1. Value/label differences: **none**. I checked all 8 frame-size rows.
2. Visual-only:
   - No footer.
   - A wide yellow frame-size column. The "Factory White" header label sits over the right edge of the frame-size column, but the values are in the next column. The text layer maps them correctly.
3. Footnotes:
   - Jambs line with the * note.
   - "Sill: Fixed - Mill (Clear Anodized)"
   - "Black Anodized Sill: +$20/box"
   - "Direct Glazed Glass: Tempered"
   - No 7'0"/8'0" System lines on this page, and no Panels, Hinges or glass-frame lines.
4. Anomalies:
   - The price step is +$216 per 2" frame bracket.
   - This page is the one the page 5-8 notes point to ("Page 10"), but it only covers direct-glazed sidelites.

## Page 11: Wrought Iron
1. Value/label differences: **none**. I checked 7 door, 4 panel-sidelite and 8 direct-glazed rows.
2. Visual-only: side tabs and panel links, as on page 5.
3. Footnotes: ** on 22x48** (Soho) only. Spec block as page 5 plus "Direct Glazed Glass: Tempered".
4. Anomalies:
   - The page does not list which glass names it covers, and does not say "Group W".
   - 22x17 Sydney ($3,201) is priced above 22x36 London ($3,171) and near 22x48 Orleans ($3,185).
   - Direct-glazed prices equal page 10 + $45 on every row (step +$216).

## Page 12: Laser-Cut Iron
1. Value/label differences: **none**. I checked 5 door, 4 panel-sidelite and 8 direct-glazed rows.
2. Visual-only: as page 11.
3. Footnotes: ** on 22x48** only. Spec block as page 11.
4. Anomalies: the direct-glazed step is +$260, different from every other page. This may be intentional.

## Page 13: Sandblast ("Standard sizes ONLY", "(custom sizes on the next page)")
1. Value/label differences: **none**. I checked 21 door rows and 4 sidelite rows.
2. Visual-only: as page 5.
3. Footnotes: ** on 22x14-7/16** (Victoria) and 22x48** (Soho). **The 22x12 Soho row has no ** here**, although the frame note says Soho includes the contemporary frame. The same happens on pages 15, 17, 18 and 20. Spec block as page 5.
4. Anomalies:
   - 22x17 (x4) = 22x14-7/16 (x4) = $3,630. This looks like per-lite pricing and is probably intentional.
   - 22x48 Orleans ($2,309) is below 22x36 London ($2,340).
   - The "next page" cross-reference is correct (page 14).

## Page 14: Sandblast ("includes: Custom Sizes")
1. Value/label differences: **none**. I checked 8 door rows (28x, "up to 42" Flush") and 8 direct-glazed rows.
2. Visual-only: as page 5.
3. Footnotes: the full spec block after the door table (** explanation present, but no ** rows), and a DG spec block including "Direct Glazed Glass: Tempered".
4. Anomalies: none. The direct-glazed step is +$108.

## Page 15: Sandblast TRIPLE Glazed (standard sizes)
1. Value/label differences: **none**. I checked 17 door rows and 4 sidelite rows.
2. Visual-only: as page 5.
3. Footnotes: ** on 22x14-7/16** and 22x48**. **22x12 Soho has no **.**
4. Anomalies: 22x17 (x4) = 22x14-7/16 (x4) = $3,942, the same per-lite pattern as page 13.

## Page 16: Sandblast TRIPLE Glazed ("includes: Custom Sizes")
1. Value/label differences: values match st_clean.txt. The **printed header is wrong**:
   - The table is headed **"DOOR / Glass Sizes / Panel / Factory White / Paint 1 Side / 2 Sides 1 Colour / 2 Sides 2 Colours"**, which is 6 labels.
   - The rows are **direct-glazed sidelite frame sizes** (5.5"-13.5" ... up to 27.5") with only **4** prices.
   - Visually, "Panel" sits over the $2,262 column and "Factory White" over the $2,492 column.
   - The deltas (+230/+310/+370) and the page's own "Direct Glazed Glass: Tempered" line show the columns are really FW / 1 Side / 2S1C / 2S2C, and that this is a **DG sidelite table, not a door table**.
   - A parser keyed on the "DOOR" header or on header positions would mis-assign it.
2. Visual-only: the header/column misalignment described above.
3. Footnotes:
   - Jambs line with the * note.
   - "Sill: Fixed - Mill (Clear Anodized)"
   - "Black Anodized Sill: +$20/box"
   - "Direct Glazed Glass: Tempered"
   - 7'0" System: +$275/box and 8'0" System: +$375/box
4. Anomalies:
   - **No custom-size door pricing exists for Triple Glazed.** Page 15's "custom sizes on the next page" leads only to DG sidelites.
   - All 8 rows (FW $2,262 ... $3,018, step $108) are **identical to the page 17 "Sandblast 6mm Laminated" DG sidelite table**. This is a possible copy-paste.

## Page 17: Sandblast 6mm Laminated ("Standard sizes ONLY", "(custom sizes on the next page)")
1. Value/label differences: **none**. I checked 18 door, 4 panel-sidelite and 8 direct-glazed rows.
2. Visual-only: as page 5.
3. Footnotes: ** on 22x14-7/16** and 22x48**. **22x12 Soho has no **.** Spec block as page 11.
4. Anomalies:
   - **Broken cross-reference:** "(custom sizes on the next page)" points to page 18, which is "Sandblast with Clear Border" standard sizes. **There is no 6mm Laminated custom-size page.**
   - The pricing is internally consistent per lite: every (x4) row is $4,838, every (x5) is $5,663 and (x6) is $6,488 (steps of $825). 22x12 Soho equals 22x14-7/16 Victoria at $2,633.
   - Sidelites 8x36 London and 8x48 Orleans are identical ($2,282), and 7x64 ($2,187) is cheaper than 8x36.
   - The DG table is identical to page 16.
   - This page is the baseline for page 20.

## Page 18: Sandblast with Clear Border (standard sizes)
1. Value/label differences: **none**. I checked 20 door rows and 4 sidelite rows.
2. Visual-only: as page 5.
3. Footnotes: ** on 22x14-7/16** and 22x48**. **22x12 Soho has no **.**
4. Anomalies:
   - None internally.
   - Premium over page 13 (Sandblast): 07x64 +$90, 08x80 +$114, 22x36 +$92, 22x48 +$101, 22x48** +$101, 22x64 +$129, 22x80 +$179. Used as a reference for page 20.
   - The "next page" cross-reference is correct.

## Page 19: Sandblast with Clear Border ("includes: Custom Sizes")
1. Value/label differences: **none**. I checked 5 door rows (28x) and 8 direct-glazed rows.
2. Visual-only: as page 5.
3. Footnotes: full spec block (no ** rows) and DG spec block.
4. Anomalies: none. The direct-glazed step is +$108.

## Page 20: Sandblast with Clear Border 6mm Lami ("Standard sizes ONLY", "(custom sizes on the next page)")
1. Value/label differences: **none**. The text layer reproduces the printed page exactly: all 18 door, 4 panel-sidelite and 8 direct-glazed rows, all four columns. The suspect values are **printed in the book**; this is not an extraction shift.
2. Visual-only: as page 5. There are no greyed or struck-through cells and no hidden text. The raw text layer and the image agree.
3. Footnotes: ** on 22x14-7/16** and 22x48**. **22x12 Soho has no **.** Spec block as page 11.
4. Anomalies (**confirmed from the image**):
   - **Door rows 22x3.5 (x4) through 22x14-7/16** are page 17's rows 22x12 through 22x17 (x3), shifted up 3 rows:

     | Page 20 row | Printed FW on p20 | Same FW on p17 row | p17's own value for this size |
     |---|---|---|---|
     | 22x3.5 (x4) | $2,633 | 22x12 Soho | $4,838 |
     | 22x3.5 (x5) | $4,838 | 22x12 (x4) | $5,663 |
     | 22x3.5 (x6) | $5,663 | 22x12 (x5) | $6,488 |
     | 22x12 Soho | $2,633 | 22x14-7/16 Victoria | $2,633 |
     | 22x12 (x4) | $4,838 | 22x14-7/16 (x4) | $4,838 |
     | 22x12 (x5) | **$2,553** | 22x17 Sydney | $5,663 |
     | 22x14-7/16** Victoria | **$4,013** | 22x17 (x3) | $2,633 |

     All four paint columns shift with the FW value, because each row is internally consistent.
   - The result is impossible pricing: a 4-lite door at $2,633 is cheaper than 22x12 (x4) at $4,838, and 22x12 (x5) at $2,553 is cheaper than 22x12 (x4).
   - **Rows 22x14-7/16 (x4) through 22x36** carry new values: $2,820 / $3,094 / $3,294 / $3,513 / $4,000.
     - **Inference (not printed):** these look like the true Clear-Border-Lami prices for **22x36 London / 22x48 Orleans / 22x48** Soho / 22x64 / 22x80**, shifted up 4 rows.
     - Evidence: $3,294 - $3,094 = $200, which matches the book-wide rule "22x48 Soho = 22x48 Orleans + $200" (holds on all 15 pages in my range that print both rows: 5, 6, 7, 8, 9, 11, 12, 13, 15, 17, 18, 20, 21, 23, 25).
     - Evidence: against page 17 they give premiums of +$74 / +$100 / +$100 / +$135 / +$170. These closely match the Clear Border vs Sandblast premiums (page 18 vs 13): +$92 / +$101 / +$101 / +$129 / +$179.
   - **Rows 22x48, 22x48**, 22x64 and 22x80 are identical to page 17** ($2,994 / $3,194 / $3,378 / $3,830). A Clear-Border Lami unit priced the same as plain Sandblast Lami is implausible; every other row carries a premium, e.g. 07x64 +$55 and 08x80 +$62.
   - Consequence: the correct Clear-Border-Lami prices for 22x3.5 (x4/x5/x6), 22x12, 22x12 (x4/x5), 22x14-7/16 Victoria, 22x14-7/16 (x4), 22x17, 22x17 (x3) and 22x17 (x4) **cannot be recovered from the book**. The 22x48-22x80 rows are also suspect.
   - **Direct-glazed table:** it starts at $2,707 with a **+$301 step** per bracket, up to $4,814 at 27.5". Every other Sandblast, Obscure and Clear DG table (pages 14, 16, 17, 19, 22, 24) steps +$108. At 27.5" this is $1,796 more than page 17. Suspect.
   - **Sidelites:** 8x36 and 8x48 are identical ($2,353). The 8x80 sidelite ($2,356 / $2,856 / $3,046 / $3,216) is **identical to page 18's 8x80 sidelite**; the others are page 17 + $71, while 8x80 is page 17 + $66. Possible copy; low confidence.
   - **Broken cross-reference:** "(custom sizes on the next page)" points to page 21, which is OBSCURE. There is no Clear-Border-Lami custom page.

## Page 21: OBSCURE (Acid, Aqualite, Bronze, Chinchilla, Delta Frost, Fluid, Glue Chip, Super Grey, Listral, Masterline, Monumental, Niagara, Oceana, Pinhead, Rain, Reeded, Screen, Soft)
1. Value/label differences: **none**. I checked 25 door rows and 4 sidelite rows. The 28x rows have Panel "42" Flush" (no "up to"), as printed.
2. Visual-only: as page 5. In the frame note, "Soho" is not underlined (only Victoria is), a cosmetic difference.
3. Footnotes: ** on 22x12** (Soho), 22x14-7/16** (Victoria) and 22x48** (Soho). Spec block as page 5.
4. Anomalies:
   - 22x10 6-Panel is identical to 22x09 6-Panel ($2,362 on every column).
   - 22x36 London ($2,492) is priced below 22x17 Sydney ($2,563).
   - The glass list overlaps page 3-4 group-A textured names (Chinchilla, Fluid, Masterline, Soft) and the Trimlite name Niagara. The book does not say which table applies.

## Page 22: OBSCURE: Direct Glazed S/L and Glass Size Chart
1. Value/label differences: **none**. I checked 8 direct-glazed rows and 19 glass-size rows.
2. Visual-only: the chart header reads "Maximium Sheet Size" (typo is in the image).
3. Footnotes:
   - DG spec block: Jambs line with the * note; "Sill: Fixed - Mill (Clear Anodized)"; "Black Anodized Sill: +$20/box"; "Direct Glazed Glass: Tempered"; 7'0" +$275/box and 8'0" +$375/box.
   - "NOTE: Glass types and sizes are based on current availability and may change without notice."
   - **"SL" suffix** on Fluid "62" x 78" SL" and Masterline "32" x 82" SL". It is **not explained anywhere** on the page.
4. Anomalies: none in the prices (step +$108).

## Page 23: Clear, Double Glazed: LowE
1. Value/label differences: **none** in values. I checked 36 door rows.
2. Visual-only / text-layer gap:
   - **"7'0" System: +$275/box" is printed** (and is in the raw PDF text layer) but is **missing from st_clean.txt** for page 23.
   - The spec block runs into the footer area, and the "support: sales@palmadoor.com" part of the footer is absent on this page.
   - The 28x rows have the same Panel+FW merged cell as page 9.
3. Footnotes:
   - ** on 22x12** (Soho), "22x14-7/16 **" (Victoria, with a space before **) and 22x48** (Soho).
   - Spec block: Panels; Hinges +$60/door; **"Glass: Double Glazed, LowE"**; Jambs with the * note; Sill; **"Black Anodized Sill: +$20/unit"** (every other page says "/box"); Standard Glass Frame; Contemporary frame +$80/doorlite (**incl. Victoria and Soho); 7'0" +$275/box; 8'0" +$375/box.
4. Anomalies:
   - "Half Moon / 4-Panel BT" is identical to group B Half-Moon on page 6.
   - 12x12 (x4) = 22x09 (x4) = $2,738.
   - The page has sizes seen nowhere else in my range: 14x64 "24" Flush", 18x42 Oval, 2036/2064/2080, 12x12 single.

## Page 24: Clear, Double Glazed: LowE (sidelites)
1. Value/label differences: **none**. I checked 4 panel-sidelite and 8 direct-glazed rows.
2. Visual-only: as page 5.
3. Footnotes:
   - Sidelite block: Panels, Jambs with the * note, Sill, Black Anodized Sill +$20/box, Standard Glass Frame, Contemporary frame note with **, and 7'0"/8'0". There is no Hinges line.
   - DG block as page 22.
4. Anomalies: none (DG step +$108).

## Page 25: Clear, TRIPLE Glazed: Dual LowE
1. Value/label differences: **none**. I checked 21 door rows and 3 sidelite rows.
2. Visual-only: as page 5.
3. Footnotes: ** on 22x12** (Soho), "22x14-7/16 **" (Victoria) and 22x48** (Soho). Spec block as page 5 **plus "Direct Glazed Glass: Tempered"**.
4. Anomalies:
   - The "Direct Glazed Glass: Tempered" line is **orphaned**: there is no DG sidelite table for Clear Triple Glazed, no 8x80 sidelite and no 22x80 door.

---

## Cross-cutting summary

- **Extraction accuracy:** pages 1-25 of st_clean.txt match the images on every price, size, panel and group letter. The only omission is page 23's "7'0" System: +$275/box" line.
- **Parser traps in the text layer:**
  - Factory White and 1-Side prices merged into one cell (pages 5-8, 13, 15, 18, 21, 25).
  - Panel and Factory White merged on the 28x rows (pages 9, 23).
  - Side-tab text ("Smooth PVC Frames", "Composite Sills", "Steel Insulated Doors") appended to data rows.
  - Page 16's DG sidelite table is labelled "DOOR" with 6 header labels over 4 prices.
  - "22x14-7/16 **" has a space before ** on pages 23 and 25.
- **Double asterisk:** every ** row is a Victoria or Soho panel. The only explanation anywhere is "(**included with Victoria and Soho panels)" on the contemporary glass frame line. 22x12 Soho carries no ** on pages 13, 15, 17, 18 and 20 but does on pages 5, 6, 9, 21, 23 and 25.
- **Single asterisk:** jamb sizes 5-1/4" and 7-5/8" carry "*extra charges apply". No amount is given on pages 1-25.
- **Cross-reference errors:**
  - Pages 5-8 say "Special Order on Page 10"; the door Special Order is on page 9.
  - Page 17 "custom sizes on the next page" has no target.
  - Page 20 "custom sizes on the next page" has no target.
- **Book defects (confirmed printed, not extraction):**
  - Page 20's shifted and duplicated door rows.
  - Page 20's +$301 DG step.
  - Page 16's mislabelled table, and its DG table identical to page 17.
  - Group B Half-Moon identical to Clear Half Moon.
  - Group D priced above Special Order on most sizes.
  - Page 23 "+$20/unit" vs "/box" elsewhere.
  - Page 4 duplicate Textile row.

---

## Pages 3-4: decorative glass pricing groups (as printed; row order preserved)

Row colour: A = green, B = blue, C = pink, D = salmon, W = grey. "Linked" means the group letter is an internal hyperlink to that group's page (A = p5, B = p6, C = p7, D = p8).

| # | Page | Brand | Glass name | Glass type (as printed) | Group | NEW marker |
|---|---|---|---|---|---|---|
| 1 | 3 | Novatech | Allure | stained - welded | B | |
| 2 | 3 | Novatech | Alys | v-groove | B | |
| 3 | 3 | Novatech | Arima | stained - welded | C | |
| 4 | 3 | Novatech | Attraction | stained - welded | D | |
| 5 | 3 | Novatech | Avenue | stained - welded | C | |
| 6 | 3 | Novatech | Azur | silkscreen | B | |
| 7 | 3 | Novatech | Balance | silkscreen | B | |
| 8 | 3 | Novatech | Belmont | stained - welded | C | |
| 9 | 3 | Novatech | Bistro | stained - welded | C | |
| 10 | 3 | Novatech | Bolero | stained - welded | C | |
| 11 | 3 | Novatech | Cachet | stained - welded | C | |
| 12 | 3 | Novatech | Cathedrale | stained - welded | C | |
| 13 | 3 | Novatech | Celeste | stained - welded | B | |
| 14 | 3 | Novatech | Chanelle | stained - welded | D | |
| 15 | 3 | Novatech | Chinchilla | textured | A | |
| 16 | 3 | Novatech | Crystal | stained - welded | B | |
| 17 | 3 | Novatech | Distinction | v-groove | A | |
| 18 | 3 | Novatech | Distance | v-groove | A | NEW in 2025 |
| 19 | 3 | Novatech | Echo | silkscreen | B | NEW in 2025 |
| 20 | 3 | Novatech | Edge | sandblast | A | |
| 21 | 3 | Novatech | Emori | v-groove | B | |
| 22 | 3 | Novatech | Equation | silkscreen | A | |
| 23 | 3 | Novatech | Evangeline II | stained - welded | C | |
| 24 | 3 | Novatech | Fluid | textured | A | |
| 25 | 3 | Novatech | Kallima | stained - welded | D | |
| 26 | 3 | Novatech | Kira | silkscreen | B | |
| 27 | 3 | Novatech | Liano | stained - welded | C | |
| 28 | 3 | Novatech | Louisbourg | silkscreen | A | |
| 29 | 3 | Novatech | Luxe | stained - welded | B | NEW in 2025 |
| 30 | 3 | Novatech | Mist | silkscreen | B | |
| 31 | 3 | Novatech | Mistral | stained - welded | D | |
| 32 | 3 | Novatech | Mystique | stained - welded | B | |
| 33 | 3 | Novatech | Masterline | textured | A | |
| 34 | 3 | Novatech | Nobel | stained - welded | C | |
| 35 | 3 | Novatech | Nuando | silkscreen | A | |
| 36 | 3 | Novatech | Opal | stained - welded | C | |
| 37 | 3 | Novatech | Ophir | stained - welded | C | |
| 38 | 3 | Novatech | Oso | silkscreen | A | |
| 39 | 3 | Novatech | Portrait | stained - welded | C | |
| 40 | 3 | Novatech | Prism | stained - welded | C | NEW in 2025 |
| 41 | 3 | Novatech | Pure | silkscreen | A | |
| 42 | 3 | Novatech | Rhythm | v-groove | A | |
| 43 | 3 | Novatech | Rubik | stained - welded | B | NEW in 2025 |
| 44 | 4 | Novatech | Satin | textured | A | |
| 45 | 4 | Novatech | Side | silkscreen | A | |
| 46 | 4 | Novatech | Soft | textured | A | |
| 47 | 4 | Novatech | Solstice | silkscreen | B | NEW in 2025 |
| 48 | 4 | Novatech | Textile | silkscreen | B | |
| 49 | 4 | Novatech | Textile (duplicate row) | silkscreen | B | |
| 50 | 4 | Novatech | Transit | silkscreen | A | |
| 51 | 4 | Novatech | Verso | v-groove | A | |
| 52 | 4 | Novatech | Zen | stained - welded | D | NEW in 2025 |
| 53 | 4 | Novatech | Winchester | decorative | B | |
| 54 | 4 | Novatech | Zenith | v-groove | B | |
| 55 | 4 | Trimlite | Adelaide | stained - welded | B | |
| 56 | 4 | Trimlite | Artisan | stained - welded | B | |
| 57 | 4 | Trimlite | Canterbury | stained - welded | C | |
| 58 | 4 | Trimlite | Eastmount (link slug "eastmont") | stained - welded | B | |
| 59 | 4 | Trimlite | Everton | stained - welded | B | |
| 60 | 4 | Trimlite | Granville (link slug "graville") | stained - welded | A | |
| 61 | 4 | Trimlite | Harlow | stained - welded | A | |
| 62 | 4 | Trimlite | Hollister | stained - welded | A | |
| 63 | 4 | Trimlite | Lexington | stained - welded | B | |
| 64 | 4 | Trimlite | Lonsdale | sandblast | B | |
| 65 | 4 | Trimlite | Manhattan | stained - welded | B | |
| 66 | 4 | Trimlite | Modena | stained - welded | A | |
| 67 | 4 | Trimlite | Niagara | stained - welded | B | |
| 68 | 4 | Trimlite | Pemberton | wrough iron [sic] | **W** | |
| 69 | 4 | Trimlite | Riverton | v-groove | A | |
| 70 | 4 | Trimlite | Royston | stained - welded | B | |
| 71 | 4 | Trimlite | Sullivan | sandblast | A | |
| 72 | 4 | Trimlite | Verona | wrough iron [sic] | **W** | |
| 73 | 4 | Trimlite | Waterton | stained - welded | B | |
| 74 | 4 | Trimlite | Winslow | stained - welded | B | |

**Totals:** 74 printed rows. Novatech has 54 rows (53 unique names, Textile duplicated). Trimlite has 20. There are 7 NEW in 2025 markers, all Novatech: Distance, Echo, Luxe, Prism, Rubik, Solstice and Zen. Verre Select has no rows.

**Novatech group-letter links:** every letter that has a link lands on the page for its printed group. These letters have no link: Chinchilla, Fluid, Masterline, Satin and Soft.

**Verona and Pemberton (Trimlite, "wrough iron") both show group W.** The book defines no Group W page. W is not a hyperlink, unlike the Novatech letters. The nearest pricing is the "Wrought Iron" page (p11); that mapping is an inference.
