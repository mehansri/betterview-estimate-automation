# Visual audit: Fiberglass Entry Door Price Book 2024 [Interactive], pages 30-58

Source: `C:\Users\offic\Downloads\Fiberglass Entry Door Price Book 2024 [Interactive].pdf` (58 pages, 600x800 pt; TOC footer: "Effective: Jun 15, 2024 - Last Updated: Oct 21, 2025").
Compared against: `scratchpad\fg_clean.txt` (=== PAGE n === blocks).

## Method

- The Read tool could not render the PDF because `pdftoppm` is not installed. I rendered every page 30-58 at 2x (144 dpi) with pdf.js 3.11.174 in headless Chrome, and rendered close-ups at 4-5x where needed (p30 size column, p44 diagram, p45 footnote). The helper files are in `scratchpad\render\` (a copy of the PDF, `viewer.html`, `shoot.mjs`, and `png\p30..p58.png`). No project files were touched.
- I checked every price and label in each image against the text layer, cell by cell.
- I parsed the PDF operator list (pdf.js) to check painting order, fill colours and opacity. This showed which text is covered by opaque fills painted later. Only pp. 47-50 have covered (hidden) text that holds values. The other hits were header labels that are visible in the image, so they are false positives of the heuristic.
- I read the link annotations with pypdf, including the TOC links on page 2 that point into this range.
- The PDF has no Optional Content (layers), no form fields and no hidden annotations. All links are plain /Link annotations.

## Global findings (apply to many pages)

- **Side-tab bleed.** The vertical margin tabs "Fiberglass Doors | Textured Composite Frames | Composite Sills" are real text. In the text layer they get appended to table rows, for example p30 `28x64 ... $6,615 | Textured Composite Frames` and p36 Edge 22x36 row `... $5,143 | Composite Sills`. They are not row data.
- **Footer links.**
  - The support mailto link on every page has subject "From: Steel Entry Door Price Book 2023", copied from the steel book.
  - The logo (top left) links to p2, which is the TOC.
- **Cross-reference error on pp. 30, 31, 32, 33, 34, 35, 38.** "For applicable fiberglass panel upcharges refer to pages 30 - 32." The panel upcharges are actually on **pp. 39-42**. The underlined "pages 30 - 32" is a link to a named destination that resolves to **PDF page 40**, which only has the Plastpro continuation, not p39 where the main 6'8" upcharge table starts.
- **Jamb inconsistency.** The notes on pp. 30-38 say "Jambs: Textured Composite (available in 4-5/8", 6-5/8", and *7-5/8"). *extra charges apply". Page 44 also sells a **5-5/8" jamb (+$60/box, "available in smooth ONLY")**, which is neither in that list nor textured. Page 45 screens footnote refers to a **7-1/4" jamb**, which exists nowhere else in this book.
- **TOC (page 2) problems for this range.** Page 2 is outside my range, but its links target these pages.
  - "6'8" Solid Fiberglass Doors ..... 39-40": both the label link and the number link go to **p40**, not p39.
  - "Decorative Accessories ..... 51" and "Decorative Accents ..... 51": both sections are actually on **p52**. The Accents label and number links go to p51. The Accessories label link goes to p51, but its number link goes to p52.
  - "Standard Stain Colours ..... 56-57": the section actually runs **56-58** (p58 has 4 more stains).
  - "Operating Sidelite(s)" (p44) and "Glass Options" (p45) are not in the TOC.
  - All other TOC page numbers for 30-58 are correct: 30, 31, 32, 33-35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47-48, 49-50, 51, 53-55.
- **Pages 39-42 and 52 have NO product photos or drawings.**
  - The images show only tables.
  - The PDF resources for these pages have no image XObjects. The only Form XObjects are the header, footer and side tabs.
  - Pages that do have images are 44 (4 renders), 46 (Tedee photos), 47-50 (door renders) and 56-58 (stain swatches). Pages 53-54 use vector colour swatches.

---

## Page 30 - SDLs on Clear Glass (6'8"), "Standard with 7/8" shadow bar between glass"

1. **Value/label differences.** None: all 9 door, 4 sidelite and 8 direct-set rows × 5 prices match the image.
   - Text-layer artifacts (values are correct): `Craftsman FIR03  $3,753` and `Oak 3/4 2-Panel  $3,935` are missing a column separator between panel and price.
   - The first row size is printed **"764"** in both the image and the text. Every other page uses "07x64", so this is likely a typo for 7x64.
2. **Visual-only content.**
   - "Craftsman FIR03" and "Craftsman 3DP" are underlined links to palmadoor.com/door-panels/3-panel-fir-craftsman-shaker-fir03 and .../fir-shaker-craftsman-3dp.
   - Size column cells have a yellow background. Otherwise no icons.
3. **Footnotes and fine print** (verbatim):
   - "+ $90/square | + $90/square | + $100/square | + $100/square | + $100/square" under each of the 3 tables, aligned to the 5 price columns (Paint 1c, Paint 2c, Stain 1c, Stain 2c, Stain-Out/Paint-In).
   - "Panels: Fiberglass as listed. For applicable fiberglass panel upcharges refer to pages 30 - 32."
   - "Hinges: Ball Bearing Steel (Heavy-Duty Stainless Steel and Matte Black hinges +$60/door)."
   - "Jambs: Textured Composite (available in 4-5/8", 6-5/8", and *7-5/8"). *extra charges apply"
   - "Sill: Fixed - Mill (Clear Anodized)"
   - "Black Anodized Sill: +$20/box"
   - "Standard Glass Frame: Textured Colonial PVC"
   - "Contemporary Woodgran glass frame: +$80/doorlite (included with Shaker Craftsman panels)"
   - "7'0" System: +$275/box"
   - "8'0" System: +$375/box"
   - "White SDL: +80/square"
   - "Painted SDL: +90/square"
   - "Stained SDL: +100/square"
   - **Orphan asterisks:** "22x15-1/4**" and "22x17**" carry "**", but there is no "**" footnote anywhere on the page. The only asterisk note is the jamb "*".
6. **Anomalies.**
   - Wrong cross-reference "pages 30 - 32" (see Global findings).
   - Orphan "**".
   - Size "764".

## Page 31 - SDLs on Obscure Glass (6'8"), "Standard triple glazed with lead tape"

1. **Value/label differences.** None: all values match. It has the same `Craftsman FIR03  $3,804` separator artifact and the same "764" size label as p30.
2. **Visual-only content.** The same FIR03 and 3DP links as p30.
3. **Footnotes and fine print.** Identical to p30, including the "+ $90/square ... + $100/square" lines and the orphan "**" on 22x15-1/4 and 22x17.
6. **Anomalies.**
   - **Direct Set up to 27.5" = $3,290 / $3,350 / $3,480 / $3,530 / $3,590, which is identical to the "up to 25.5"" row.** Every other row steps +$108 (see p30). Every p31 row is p30 + $177, except 27.5", which would be expected at $3,398 / $3,458 / $3,588 / $3,638 / $3,698. This looks like a copy-paste error.
   - Wrong cross-reference "pages 30 - 32".

## Page 32 - Internal Blinds (6'8"), "functionality: Raise, Lower & Tilt"

1. **Value/label differences.** None: 7 door and 3 sidelite rows match.
2. **Visual-only content.** None. There are no per-square lines under the tables.
3. **Footnotes and fine print.** The same Panels / Hinges / Jambs / Sill / Black Anodized Sill / Standard Glass Frame / Contemporary Woodgran / 7'0" / 8'0" lines as p30. There are no SDL lines.
6. **Anomalies.**
   - Low severity: 20x64 and 22x64 have identical prices ($3,617 / $3,797 / $4,567 / $4,867 / $4,917), and 20x80 and 22x80 are identical ($4,076 ...). This may be intentional.
   - Wrong cross-reference "pages 30 - 32" (it links to p40).

## Page 33 - SOLUTION SERIES: Clear/LowE (6'8")

1. **Value/label differences.** None: all 17 door rows and the 7x64 sidelite ($2,781 / $2,951 / $3,591 / $3,791 / $3,871) match.
   - Labels "22x08 or (x4)" and "22x08 or (x5)" are printed exactly so in the image. They look like an incomplete label, probably meant "22x08 or 22x10", yet 22x10 has its own rows.
   - The text layer shows the diagram captions as "O set": the "ff" ligature was lost, and the image reads "Offset".
2. **Visual-only content.** There is a row of 9 lite-layout drawings (white door outline with blue-gradient glass). Captions:
   - "7"x 64" - Offset": one tall narrow lite, offset to the lock side.
   - "8"x 6"(x5) - Offset": 5 small square lites in a vertical column, offset.
   - "8"x 8"(x4)": 4 square lites, centred column.
   - "22"x 3.5"(x6)": 6 horizontal slot lites.
   - "22"x 8"/10"(x4)": 4 horizontal rectangular lites.
   - "22"x 17"": 3 large lites stacked.
   - "22"x 15.25"": 1 lite at the top.
   - "22"x 15.25  ", 3 Lite": 1 top lite divided into 3 vertical panes.
   - "22"x 15.25", 6-Lite": top lite divided 3×2.
   - The drawings show only one lite count per size family (x5 for 8x6, x4 for 8x8, x6 for 22x3.5, x4 for 22x8/10), while the table prices x4-x7 variants.
   - The 22x15 rows' "Craftsman FIR03" is underlined and links to the FIR03 panel page (3 links).
3. **Footnotes and fine print.**
   - Panels / Hinges / Jambs / Sill / Black Anodized Sill / 7'0" System +$275/box / 8'0" System +$375/box, as on p30.
   - No Standard Glass Frame or Woodgran lines.
   - "SOLUTION SERIES glass frames: • Shaker style low profile. • No screws, plugs, or holes. • Textured vertical grain pattern."
6. **Anomalies.**
   - Wrong cross-reference "pages 30 - 32".
   - The "22x08 or" label.

## Page 34 - SOLUTION SERIES: Sandblast, Mistlite, Narrow Reed, Rain, Sable (6'8")

1. **Value/label differences.** None: all 17 door rows and the 7x64 sidelite ($3,008 / $3,178 / $3,818 / $4,018 / $4,098) match.
2. **Visual-only content.** The same 9 lite-layout drawings and captions as p33, and the same FIR03 links.
3. **Footnotes and fine print.** Identical to p33.
6. **Anomalies.**
   - This obscure/decorative glass page is **cheaper than Clear/LowE (p33)** for several sizes:
     - 08x06 (x5): $3,913 vs $3,923.
     - 08x06 (x6): $4,154 vs $4,166.
     - 22x03 (x4) to (x7): $4,000 / $4,323 / $4,646 / $4,969 vs $4,004 / $4,328 / $4,652 / $4,976.
     - 22x08 (x4) and (x5): $4,268 / $4,658 vs $4,280 / $4,673.
     - This applies to all five columns.
   - Wrong cross-reference "pages 30 - 32".

## Page 35 - SOLUTION SERIES: Chords (6'8")

1. **Value/label differences.** None: all 17 door rows and the 7x64 sidelite ($3,247 / $3,417 / $4,057 / $4,257 / $4,337) match.
2. **Visual-only content.** The same 9 drawings and captions as p33, and the same FIR03 links.
3. **Footnotes and fine print.** Identical to p33.
6. **Anomalies.** Wrong cross-reference "pages 30 - 32".

## Page 36 - Elevation Venting Units (6'8"), "functionality: Mechanically Assisted"

1. **Value/label differences.** None: all 5 sub-tables × 4 rows × 5 prices match. Text-layer artifacts only:
   - The side tab is appended to the Grills sub-table title and to the Edge 22x36 row.
   - Sub-table titles are split with " | ".
2. **Visual-only content.** None: no drawings and no badges.
3. **Footnotes and fine print.**
   - Each sub-table title carries "(standard white frame in & out)".
   - There are no Panels / Hinges / Jambs notes on this page.
4. **Sub-tables.** Columns are Paint 2 Sides 1 Colour | Paint 2 Sides 2 Colours | Stain 2 Sides 1 Colour | Stain 2 Sides 2 Colour | Stain-Out Paint-In.
   - **Novatech Elevation: Clear/LowE** (standard white frame in & out)
     - 22x36 Oak 6-Panel: $3,699 | $3,879 | $4,649 | $4,949 | $4,999
     - 22x48 Oak 3/4 2-Panel: $3,760 | $3,940 | $4,710 | $5,010 | $5,060
     - 20x64 Oak Flush: $3,934 | $4,114 | $4,884 | $5,184 | $5,234
     - 22x64 Oak Flush: $3,988 | $4,168 | $4,938 | $5,238 | $5,288
   - **Novatech Elevation: Grills, Standard(CAFA) or Georgian(CAAL),** (standard white frame in & out)
     - 22x36 Oak 6-Panel: $4,196 | $4,376 | $5,146 | $5,446 | $5,496
     - 22x48 Oak 3/4 2-Panel: $4,366 | $4,546 | $5,316 | $5,616 | $5,666
     - 20x64 Oak Flush: $4,888 | $5,068 | $5,838 | $6,138 | $6,188
     - 22x64 Oak Flush: $4,598 | $4,778 | $5,548 | $5,848 | $5,898
   - **Novatech Elevation: Edge, Masterline, Optika, Transit** (standard white frame in & out)
     - 22x36 Oak 6-Panel: $3,843 | $4,023 | $4,793 | $5,093 | $5,143
     - 22x48 Oak 3/4 2-Panel: $4,196 | $4,376 | $5,146 | $5,446 | $5,496
     - 20x64 Oak Flush: $4,541 | $4,721 | $5,491 | $5,791 | $5,841
     - 22x64 Oak Flush: $4,592 | $4,772 | $5,542 | $5,842 | $5,892
   - **Novatech Elevation: V-Groove-Murano-Clear** (standard white frame in & out)
     - 22x36 Oak 6-Panel: $4,208 | $4,388 | $5,158 | $5,458 | $5,508
     - 22x48 Oak 3/4 2-Panel: $4,331 | $4,511 | $5,281 | $5,581 | $5,631
     - 20x64 Oak Flush: $4,573 | $4,753 | $5,523 | $5,823 | $5,873
     - 22x64 Oak Flush: $4,645 | $4,825 | $5,595 | $5,895 | $5,945
   - **Novatech Elevation: V-Groove-Murano-Sandblast** (standard white frame in & out)
     - 22x36 Oak 6-Panel: $4,428 | $4,608 | $5,378 | $5,678 | $5,728
     - 22x48 Oak 3/4 2-Panel: $4,651 | $4,831 | $5,601 | $5,901 | $5,951
     - 20x64 Oak Flush: $5,056 | $5,236 | $6,006 | $6,306 | $6,356
     - 22x64 Oak Flush: $5,144 | $5,324 | $6,094 | $6,394 | $6,444
6. **Anomalies.**
   - Grills **20x64 ($4,888) is higher than 22x64 ($4,598)**, an inverted size order.
   - The Edge/Masterline 22x48 row is **identical to the Grills 22x36 row** ($4,196 / $4,376 / $5,146 / $5,446 / $5,496), which looks copy-pasted.

## Page 37 - Q550 & Peak 470 Venting Units (6'8")

1. **Value/label differences.** None: all values match.
   - Text artifacts: `22x48 | Oak 3/4 2-Panel  $3,857` and `22x36 - Clear/LowE  Oak 6-Panel` are missing separators.
   - In the image, the Q550 Grills door panels read "Flush", "6-Panel" and "3/4 2-Panel", without "Oak". The text agrees.
2. **Visual-only content.** "BLACK-OUT" is in bold teal. There are no drawings.
3. **Footnotes and fine print.**
   - Sub-table notes: "(standard white frame in & out)" and "(black-out / white-in)".
   - There are no Panels / Hinges notes on this page.
4. **Sub-tables.**
   - **Novatech Q550: Clear/LowE** (standard white frame in & out), DOOR:
     - 18x36 Oak Flush: $3,672 | $3,852 | $4,622 | $4,922 | $4,972
     - 18x48 Oak Flush: $3,857 | $4,037 | $4,807 | $5,107 | $5,157
     - 18x64 Oak Flush: $4,105 | $4,285 | $5,055 | $5,355 | $5,405
     - 20x36 Oak 6-Panel: $3,672 | $3,852 | $4,622 | $4,922 | $4,972
     - 20x48 Oak Flush: $3,857 | $4,037 | $4,807 | $5,107 | $5,157
     - 20x64 Oak Flush: $4,106 | $4,286 | $5,056 | $5,356 | $5,406
     - 22x36 Oak 6-Panel: $3,672 | $3,852 | $4,622 | $4,922 | $4,972
     - 22x48 Oak 3/4 2-Panel: $3,857 | $4,037 | $4,807 | $5,107 | $5,157
     - 22x64 Oak Flush: $4,192 | $4,372 | $5,142 | $5,442 | $5,492
     - Panel SIDELITE 9x64 Oak Flush: $3,339 | $3,509 | $4,149 | $4,349 | $4,429
   - **Novatech Q550: Grills/LowE** (standard white frame in & out), DOOR:
     - 20x64 Flush: $3,979 | $4,159 | $4,929 | $5,229 | $5,279
     - 22x36 6-Panel: $3,747 | $3,927 | $4,697 | $4,997 | $5,047
     - 22x48 3/4 2-Panel: $3,855 | $4,035 | $4,805 | $5,105 | $5,155
     - 22x64 Flush: $4,005 | $4,185 | $4,955 | $5,255 | $5,305
     - Panel SIDELITE 9x64 Oak Flush: $3,482 | $3,652 | $4,292 | $4,492 | $4,572
   - **Novatech Peak 470** (standard white frame in & out):
     - 22x36 - Clear/LowE, Oak 6-Panel: $3,362 | $3,542 | $4,312 | $4,612 | $4,662
     - 22x36 - Grills, Oak 6-Panel: $3,589 | $3,769 | $4,539 | $4,839 | $4,889
     - 22x36 - Decorative, Oak 6-Panel: $3,614 | $3,794 | $4,564 | $4,864 | $4,914
   - **Novatech Peak 470 BLACK-OUT** (black-out / white-in):
     - 22x36 - Clear/LowE, Oak 6-Panel: $3,642 | $3,822 | $4,592 | $4,892 | $4,942
     - 22x36 - Decorative, Oak 6-Panel: $3,791 | $3,971 | $4,741 | $5,041 | $5,091
     - There is no Grills row.
6. **Anomalies.**
   - Q550 **Grills is cheaper than Clear** at 20x64 ($3,979 vs $4,106), 22x48 ($3,855 vs $3,857) and 22x64 ($4,005 vs $4,192), but dearer at 22x36 ($3,747 vs $3,672).
   - 18x64 is $4,105 vs 20x64 $4,106, a $1 difference.
   - 18/20/22 widths have identical prices for the 36 and 48 heights.

## Page 38 - Elite & EZ Lift Venting Units (6'8"), "by: Trimlite"

1. **Value/label differences.** None: all values match.
   - **Text-layer artifact on every row of this page:** Paint 1 Colour and Paint 2 Colours are separated only by a double space (`$3,246  $3,426`), not " | ". A column splitter on " | " would merge these two prices.
   - "22x64 (22x36 with Extension)" wraps. The text layer puts "Extension)" on its own line.
2. **Visual-only content.** "BLACK-OUT" is in bold. There are no drawings.
3. **Footnotes and fine print.** The same Panels / Hinges / Jambs / Sill / Black Anodized Sill / Standard Glass Frame / Contemporary Woodgran / 7'0" / 8'0" block as p32.
4. **Sub-tables.**
   - **Trimlite Elite** (standard white frame in & out):
     - 20x36 Oak 6-Panel: $3,246 | $3,426 | $4,196 | $4,496 | $4,546
     - 22x36 (London) Oak 6-Panel: $3,246 | $3,426 | $4,196 | $4,496 | $4,546
     - 22x36 - Rain Glass Oak 6-Panel: $3,884 | $4,064 | $4,834 | $5,134 | $5,184
     - 22x36 - Grills Oak 6-Panel: $3,307 | $3,487 | $4,257 | $4,557 | $4,607
     - 22x64 (22x36 with Extension) Oak Flush: $3,559 | $3,739 | $4,509 | $4,809 | $4,859
   - **Trimlite Elite BLACK-OUT** (black-out / white-in):
     - 22x36 Oak 6-Panel: $3,343 | $3,523 | $4,293 | $4,593 | $4,643
   - **Trimlite EZ Lift** (standard white frame in & out):
     - 22x48 Oak 3/4 2-Panel: $3,818 | $3,998 | $4,768 | $5,068 | $5,118
     - 20x64 Oak Flush: $3,953 | $4,133 | $4,903 | $5,203 | $5,253
     - 22x64 Oak Flush: $3,940 | $4,120 | $4,890 | $5,190 | $5,240
   - **Trimlite EZ Lift BLACK-OUT** (black-out / white-in):
     - 22x48 Oak 3/4 2-Panel: $4,029 | $4,209 | $4,979 | $5,279 | $5,329
     - 20x64 Oak Flush: $4,184 | $4,364 | $5,134 | $5,434 | $5,484
     - 22x64 Oak Flush: $4,175 | $4,355 | $5,125 | $5,425 | $5,475
6. **Anomalies.**
   - EZ Lift 22x64 is cheaper than 20x64 ($3,940 < $3,953; BLACK-OUT $4,175 < $4,184).
   - Wrong cross-reference "pages 30 - 32" (it links to p40).

## Page 39 - Solid Panel Doors 6'8", "Solid doors, no glass"

1. **Value/label differences.** None: Oak Flush $2,738 / $2,918 / $3,688 / $3,988 / $4,038 and all 31 upcharge lines match the image. Text-layer artifacts:
   - Texture and code are merged by a double space: "Oak  WG00", "Fir  FG4H", "Fir  FIR01" and so on.
   - Name and brand are merged: "Craftsman (3P below glass)  Richersons".
   - "Contemporary Stainless / Steel" is split across the $2,040 and $2,570 lines.
   - The 42" upcharges ($520, $1,860, $2,570, $830, $1,000, $490) appear as their own lines with no panel name. In the image they are the second sub-row of a merged cell belonging to the panel above.
2. **Visual-only content.**
   - **No product photos or drawings.**
   - Trimlite rows show brand and texture in bold.
   - Many panel names are underlined as if they were links: 2-Panel 3/4, 4-Panel 3/4, 6-Panel, 6-Panel Sq.Top (6-Lite), 3/4 Oval, Oak 1 Panel Planks, Full O&B, 3/4 O&B, Narrow O&B, 1 Panel Sq. Top Plank, 2 Panel Arch Top Plank, both Craftsman rows, 3 Panel Shaker, 1-Panel Shaker, both 2-Panel Shakers and 3 Panel Craftsman.
   - Only 5 of them are real links: 3 Panel Shaker → .../3-panel-fir-shaker-craftsman-fg3j, 1-Panel Shaker → .../1-panel-fir-shaker-fir01, 2-Panel Shaker (1/2 Lite) → .../68-fiberglass-2panel-shaker-fir02, 2-Panel Shaker (3/4 Lite) → .../2-panel-fir-shaker-fir25, 3 Panel Craftsman → .../3-panel-fir-craftsman-shaker-fir03.
3. **Footnotes and fine print.** "Contined on next page" (typo, as printed).
6. **Anomalies.** No price anomalies found.

## Page 40 - Solid Panel Doors 6'8" (continued)

1. **Value/label differences.** None: Oak Flush $2,738 ... $4,038 (repeated from p39) and the Plastpro rows match. Artifact: "2 Panel Arch Top Plank  Plastpro" is merged.
   - DRA1P $1,290 (36")
   - DRA2A $1,290 (36")
   - DRA2B $1,290 (36")
   - DRA2D $1,290 (36") / $2,460 (42")
   - DRATP $2,590 (36") / $4,290 (42")
2. **Visual-only content.**
   - No photos.
   - The first three names are underlined but not linked. "2 Panel Arch Top" and "1 Panel True Plank" are not underlined.
3. **Footnotes and fine print.** None.
6. **Anomalies.** None beyond the TOC and "pages 30-32" links landing here instead of p39.

## Page 41 - Solid Panel Doors 7'0"

1. **Value/label differences.** None.
   - Oak Flush: $3,013 / $3,193 / $3,963 / $4,263 / $4,313
   - WG00 $100
   - WG25 $110
   - TG71 $760 (32"-36") / $1,100 (42")
2. **Visual-only content.** No photos. "Flush" and "2 Panel 3/4" are underlined but not linked.
3. **Footnotes and fine print.** None.
6. **Anomalies.** None.

## Page 42 - Solid Panel Doors 8'0" (subtitle rendered in a different condensed all-caps font: "SOLID DOORS, NO GLASS")

1. **Value/label differences.** None in values; all 22 panels match.
   - **Text-layer column split:** `3-Panel Craftsman | Shaker | Trimlite | Smooth | SMO03-80 | $120 | 36"`. In the image the panel name is "3-Panel Craftsman Shaker" and the brand is Trimlite. The text layer creates an extra column, so any positional parse shifts brand, texture, code, price and size by one.
   - Merged "Brush Stroke  BW28".
   - "Contemporary Stainless / Steel" is split.
2. **Visual-only content.** No photos. Several names are underlined (3 Panel, Full O&B, Narrow O&B, 2 Panel Arch Top Plank, 2-Panel 3/4) but none are linked.
3. **Footnotes and fine print.** None.
6. **Anomalies.**
   - "3 Panel Craftsman | Trimlite | Fir | DRF3F80": $1,800 (36") but **$6,280 (42")**, 3.5 times the 36" price. Also, the "DR…" code prefix matches the Plastpro codes (DRA…), yet the brand says Trimlite.
   - "2 Panel Arch Top Plank | Richersons | **Oak** | RG26": the other Richersons plank codes RG21 and RG22 are "Rustic" texture.

## Page 43 - Transoms (6'8")

1. **Value/label differences.** None.
2. **Visual-only content.** None.
3. **Footnotes and fine print.**
   - RECTANGLE:
     - Frame $500 | $560 | $690 | $1140 | $710
     - "Decorative Glass +$175 / sq.ft."
     - "Wrought Iron Glass +$180 / sq.ft."
     - "Sandblast/Obscure Glass +$75 / sq.ft."
     - "Clear/LowE Glass +$60 / sq.ft."
     - "Glass with Grills +$85 / sq.ft. (additional charges per box apply)"
     - "Clear Glass with SDLs +$95 / sq.ft. (additional charges per box apply)"
     - "Obscure Glass with SDLs +$110 / sq.ft. (additional charges per box apply)"
     - "Minimum Glass Charge: 10 sq.ft."
     - "Glass Tempering: +$160 / glass unit"
     - "Casing Trim: not included"
   - SHAPES:
     - Frame $655 | $745 | $940 | $1390 | $1105
     - Decorative +$310, Wrought Iron +$340, Sandblast/Obscure +$225, Clear/LowE +$205
     - Grills +$225, with no "additional charges" note, unlike Rectangle
     - Clear SDL +$260 and Obscure SDL +$270, both "(additional charges per box apply)"
     - "Minimum Glass Charge: Single Door 10 sq.ft. / Other configurations 15 sq.ft."
     - "Glass Tempering: +$320 / glass unit"
     - "Casing Trim: Colonial 3-1/2" included (curve top and sides)"
6. **Anomalies.**
   - **Stain 2 Sides 2 Colour ($1140 rectangle / $1390 shapes) is higher than Stain-Out Paint-In ($710 / $1105).** Every other table in the book has Stain-Out Paint-In as the most expensive column. The $1140 and $1390 are also out of step with the $690 and $940 Stain 1-colour prices. Suspect.
   - Prices print without thousands separators ($1140, $1390, $1105), as in the text.

## Page 44 - Extras & Options (Custom Sizing, Operating Sidelite, Frame Depths)

1. **Value/label differences.** None.
   - Cut-Down $100; 7' System 84" slab $275; 8' System 95" slab $375; Hinged Sidelite with Astragal $250.
   - Sills: Mill included; Black Anodized $20; 3"-4" extension $20; Outswing $0; Wheelchair $0.
   - Jambs: 5-5/8 jamb $60; 7-5/8 jamb $135.
   - Brickmould: 84" painted $100; 84" stained $150; 101" painted $120; 101" stained $170; Custom PVC BM $685; Custom Textured BM $855.
2. **Visual-only content.**
   - **Red text**, visual only: "(NOT compatiable with the 7-5/8" jambs)" on Outswing Sill and "(NOT compatiable with the 5-5/8" or 7-5/8" jambs)" on Wheelchair Sill.
   - "smooth ONLY" is bold on the 5-5/8 jamb line.
   - **Frame & Sill depth diagram.** Caption: "Standard and Optional Frame & Sill configurations:". There are 4 rounded grey tiles, each a 3D render of the bottom corner of a door frame on its sill:
     - a red vertical outer member (presumably the brickmould) on the left/front edge;
     - a coloured jamb face with a small strike/hardware plate (blue dot) on its edge;
     - an aluminium/silver sill with black threshold/weatherstrip strips and a white end cap.
     - The jamb and sill get visibly deeper from left to right. Captions are **4-5/8"** (yellow jamb), **5-5/8"** (orange jamb), **6-5/8"** (yellow jamb, deeper) and **7-5/8"** (orange jamb, deepest sill).
     - No dimensions, prices or legend are printed in the images. The yellow = standard (4-5/8, 6-5/8, no charge) vs orange = optional (5-5/8 +$60, 7-5/8 +$135) reading is my inference only.
   - **Link-only information** (invisible, from the image link URLs):
     - 4-5/8" = "4-625 jamb, 2" BM w/ .75 reveal, 5.875 HP sill"
     - 5-5/8" = "5-625 jamb, 2" BM w/ .75 reveal, 6.875 HP sill"
     - 6-5/8" = "6-625 jamb, 2" BM w/ 1" reveal, 7.875 HP sill"
     - 7-5/8" = "7-625 jamb, 2" BM w/ 1" reveal, 8.875 HP sill"
     - The URLs are palmadoor.com/3d-corner/…
3. **Footnotes and fine print.**
   - "Cut-Down (per Door Panel or Sidelite Panel)"
   - "(per Door or Sidelite)"
   - "Hinged Sidelite Panel with Astragal (for standard panel sizes only)"
   - "Hight Performance Fixed Sill - Mill Clear Anodized / box (included with white doors)"
   - "Hight Performance Fixed Sill - Black Anodized / box (included with painted doors)". Note that "included with painted doors" sits next to a $20 charge.
   - "Composite 5-5/8 Jamb / box (available in smooth ONLY)"
   - "Composite 7-5/8 Jamb / box (available in smooth and woodgrain)"
   - "(ea.)" on the brickmould lines
   - "Online Complete Frame & Sill Depth guide: palmadoor.com/sills". This links to palmadoor.com/in-swing-frame-and-sill-depth-guide.
6. **Anomalies.**
   - The 5-5/8" jamb is not in the "available in" list on pp. 30-38.
   - The Black Anodized sill says "(included with painted doors)" but is priced at $20.
   - Typos "Hight" and "compatiable" are as printed.

## Page 45 - Extras & Options (Casing, Glass Frame, Glass, Screens)

1. **Value/label differences.** None.
   - Painted casing: SD $400; SD+1SL $550; SD+2SL $700; DD $600; DD+2SL $700.
   - Stained casing: $500 / $650 / $800 / $700 / $800.
   - Glass frames: Contemporary PVC $80; Aluminum Colonial $260; Aluminum Urban Smooth $250; Aluminum Urban Textured $400.
   - Glass: Tempered DG sidelite / rect transom $160; Tempered shape transom $320; Laminated $420.
   - Screens: White sliding $450; Painted sliding 1 side $575; 2 sides $700; White retractable* $865; Painted retractable* $1,060; 8' White retractable* $1,130; 8' Painted retractable* $1,325.
2. **Visual-only content.** The screen footnote is partly **red**: "ONLY with 6-5/8" and 7-1/4" Jambs, and assembled Regular 2" BM with no more than 1" reveal."
3. **Footnotes and fine print.**
   - "Poplar 3-1/2" Colonial Casing, for Backband add 50%" (under both casing tables).
   - "*Compatible ONLY with 6-5/8" and 7-1/4" Jambs, and assembled Regular 2" BM with no more than 1" reveal." This attaches to the 4 RETRACTABLE screen lines.
   - "*For Double Door: RETRACTABLE Screen cost x 2".
6. **Anomalies.**
   - Casing **Double Door + 2 Sidelites = Single Door + 2 Sidelites** ($700 painted, $800 stained), even though a bare Double Door already costs $600 / $700.
   - "7-1/4" Jambs" does not exist in this book, which uses 4-5/8, 5-5/8, 6-5/8 and 7-5/8. It is probably meant to be 7-5/8".

## Page 46 - Extras & Options (FERCO Multi-Point Locks, Other Multi-Point Handles, Smart Lock)

1. **Value/label differences.** None in values.
   - Text artifact: "Verona, Miliano, Country, Ribbon and Miami | Large | (Active)" is split.
   - **Merged cells:**
     - "Ferco Mortise Astragal Lock $470" and "Key Alike (same brand only) $80" are one price centred across the Active+Dummy columns.
     - All Tedee items are also single centred prices even though the header shows "Active | Dummy": Tedee-PRO $1400, Keypad $510, WiFi Bridge $445, Door Sensor $240, Temporary Knob $40.
     - The text layer cannot show the span.
2. **Visual-only content.**
   - "[NEW]" tags on Berlin Thumb-Push Gripset and Berlin Lever Handleset are bold text inside the text layer.
   - Product photos with captions: "Tedee-PRO Smart Lock" (silver and black cylinders), "Tedee Keypad" (white and black keypads), "Tedee WiFi Bridge", "Tedee Knobs" (black and bronze knobs) and "Tedee Door Sensor".
   - "Smart Homes Systems" is underlined but not linked.
3. **Footnotes and fine print.**
   - "*Tedee Smart Lock is only compatible with all FERCO handles, Miami handles and all Pull Bars". This attaches to "*Tedee-PRO Smart Lock (Black or Silver) - Compatible with over 15+ Smart Homes Systems".
   - Finish lists in italics: "(Black, Satin Nickel, Dark Bronze, Pewter)" and "(Satin Nickel, Dark Bronze, Pewter)".
   - "(same brand only)", "(Active)", "(Black ONLY)", "(Black and SN ONLY)".
   - "Features and more: palmadoor.com/hardware/tedee-pro".
6. **Anomalies.** The "palmadoor.com/hardware/tedee-pro" link is a **GoToR to a local file on the designer's PC** ("/C/Users/vito/AppData/Local/Adobe/InDesign/Version 20.0/en_US/Caches/InDesign ClipboardScrap1.pdf"), not a web URL, so it is broken.

## Pages 47-50 - Pull Bars ("H" Type - pull bars on both sides)

**Hidden layer, identical on all four pages and in all 8 blocks.** Each block holds two complete tables at the same position.

- The first table drawn is an old/template table (narrower, x 30-324 pt). It has its own "Length / Finish / Round / Square / Rectangle" header, length labels, finish labels and prices.
- The newer table (x 30-385 pt) is painted afterwards with **opaque cell-background fills that completely cover the old one**, and then its own text on top.
- Both layers are black, opacity 1, render mode 0, with no Optional Content. So no reader sees the old numbers in any viewer, but text extraction, copy and search return both. That is the source of the garbling ("SatinSatin", "FinisFhinish", "$2,45$51,940").
- The old numbers are leftovers and must be ignored. The old layer is the same in every block (Round / Square / Rectangle):
  - 36": Satin $1,850 / $1,900 / $1,940; Black $1,900 / $1,940 / $1,980; Gold $2,110.00 / $2,150.00 / $2,240.00
  - 48": Satin $1,940 / $2,000 / $2,070; Black $2,000 / $2,070 / $2,130; Gold $2,240.00 / $2,300.00 / $2,410.00
  - 60": Satin $2,110 / $2,200 / $2,280; Black $2,170 / $2,260 / $2,350; Gold $2,430.00 / $2,520.00 / $2,650.00
  - 72": Satin $2,240 / $2,350 / $2,450; Black $2,320 / $2,430 / $2,540; Gold $2,600.00 / $2,710.00 / $2,860.00
  - 84": Satin $2,390 / $2,520 / $2,650; Black $2,470 / $2,600 / $2,730; Gold $2,770.00 / $2,900.00 / $3,070.00

The visible values below were read from the rendered images and cross-checked against the operator-list extraction of the top (last-drawn) layer. They agree 100%.

- Common visual-only elements: circle / square / rectangle shape icons above the Round / Square / Rectangle columns; Black rows in bold; Gold rows in bold on a yellow background, printed with ".00".
- Each block has a door render on its right.

### Page 47 - Straight Pull Bars

- Renders: grey door with a long vertical bar; the T-bar block shows a mid-height T-handle/lock, and the Multipoint block shows the bar with a small lock cylinder.
- Captions:
  - "T-bar handle prevents lockouts — otherwise, a key is required to open the door." (attached to the T-bar block)
  - "A key is required to open the door." (attached to the Multipoint Lock block)

**with Multipoint Lock and T-Bar Handle** (Round / Square / Rectangle)

| Length | Finish | Round | Square | Rectangle |
|---|---|---|---|---|
| 36" | Satin | $2,415 | $2,455 | $2,495 |
| 36" | Black | $2,455 | $2,495 | $2,535 |
| 36" | Gold | $2,655.00 | $2,695.00 | $2,775.00 |
| 48" | Satin | $2,495 | $2,555 | $2,615 |
| 48" | Black | $2,555 | $2,615 | $2,675 |
| 48" | Gold | $2,775.00 | $2,835.00 | $2,935.00 |
| 60" | Satin | $2,655 | $2,735 | $2,815 |
| 60" | Black | $2,715 | $2,795 | $2,875 |
| 60" | Gold | $2,955.00 | $3,035.00 | $3,155.00 |
| 72" | Satin | $2,775 | $2,875 | $2,975 |
| 72" | Black | $2,855 | $2,955 | $3,055 |
| 72" | Gold | $3,115.00 | $3,215.00 | $3,355.00 |
| 84" | Satin | $2,915 | $3,035 | $3,155 |
| 84" | Black | $2,995 | $3,115 | $3,235 |
| 84" | Gold | $3,275.00 | $3,395.00 | $3,555.00 |

**with Multipoint Lock**

| Length | Finish | Round | Square | Rectangle |
|---|---|---|---|---|
| 36" | Satin | $2,055 | $2,095 | $2,135 |
| 36" | Black | $2,095 | $2,135 | $2,175 |
| 36" | Gold | $2,295.00 | $2,335.00 | $2,415.00 |
| 48" | Satin | $2,135 | $2,195 | $2,255 |
| 48" | Black | $2,195 | $2,255 | $2,315 |
| 48" | Gold | $2,415.00 | $2,475.00 | $2,575.00 |
| 60" | Satin | $2,295 | $2,375 | $2,455 |
| 60" | Black | $2,355 | $2,435 | $2,515 |
| 60" | Gold | $2,595.00 | $2,675.00 | $2,795.00 |
| 72" | Satin | $2,415 | $2,515 | $2,615 |
| 72" | Black | $2,495 | $2,595 | $2,695 |
| 72" | Gold | $2,755.00 | $2,855.00 | $2,995.00 |
| 84" | Satin | $2,555 | $2,675 | $2,795 |
| 84" | Black | $2,635 | $2,755 | $2,875 |
| 84" | Gold | $2,915.00 | $3,035.00 | $3,195.00 |

### Page 48 - Straight Pull Bars

- Captions:
  - "The dummy handle is used on the inactive panel of a double door." (DUMMY block)
  - "Deadbolt prep only – deadbolt not included." (Roller Latches block)
- The render of the roller-latch door shows edge latches and a deadbolt bore.

**with DUMMY handle for inactive panel**

| Length | Finish | Round | Square | Rectangle |
|---|---|---|---|---|
| 36" | Satin | $650 | $690 | $730 |
| 36" | Black | $690 | $730 | $770 |
| 36" | Gold | $890.00 | $930.00 | $1,010.00 |
| 48" | Satin | $730 | $790 | $850 |
| 48" | Black | $790 | $850 | $910 |
| 48" | Gold | $1,010.00 | $1,070.00 | $1,170.00 |
| 60" | Satin | $890 | $970 | $1,050 |
| 60" | Black | $950 | $1,030 | $1,110 |
| 60" | Gold | $1,190.00 | $1,270.00 | $1,390.00 |
| 72" | Satin | $1,010 | $1,110 | $1,210 |
| 72" | Black | $1,090 | $1,190 | $1,290 |
| 72" | Gold | $1,350.00 | $1,450.00 | $1,590.00 |
| 84" | Satin | $1,150 | $1,270 | $1,390 |
| 84" | Black | $1,230 | $1,350 | $1,470 |
| 84" | Gold | $1,510.00 | $1,630.00 | $1,790.00 |

**with Roller Latches and Deadbolt Bore**

| Length | Finish | Round | Square | Rectangle |
|---|---|---|---|---|
| 36" | Satin | $1,190 | $1,230 | $1,270 |
| 36" | Black | $1,230 | $1,270 | $1,310 |
| 36" | Gold | $1,430.00 | $1,470.00 | $1,550.00 |
| 48" | Satin | $1,270 | $1,330 | $1,390 |
| 48" | Black | $1,330 | $1,390 | $1,450 |
| 48" | Gold | $1,550.00 | $1,610.00 | $1,710.00 |
| 60" | Satin | $1,430 | $1,510 | $1,590 |
| 60" | Black | $1,490 | $1,570 | $1,650 |
| 60" | Gold | $1,730.00 | $1,810.00 | $1,930.00 |
| 72" | Satin | $1,550 | $1,650 | $1,750 |
| 72" | Black | $1,630 | $1,730 | $1,830 |
| 72" | Gold | $1,890.00 | $1,990.00 | $2,130.00 |
| 84" | Satin | $1,690 | $1,810 | $1,930 |
| 84" | Black | $1,770 | $1,890 | $2,010 |
| 84" | Gold | $2,050.00 | $2,170.00 | $2,330.00 |

### Page 49 - Offset Pull Bars

- The renders show a full-lite glass door with an offset bar.
- The captions are the same as p47.

**with Multipoint Lock and T-Bar Handle**

| Length | Finish | Round | Square | Rectangle |
|---|---|---|---|---|
| 36" | Satin | $2,895 | $2,935 | $2,975 |
| 36" | Black | $2,935 | $2,975 | $3,015 |
| 36" | Gold | $3,135.00 | $3,175.00 | $3,255.00 |
| 48" | Satin | $2,975 | $3,035 | $3,095 |
| 48" | Black | $3,035 | $3,095 | $3,155 |
| 48" | Gold | $3,255.00 | $3,315.00 | $3,415.00 |
| 60" | Satin | $3,135 | $3,215 | $3,295 |
| 60" | Black | $3,195 | $3,275 | $3,355 |
| 60" | Gold | $3,435.00 | $3,515.00 | $3,635.00 |
| 72" | Satin | $3,255 | $3,355 | $3,455 |
| 72" | Black | $3,335 | $3,435 | $3,535 |
| 72" | Gold | $3,595.00 | $3,695.00 | $3,835.00 |
| 84" | Satin | $3,395 | $3,515 | $3,635 |
| 84" | Black | $3,475 | $3,595 | $3,715 |
| 84" | Gold | $3,755.00 | $3,875.00 | $4,035.00 |

**with Multipoint Lock**

| Length | Finish | Round | Square | Rectangle |
|---|---|---|---|---|
| 36" | Satin | $2,535 | $2,575 | $2,615 |
| 36" | Black | $2,575 | $2,615 | $2,655 |
| 36" | Gold | $2,775.00 | $2,815.00 | $2,895.00 |
| 48" | Satin | $2,615 | $2,675 | $2,735 |
| 48" | Black | $2,675 | $2,735 | $2,795 |
| 48" | Gold | $2,895.00 | $2,955.00 | $3,055.00 |
| 60" | Satin | $2,775 | $2,855 | $2,935 |
| 60" | Black | $2,835 | $2,915 | $2,995 |
| 60" | Gold | $3,075.00 | $3,155.00 | $3,275.00 |
| 72" | Satin | $2,895 | $2,995 | $3,095 |
| 72" | Black | $2,975 | $3,075 | $3,175 |
| 72" | Gold | $3,235.00 | $3,335.00 | $3,475.00 |
| 84" | Satin | $3,035 | $3,155 | $3,275 |
| 84" | Black | $3,115 | $3,235 | $3,355 |
| 84" | Gold | $3,395.00 | $3,515.00 | $3,675.00 |

### Page 50 - Offset Pull Bars

- The captions are the same as p48.

**with DUMMY handle for inactive panel**

| Length | Finish | Round | Square | Rectangle |
|---|---|---|---|---|
| 36" | Satin | $1,130 | $1,170 | $1,210 |
| 36" | Black | $1,170 | $1,210 | $1,250 |
| 36" | Gold | $1,370.00 | $1,410.00 | $1,490.00 |
| 48" | Satin | $1,210 | $1,270 | $1,330 |
| 48" | Black | $1,270 | $1,330 | $1,390 |
| 48" | Gold | $1,490.00 | $1,550.00 | $1,650.00 |
| 60" | Satin | $1,370 | $1,450 | $1,530 |
| 60" | Black | $1,430 | $1,510 | $1,590 |
| 60" | Gold | $1,670.00 | $1,750.00 | $1,870.00 |
| 72" | Satin | $1,490 | $1,590 | $1,690 |
| 72" | Black | $1,570 | $1,670 | $1,770 |
| 72" | Gold | $1,830.00 | $1,930.00 | $2,070.00 |
| 84" | Satin | $1,630 | $1,750 | $1,870 |
| 84" | Black | $1,710 | $1,830 | $1,950 |
| 84" | Gold | $1,990.00 | $2,110.00 | $2,270.00 |

**with Roller Latches and Deadbolt Bore**

| Length | Finish | Round | Square | Rectangle |
|---|---|---|---|---|
| 36" | Satin | $1,670 | $1,710 | $1,750 |
| 36" | Black | $1,710 | $1,750 | $1,790 |
| 36" | Gold | $1,910.00 | $1,950.00 | $2,030.00 |
| 48" | Satin | $1,750 | $1,810 | $1,870 |
| 48" | Black | $1,810 | $1,870 | $1,930 |
| 48" | Gold | $2,030.00 | $2,090.00 | $2,190.00 |
| 60" | Satin | $1,910 | $1,990 | $2,070 |
| 60" | Black | $1,970 | $2,050 | $2,130 |
| 60" | Gold | $2,210.00 | $2,290.00 | $2,410.00 |
| 72" | Satin | $2,030 | $2,130 | $2,230 |
| 72" | Black | $2,110 | $2,210 | $2,310 |
| 72" | Gold | $2,370.00 | $2,470.00 | $2,610.00 |
| 84" | Satin | $2,170 | $2,290 | $2,410 |
| 84" | Black | $2,250 | $2,370 | $2,490 |
| 84" | Gold | $2,530.00 | $2,650.00 | $2,810.00 |

**Internal consistency checks on the visible layer.** All of these pass, which supports that the visible layer is the intended price list.

- Offset = Straight + $480 in every cell of every block.
- T-Bar = Multipoint + $360 in every cell (straight and offset).
- Roller Latch = Dummy + $540 in every cell.

**Anomalies.** The only issue is the stale hidden layer described above. No visible price looks implausible.

## Page 51 - Extras & Options: Paint / Stain

1. **Value/label differences.** None. All 11 paint and 13 stain lines match. Stain prices print without commas ($1000.00, $1100.00, $1350.00), as in the text.
2. **Visual-only content.** None.
3. **Footnotes and fine print.** "(same colour)", "(2 different colours)", "(per door or sidelite)", "(per pc, up to 8')", "(colour chip required)" are inline.
6. **Anomalies.** None. Note that the TOC lists Decorative Accessories and Accents on 51, but they are on 52.

## Page 52 - Extras & Options: Decorative Accents / Decorative Accesories

1. **Value/label differences.** None. Every line matches:

   | Item | Add |
   |---|---|
   | Vog 1, Vog 2 - Alunox / Stainless Steel (per side) | $650 |
   | Vog 2 - Black (per side) | $810 |
   | Oso 1, Oso 2 - Alunox / Stainless Steel (per side) | $650 |
   | Uno 1, Uno 2, Uno 3 - Alunox / Stainless Steel (per side) | $650 |
   | Uno 1, Uno 2, - Black, Matte Gold (per side) | $810 |
   | Uno 3 - Black (per side) | $810 |
   | Era 1 - Alunox / Stainless Steel (per side) | $650 |
   | Era 1 - Matte Gold (per side) | $810 |
   | Vertical Accent for 7" x 64" - Alunox / Stainless Steel - Exterior Only | $1,780 |
   | Vertical Accent for 7" x 64" - Black - Exterior Only | $1,890 |
   | [NEW] Vertical Accent Reeded Wood | $1,415 |
   | Mail Slot installed | $250 |
   | Peep Door Viewer installed | $100 |
   | Dentil Shelf - Painted | $550 |
   | Dentil Shelf - Stained | $650 |
   | Kick Panel | $300 |

2. **Visual-only content.**
   - **There are no pictures of accents or accessories on this page.** The image shows only the two tables, and the page has no image XObjects.
   - The "[NEW]" badge is bold text and is in the text layer.
   - The finish words (Black, Matte Gold) are in bold.
3. **Footnotes and fine print.** Only the inline "(per side)" and "- Exterior Only".
6. **Anomalies.**
   - Heading typo "Decorative Accesories".
   - The TOC points these sections to p51.

## Page 53 - Standard Paint Colours (swatches)

1. **Value/label differences.** None. The 25 captions match the text:
   - 5C1 Chesapeake Grey, 5C6 Marine Dusk, 5P2 Rockwell Blue, 5P3 Espresso, 5P5 Graphite
   - 5P6 Irion Ore, 5P9 Coastal Blue, 265 Antique Brown, 322 Red, 429 Ice White
   - 430 Rainwear White, 431 Bright White, 492 Cream, 501 Lambeth Beige, 502 Maize
   - 506 Windswept Smoke, 507 Tan, 508 Sandalwood, 509 Midnight Suft, 510 Canyon Clay
   - 513 Moonlit Moss, 514 Cashmere, 517 Sage, 522 Ivy Green, 523 Slate
   - The typos "Irion", "Rainwear" and "Suft" are in the image too.
2. **Visual-only content.** 25 colour swatches (vector), one above each caption.
3. **Footnotes and fine print.** None.
6. **Anomalies.** None beyond the typos.

## Page 54 - Standard Paint Colours

1. **Value/label differences.** None. The 25 captions match:
   - 525 Black, 532 Almond, 533 Antique Ivory, 534 Pearl, 535 Wedgewood Blue
   - 536 Dover Gray, 537 Mist Blue, 538 Wicker Cafe, 539 Venetian Red, 540 Sandstone
   - 542 Old World Blue, 543 Harvest Wheat, 547 Sable, 554 Chestnut Brown, 556 Forest Green
   - 557 Dark Drift, 559 Pebble, 562 Commercial Brown, 567 Burgundy, 568 Nutmeg
   - 569 Saddle Brown, 570 Storm, 571 Brownstone, 580 Juniper Grove, NS - Espresso
2. **Visual-only content.** 25 swatches.
3. **Footnotes and fine print.** None.
6. **Anomalies.** Two Espressos (5P3 Espresso on p53 and NS - Espresso); the "NS" code has no explanation.

## Page 55 - Standard Paint Colours

1. **Value/label differences.** None. There is one swatch, "Standard (Polytex) White".
2. **Visual-only content.** The swatch.
3. **Footnotes and fine print.** None.
6. **Anomalies.** None.

## Page 56 - Standard Stain Colours

1. **Value/label differences.** None. The captions are Timber Grey, White Oak, Slate Grey, Bleached Oak, Charcoal Grey and Driftwood.
2. **Visual-only content.** 6 wood-grain photo swatches.
3. **Footnotes and fine print.** None.
6. **Anomalies.** None.

## Page 57 - Standard Stain Colours

1. **Value/label differences.** None. The captions are Teak, English Oak, Rustic Cherry, Light Pecan, Red Mahogany and Early American.
2. **Visual-only content.** 6 photo swatches.
3. **Footnotes and fine print.** None.
6. **Anomalies.** None.

## Page 58 - Standard Stain Colours

1. **Value/label differences.** None. The captions are Dark Walnut, Early American Black, Jacobean and Dark Pecan.
2. **Visual-only content.** 4 photo swatches.
3. **Footnotes and fine print.** None.
6. **Anomalies.** The TOC range "56-57" omits this page.
