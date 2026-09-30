# Visual audit: Palma Door Steel Entry Door Price Book 2024 [Interactive], pages 26-49

## Method

- The Read tool could not render the PDF because `pdftoppm` is not installed. Instead, I rendered every page with the built-in Windows PDF engine (`Windows.Data.Pdf`):
  - pages 26-49 at 2200 px wide
  - pages 37-46 again at 4400 px wide, for zoomed crops
- I compared each rendered page against its block in `st_clean.txt`.
- For layered or hidden content, I also inspected the PDF text runs with their x/y positions, plus the link annotations and XObjects, using pypdf.
- Page geometry: the page is 600 x 800 pt (the renderer reports 800 x 1066.67 at 96 DPI).
- Scratch files:
  - `scratchpad/render_st.ps1` and `scratchpad/crop_st.ps1`
  - `scratchpad/st_render_26_49/*.png` and `scratchpad/st_render_hi/*.png`
  - `scratchpad/st_textpos.py`

## Global notes (apply to every page 26-49)

- **Side tab text.** The vertical side tab reads "Steel Insulated Doors | Smooth PVC Frames | Composite Sills". The text extraction splices these words into table rows, for example `22x36 | London | ... | $3,520 | Smooth PVC Frames` and `8x80 | Flush | ... | Composite Sills`. They are not table cells. A parser must strip trailing `| Smooth PVC Frames`, `| Composite Sills` and `| Steel Insulated Doors`.
- **Underlined panel names are hyperlinks.** Examples are Soho, Victoria, London, Orleans, Sydney, 6-Panel, 2-Panel BT, 4-Panel BT, Oso, Vog, Linea, Era and Tao. They point to `https://www.palmadoor.com/door-panels/novatech-...` pages. Names that are not underlined (Flush, 6 Panel on p38, 2P Camber Top, 3 Panel, 2P Planked Cam Top, and Soho on p36) have no link.
  - Exception: on p35, the "Q550: Grills/LowE" table underlines Flush, London, Orleans and Soho, but no link annotation exists there. The underline is cosmetic only.
- **Footer links.** Each page has a footer mailto link whose subject is still "From: Steel Entry Door Price Book **2023**", a stale year. The top-left logo links to the named destination "...NEW Pull Bars.indd:Table of Content:100", which correctly resolves to page 2.
- **Document dates.** The PDF metadata says it was made in InDesign, created and modified 2025-10-21. Page 2 says "Effective: Jun 15, 2024 - Last Updated: Oct 21, 2025".
- **Table of contents (p2) vs the pages.** All page numbers for 26-49 are correct.
  - The TOC name differs from the page title in three places:
    - "Internal Grills" is titled "Grills - Standard White 1/4" x 5/8"" on p27.
    - "Solid Steel Doors" is titled "Solid Panel Doors" on p38.
    - "NEW Pull Bars" is titled "Straight Pull Bars" on p42-43, and no "NEW" appears on those pages.
  - The TOC does not list several sections: "Operating Sidelite(s)" (p40), "Other Multi-Point Handles" (p41), and "Triple Glazing Upcharge" and "Energy Star Solutions" (p45).

### Standard footnote block (SFB)

This is the footnote block used on the glass pages, verbatim from the image:

```
Panels: Novatech Steel Insulated N600
Hinges: Ball Bearing Steel (Heavy-Duty Stainless Steel and Matte Black hinges +$60/door).
Jambs: Smooth Composite PVC (available in 4-5/8", *5-1/4", 6-5/8", and *7-5/8").  *extra charges apply
Sill: Fixed - Mill (Clear Anodized)
Black Anodized Sill: +$20/box
Standard Glass Frame: Colonial PVC
Contemporary glass frame: +$80/doorlite (**included with Victoria and Soho panels)
Direct Glazed Glass: Tempered
7'0" System: +$275/box
8'0" System: +$375/box
```

- The `**` marks attach to the rows flagged `**` in the tables: `22x14-7/16**` Victoria, `22x12**` Soho and `22x48**` Soho.
- In "(**included with Victoria and Soho panels)", the words "Victoria" and "Soho" are underlined hyperlinks.
- The `*` in the Jambs line marks 5-1/4" and 7-5/8" as extra-charge jambs. The prices are on p40: 5-1/4 is $60, 7-5/8 is $135.
- Anomaly: p40 also prices a **7-1/4"** jamb ($135), which none of the SFB jamb lists mention. The p40 retractable-screen note also requires 6-5/8" or 7-1/4" jambs.

---

## Page 26 - Clear/LowE 6mm Laminated, "Enhanced Security"

1. **Value/label differences:** none. All 14 DOOR rows, 4 Panel SIDELITE rows and 8 Direct Glazed SIDELITE rows match the text exactly.
2. **Visual-only content:** the underlined panel names are links (see Global notes). There are no badges, images or strike-throughs.
3. **Footnotes:** the full SFB.
   - `**` appears on `22x14-7/16**` Victoria and `22x48**` Soho.
   - `22x12` Soho has **no** `**` on this page, but it does on p27. The flag is inconsistent; the footnote says the contemporary frame is included with Soho anyway.
4. **Anomalies (all visible in the image too, so they are not extraction errors):**
   - 22x12 Soho and 22x14-7/16 Victoria have identical prices ($2,392 / $3,012 / $3,242 / $3,422).
   - 22x12 (x4) and 22x14-7/16 (x4) are identical ($3,874 ...).
   - Sidelite 8x36 London equals 8x48 Orleans ($2,048 / $2,548 / $2,738 / $2,908).
   - Paint deltas: doors are +620/+850/+1,030, sidelites +500/+690/+860, direct glazed +230/+310/+370. These are consistent.

## Page 27 - Grills - Standard White 1/4" x 5/8" ("includes: Standard patterns only")

1. **Value/label differences:** none. 13 DOOR rows, including "Half Moon | 4-Panel BT", and 3 sidelite rows all match.
2. **Visual-only content:** none beyond the links.
   - There is no 8x80 sidelite row and no Direct Glazed table on this page, yet the footnote still says "Direct Glazed Glass: Tempered".
3. **Footnotes:** the SFB, plus two lines inserted before "7'0" System":
   - "Standard Grills: White with standard patterns (see brochure(s) for details)"
   - "Custom Grills: +$40/box"
   - `**` appears on `22x12**` Soho and `22x14-7/16**` Victoria.
4. **Anomalies:** none beyond the above.

## Page 28 - SDLs on Clear Glass ("Standard with 7/8" shadow bar between glass")

1. **Value/label differences:** none.
   - Size labels are printed in the image as **"764"** and **"2217"**, not 07x64 / 22x17. That is how the book prints them, and it is inconsistent with other pages.
2. **Visual-only content:** under each of the three tables is a free-standing line, "+ $80/square  + $90/square  + $90/square  + $90/square".
   - The +$80 sits under Factory White. The three +$90 sit under Paint 1 Side, 2 Sides 1 Colour and 2 Sides 2 Colours.
   - In the text layer the Direct Glazed version is split as "+ | $90/square", which is harmless.
3. **Footnotes:** the SFB, plus "White SDL: +80/square" and "Painted SDL: +90/square".
   - Rows 28x64 and 28x80 have the Panel value "up to 42" Flush".
4. **Anomalies:** none in values. The paint deltas are standard.

## Page 29 - SDLs on Obscure Glass ("Standard triple glazed with lead tape")

1. **Value/label differences:** none. "764" and "2217" labels as on p28.
2. **Visual-only content:** the same +$80/+$90 per-square lines under all three tables.
3. **Footnotes:** the SFB, plus White SDL +80/square and Painted SDL +90/square.
4. **Anomaly (printed in the image, likely copy-paste):** in the Direct Glazed SIDELITE table, **"up to 27.5""** has exactly the same prices as **"up to 25.5""**: $2,965 / $3,195 / $3,275 / $3,335.
   - Every other step is +$108. By the pattern, 27.5" should be about $3,073 / $3,303 / $3,383 / $3,443.

## Page 30 - Internal Blinds ("functionality: Raise, Lower & Tilt")

1. **Value/label differences:** none. 8 DOOR rows and 3 sidelite rows match.
2. **Visual-only content:** none.
3. **Footnotes:** SFB lines 1-7, then "7'0" System: +$275/box" and "8'0" System: +$375/box**v**". The "boxv" typo is in the image too.
   - There is no Direct Glazed line.
   - No `**` rows exist on this page, but the footnote still references Victoria and Soho.
4. **Anomalies:**
   - 20x64 equals 22x64 ($2,447 / $3,067 / $3,297 / $3,477).
   - 20x80 equals 22x80 ($2,906 / $3,526 / $3,756 / $3,936).
   - These may be deliberate, but they look copy-pasted.

## Page 31 - SOLUTION SERIES: Clear/LowE

1. **Value/label differences:** none in prices (15 DOOR rows and 1 sidelite row match).
   - The rows "22x08 or (x4)" and "22x08 or (x5)" read exactly like that in the image too. The second size is missing from the table itself; the diagram caption says **22" x 8"/10" (x4)**, so the row should read "22x08 or 10 (x4)".
2. **Visual-only content:** a strip of 9 slab diagrams (blue gradient lites) with captions. The text layer has these captions garbled ("O set" for "Offset", because the "ff" ligature is lost). Left to right:
   1. "7" x 64" - Offset": one tall narrow lite, offset toward the left or hinge side.
   2. "8" x 6" (x5) - Offset": 5 small lites stacked vertically, offset left.
   3. "8" x 8" (x4)": 4 small square lites stacked, centred.
   4. "22" x 3.5" (x6)": 6 thin horizontal slot lites.
   5. "22" x 8"/10" (x4)": 4 horizontal rectangular lites.
   6. "22" x 17"": 3 stacked lites. This is the 22x17 (x3) row, although the caption omits "(x3)".
   7. "22" x 15.25"": one lite at the top.
   8. "22" x 15.25  ", 3 Lite": one top lite divided into 3 vertical panes. The odd spacing is printed that way.
   9. "22" x 15.25", 6-Lite": a top lite divided 3 x 2.
   - Only one multiplicity is pictured per family (x5, x4, x6), while the table also prices x6/x5/x7.
3. **Footnotes:**
   - Lines printed: Panels, Hinges, Jambs, Sill, Black Anodized Sill, 7'0" System and 8'0" System, all as in the SFB.
   - Lines not printed: Standard Glass Frame, Contemporary glass frame and Direct Glazed.
   - An extra block: "SOLUTION SERIES glass frames:" with three bullets: "Shaker style low profile.", "No screws, plugs, or holes." and "Textured vertical grain pattern."
4. **Anomalies:** the missing "10" in the 22x08 rows (see item 1).

## Page 32 - SOLUTION SERIES: Sandblast, Mistlite, Narrow Reed, Rain, Sable

1. **Value/label differences:** none.
2. **Visual-only content:** the same 9 diagrams and captions as p31.
3. **Footnotes:** same as p31.
4. **Anomaly (printed):** several decorative-glass (p32) prices are **lower** than the same size in Clear/LowE (p31):

   | Size | p32 (decorative) | p31 (Clear/LowE) |
   |---|---|---|
   | 08x06 (x5) | $2,743 | $2,753 |
   | 08x06 (x6) | $2,984 | $2,996 |
   | 22x03.5 (x4) | $2,830 | $2,834 |
   | 22x03.5 (x5) | $3,153 | $3,158 |
   | 22x03.5 (x6) | $3,476 | $3,482 |
   | 22x03.5 (x7) | $3,799 | $3,806 |
   | 22x08 (x4) | $3,098 | $3,110 |
   | 22x08 (x5) | $3,488 | $3,503 |

   The other rows are higher on p32. This looks implausible.

## Page 33 - SOLUTION SERIES: Chords

1. **Value/label differences:** none.
2. **Visual-only content:** the same 9 diagrams as p31.
3. **Footnotes:** same as p31.
4. **Anomalies:** none found.

## Page 34 - Elevation Venting Units ("functionality: Mechanically Assisted")

1. **Value/label differences:** none. All five sub-tables match row for row.
2. **Visual-only content:** none. There is **no footnote or spec block on this page** (no hinge, jamb or sill lines) and no sidelite table.
3. **Sub-tables.** Every sub-table header is suffixed "(standard white frame in & out)". Columns are FW / Paint 1 Side / 2 Sides 1 Colour / 2 Sides 2 Colours.

**Novatech Elevation: Clear/LowE**

| Size | Panel | FW | 1 Side | 2S 1C | 2S 2C |
|---|---|---|---|---|---|
| 22x36 | London | $2,689 | $3,309 | $3,539 | $3,719 |
| 22x48 | Orleans | $2,660 | $3,280 | $3,510 | $3,690 |
| 22x48 | Soho | $2,780 | $3,400 | $3,630 | $3,810 |
| 20x64 | Flush | $2,764 | $3,384 | $3,614 | $3,794 |
| 22x64 | Flush | $2,818 | $3,438 | $3,668 | $3,848 |

**Novatech Elevation: Grills, Standard (CAFA) or Georgian (CAAL)**

| Size | Panel | FW | 1 Side | 2S 1C | 2S 2C |
|---|---|---|---|---|---|
| 22x36 | London | $3,186 | $3,806 | $4,036 | $4,216 |
| 22x48 | Orleans | $3,266 | $3,886 | $4,116 | $4,296 |
| 22x48 | Soho | $3,386 | $4,006 | $4,236 | $4,416 |
| 20x64 | Flush | $3,718 | $4,338 | $4,568 | $4,748 |
| 22x64 | Flush | $3,428 | $4,048 | $4,278 | $4,458 |

**Novatech Elevation: Edge, Masterline, Optika, Transit**

| Size | Panel | FW | 1 Side | 2S 1C | 2S 2C |
|---|---|---|---|---|---|
| 22x36 | London | $2,833 | $3,453 | $3,683 | $3,863 |
| 22x48 | Orleans | $3,096 | $3,716 | $3,946 | $4,126 |
| 22x48 | Soho | $3,216 | $3,836 | $4,066 | $4,246 |
| 20x64 | Flush | $3,371 | $3,991 | $4,221 | $4,401 |
| 22x64 | Flush | $3,422 | $4,042 | $4,272 | $4,452 |

**Novatech Elevation: V-Groove-Murano-Clear**

| Size | Panel | FW | 1 Side | 2S 1C | 2S 2C |
|---|---|---|---|---|---|
| 22x36 | London | $3,198 | $3,818 | $4,048 | $4,228 |
| 22x48 | Orleans | $3,231 | $3,851 | $4,081 | $4,261 |
| 22x48 | Soho | $3,351 | $3,971 | $4,201 | $4,381 |
| 20x64 | Flush | $3,403 | $4,023 | $4,253 | $4,433 |
| 22x64 | Flush | $3,475 | $4,095 | $4,325 | $4,505 |

**Novatech Elevation: V-Groove-Murano-Sandblast**

| Size | Panel | FW | 1 Side | 2S 1C | 2S 2C |
|---|---|---|---|---|---|
| 22x36 | London | $3,418 | $4,038 | $4,268 | $4,448 |
| 22x48 | Orleans | $3,551 | $4,171 | $4,401 | $4,581 |
| 22x48 | Soho | $3,671 | $4,291 | $4,521 | $4,701 |
| 20x64 | Flush | $3,886 | $4,506 | $4,736 | $4,916 |
| 22x64 | Flush | $3,974 | $4,594 | $4,824 | $5,004 |

4. **Anomalies:**
   - In the Grills table, 20x64 ($3,718) is $290 **more** than the larger 22x64 ($3,428). In every other Elevation sub-table, 20x64 is below 22x64.
   - In Clear/LowE, 22x48 Orleans ($2,660) is cheaper than 22x36 London ($2,689).
   - The Soho row is exactly Orleans +$120 in every sub-table, which is consistent.

## Page 35 - Q550 & Peak 470 Venting Units

1. **Value/label differences:** none. The image's second header reads "Novatech Q550: **Grills/LowE**", the same as the text.
2. **Visual-only content:** in the Grills/LowE table, "Flush" (20x64 and 22x64), London, Orleans and Soho are underlined, but no link exists there. There is no footnote block on this page.
3. **Sub-tables.** Headers carry "(standard white frame in & out)", except the BLACK-OUT tables, which carry "(black out / white in)".

**Novatech Q550: Clear/LowE - DOOR**

| Size | Panel | FW | 1 Side | 2S 1C | 2S 2C |
|---|---|---|---|---|---|
| 18x36 | Flush | $2,502 | $3,122 | $3,352 | $3,532 |
| 18x48 | Flush | $2,687 | $3,307 | $3,537 | $3,717 |
| 18x64 | Flush | $2,935 | $3,555 | $3,785 | $3,965 |
| 20x36 | 6-Panel | $2,532 | $3,152 | $3,382 | $3,562 |
| 20x48 | Flush | $2,687 | $3,307 | $3,537 | $3,717 |
| 20x64 | Flush | $2,936 | $3,556 | $3,786 | $3,966 |
| 22x36 | London | $2,662 | $3,282 | $3,512 | $3,692 |
| 22x48 | Orleans | $2,757 | $3,377 | $3,607 | $3,787 |
| 22x48 | Soho | $2,877 | $3,497 | $3,727 | $3,907 |
| 22x64 | Flush | $3,022 | $3,642 | $3,872 | $4,052 |

Q550 Clear/LowE - Panel SIDELITE: 9x64, Flush, $2,299 / $2,799 / $2,989 / $3,159.

**Novatech Q550: Grills/LowE - DOOR**

| Size | Panel | FW | 1 Side | 2S 1C | 2S 2C |
|---|---|---|---|---|---|
| 20x64 | Flush | $2,809 | $3,429 | $3,659 | $3,839 |
| 22x36 | London | $2,737 | $3,357 | $3,587 | $3,767 |
| 22x48 | Orleans | $2,755 | $3,375 | $3,605 | $3,785 |
| 22x48 | Soho | $2,875 | $3,495 | $3,725 | $3,905 |
| 22x64 | Flush | $2,835 | $3,455 | $3,685 | $3,865 |

Q550 Grills/LowE - Panel SIDELITE: 9x64, Flush, $2,442 / $2,942 / $3,132 / $3,302.

**Novatech Peak 470**

| Size | Panel | FW | 1 Side | 2S 1C | 2S 2C |
|---|---|---|---|---|---|
| 22x36 - Clear/LowE | London | $2,352 | $2,972 | $3,202 | $3,382 |
| 22x36 - Grills | London | $2,579 | $3,199 | $3,429 | $3,609 |
| 22x36 - Decorative | London | $2,604 | $3,224 | $3,454 | $3,634 |

**Novatech Peak 470: BLACK-OUT**

| Size | Panel | FW | 1 Side | 2S 1C | 2S 2C |
|---|---|---|---|---|---|
| 22x36 - Clear/LowE | London | $2,632 | $3,252 | $3,482 | $3,662 |
| 22x36 - Decorative | London | $2,781 | $3,401 | $3,631 | $3,811 |

There is no Grills row in BLACK-OUT.

4. **Anomalies (printed):** Q550 **Grills are cheaper than Clear** for:
   - 20x64: $2,809 vs $2,936
   - 22x48 Orleans: $2,755 vs $2,757
   - 22x48 Soho: $2,875 vs $2,877
   - 22x64: $2,835 vs $3,022

   Only 22x36 is higher. Also, 18x48 equals 20x48 ($2,687 ...).

## Page 36 - Elite & EZ Lift Venting Units ("by: Trimlite")

1. **Value/label differences:** none in values.
   - Text-layer hazard: the label "22x64 (22x36 with **Extension**)" wraps onto two lines in the cell ("Extension" in bold). The text layer emits "Extension)" as its own line after the price row, so a line parser could create a bogus row or truncate the label.
2. **Visual-only content:** Soho is not underlined on this page (no link). There is no footnote block.
3. **Sub-tables.**

**Trimlite Elite (standard white frame in & out)**

| Size | Panel | FW | 1 Side | 2S 1C | 2S 2C |
|---|---|---|---|---|---|
| 20x36 | 6-Panel | $2,106 | $2,726 | $2,956 | $3,136 |
| 22x36 | London | $2,236 | $2,856 | $3,086 | $3,266 |
| 22x36 - Rain Glass | London | $2,874 | $3,494 | $3,724 | $3,904 |
| 22x36 - Grills | London | $2,297 | $2,917 | $3,147 | $3,327 |
| 22x64 (22x36 with Extension) | Flush | $2,389 | $3,009 | $3,239 | $3,419 |

**Trimlite Elite: BLACK-OUT (black out / white in)**

| Size | Panel | FW | 1 Side | 2S 1C | 2S 2C |
|---|---|---|---|---|---|
| 22x36 | London | $2,333 | $2,953 | $3,183 | $3,363 |

**Trimlite EZ Lift (standard white frame in & out)**

| Size | Panel | FW | 1 Side | 2S 1C | 2S 2C |
|---|---|---|---|---|---|
| 22x48 | Orleans | $2,718 | $3,338 | $3,568 | $3,748 |
| 22x48 | Soho | $2,838 | $3,458 | $3,688 | $3,868 |
| 20x64 | Flush | $2,783 | $3,403 | $3,633 | $3,813 |
| 22x64 | Flush | $2,770 | $3,390 | $3,620 | $3,800 |

**Trimlite EZ Lift: BLACK-OUT (black out / white in)**

| Size | Panel | FW | 1 Side | 2S 1C | 2S 2C |
|---|---|---|---|---|---|
| 22x48 | Orleans | $2,929 | $3,549 | $3,779 | $3,959 |
| 22x48 | Soho | $3,049 | $3,669 | $3,899 | $4,079 |
| 20x64 | Flush | $3,014 | $3,634 | $3,864 | $4,044 |
| 22x64 | Flush | $3,005 | $3,625 | $3,855 | $4,035 |

4. **Anomalies:**
   - EZ Lift 22x64 is cheaper than 20x64, both standard ($2,770 vs $2,783) and BLACK-OUT ($3,005 vs $3,014).
   - Elite BLACK-OUT has only a London Clear row.

## Page 37 - Executive Panels ("Solid doors, no glass") and "Executive Panels - Below doorlite glass"

1. **Value/label differences:** none in the two price tables. All 10 DOOR rows and the 2 + 2 adder rows match.
2. **Visual-only content.** This page is important: the diagram's size legend is **not in the text layer**, which has only loose letters.
   - **Title:** "6'8" EXECUTIVE DOORS DISPLAY PANEL PLACEMENT", with the subtitle "(Letters are for reference purposes only)". Neither is in the text layer.
   - **"Panel Size" legend.** Not in the text layer.

     | Letter | Size |
     |---|---|
     | A | 20" X 64" |
     | B | 22" x 64" |
     | C | 22" x 48" |
     | D | 22" X 11" |
     | E | 22" X 8 1/2" |
     | F | 22" X 36" |
     | G | 22" X 20 3/4" |
     | H | 22" X 17" |
     | I | 8" X 43" |
     | J | 22" X 53" |
     | K | 8" X 11" |
     | L | 8" X 20 3/4" |
     | M | 7" X 11" |

   - **Top row: 5 solid door slabs with raised-moulding panels, brackets and letter bubbles.**
     1. A single full-height tall panel, bracketed **A** and **B**. The same position is either 20x64 (A) or 22x64 (B).
     2. A tall upper panel **C** (22x48) and a short horizontal lower panel **D** (22x11).
     3. An upper panel **F** (22x36) and a near-square lower panel **G** (22x20 3/4).
     4. Three panels: **E** (22x8 1/2) at top, **F** (22x36) in the middle, **E** (22x8 1/2) at the bottom.
     5. Three equal panels **H, H, H** (22x17 each).
   - **Bottom row.**
     6. A door with a **glass lite** (grey) across the top and, below it, two narrow vertical raised panels side by side, bracketed **I** (8x43).
     7. A solid door with a tall panel **J** (22x53) and a bottom panel **E** (22x8 1/2).
     8. A narrow sidelite with a tall glass lite and a small square panel **K** (8x11) at the bottom.
     9. A narrow sidelite with a glass lite and panel **L** (8x20 3/4) below.
     10. A narrow sidelite with a short glass lite and a tall panel **I** (8x43) below.
   - **M (7x11)** appears only in the legend. No visible diagram uses it.
   - **Hidden text layer.**
     - Every diagram letter exists **twice** in the text layer. The second copy is shifted 63 pt left and is not visible.
     - There is also a third, invisible row of letters "B, D, C, G, D, D, C, G, G, G, M, G" at y = -68 to +3 pt, which is at or below the page's bottom edge. This looks like a larger artwork with an extra row of diagrams (including an M position) that is clipped off the page.
     - This explains the scrambled letter salad in `st_clean.txt` (lines 1397-1413).
   - **How the table labels map to the diagrams.**
     - "22x17 (x3)" is diagram 5: three H panels.
     - "22x36 / 22x20.75 (F/G)" is diagram 3: F (22x36) upper plus G (22x20 3/4) lower.
     - "22x48 / 22x11 (C/D)" is diagram 2: C (22x48) upper plus D (22x11) lower.
     - "22x64" is diagram 1 using position B: a single 22x64 panel.
     - "22x64 / 22x11 (B/D)" means B (22x64) plus D (22x11). **This combination is not drawn.** Diagram 1 shows B alone and D only appears in diagram 2; by analogy it is a tall B panel with a D panel below.
     - The 28x rows ("Custom 28x17 (x3)", "28x36 / 28x20.75", "28x48 / 28x11", "28x64 / 28x11", "28x64", Panel "42" Flush") have no letters. They are the 28"-wide versions of the same layouts for a 42" slab.
     - Diagram 4 (E/F/E), diagram 7 (J/E) and size A (20x64) have **no priced row** in the table.
   - **"Below doorlite glass" adder table.** This is a separate heading block, "Executive Panels | 6'8" / Below doorlite glass". It contains:
     - DOOR: standard sizes +$807 / +$952 / +$1,097 / +$1,097; custom sizes +$1,207 / +$1,352 / +$1,497 / +$1,497
     - Panel SIDELITE: standard sizes +$722 / +$867 / +$1,012 / +$1,012; custom sizes +$1,122 / +$1,267 / +$1,412 / +$1,412
     - Columns are FW / Paint 1 Side / 2 Sides 1 Colour / 2 Sides 2 Colours.
     - These are **adders**, not full prices. They match the bottom-row diagrams (6, 8, 9, 10), where executive raised panels (I, K, L) sit **below a glass lite** on a door or a sidelite. They add executive panels under the doorlite of a glass door or sidelite priced elsewhere.
     - The page does not say which base price the adder goes onto, and does not define which sizes count as "standard" vs "custom".
3. **Footnotes:** Panels, Hinges, Jambs, Sill, Black Anodized Sill, 7'0" System and 8'0" System, all as in the SFB. No glass-frame lines.
4. **Anomalies:**
   - Paint deltas for the **22x rows are +720/+950/+1,130**, while the 28x (42") rows and every glass page use +620/+850/+1,030. The narrower door has the higher paint upcharge.
   - In both adder tables, "2 Sides 2 Colours" equals "2 Sides 1 Colour" (+$1,097/+$1,097 and +$1,012/+$1,012).
   - 22x64/22x11 (B/D) at $3,595 is cheaper than 22x48/22x11 (C/D) at $3,618. The same happens for 28x64/28x11 ($4,395) vs 28x48/28x11 ($4,418).

## Page 38 - Solid Panel Doors ("No Glass")

1. **Value/label differences:** none. All 15 DOOR rows and 2 sidelite rows match.
   - Text-layer quirk: the sidelite header "Upcharge" is fused as "Panel SIDELITEUpcharge". In the image, **Upcharge is its own first column** of the sidelite table, followed by FW / Paint 1 Side / 2 Sides 1 Colour / 2 Sides 2 Colours.
2. **Visual-only content.** **No panel photos or drawings appear on this page.** The page has no image XObjects, so no panel is pictured and there are no captions.
   - Panel names in the DOOR table that are underlined links: Orleans, London, Victoria, Soho, Sydney, Oso, Vog, Linea, Era and Tao. Oso, Vog, Linea, Era and Tao link to "...-contemporary" pages.
   - Not linked: Flush, 6 Panel, 2P Camber Top, 3 Panel and 2P Planked Cam Top.
   - **"Upcharge used for pricing with glass" column.** The header reads "**Upcharge** used for / pricing with glass" in italics with "Upcharge" bold.

     | Panel | Upcharge |
     |---|---|
     | Flush | "base" (grey italic) |
     | 6 Panel | + $30.00 |
     | Orleans | + $70.00 |
     | 2P Camber Top | + $120.00 |
     | 3 Panel | + $120.00 |
     | London | + $160.00 |
     | 2P Planked Cam Top | + $180.00 |
     | Victoria, Soho, Sydney, Oso, Vog, Linea | + $190.00 |
     | Era, Tao | + $290.00 |

     - Each value is exactly that panel's Factory White price minus Flush ($1,538). It also equals the p46 "PARTS: Steel Panels" price minus Flush $550.
     - The page gives no further explanation. The implied use is the panel-design premium over a flush slab, applied when a glass door is ordered on that panel style. That is an inference, not stated.
   - **Panel SIDELITE table:**
     - Flush: Upcharge "base", $1,222 / $1,772 / $1,952 / $2,092
     - Embossed: Upcharge "+ $95.00", $1,317 / $1,867 / $2,047 / $2,187
     - The page does **not** picture or name which sidelite panels are "Embossed". No sidelite panel names appear anywhere on the page.
3. **Footnotes (verbatim):**
   - "Panels: Novatech Steel Insulated N600"
   - "Hinges: Ball Bearing Steel (Heavy-Duty Stainless Steel and Matte Black hinges +$60/door)."
   - "Jambs: Smooth Composite PVC (available in 4-5/8", *5-1/4", 6-5/8", and *7-5/8").  *extra charges apply"
   - "Sill: Fixed - Mill (Clear Anodized)"
   - "Hinges: Heavy-Duty Stainless Steel (available in Satin Nickel and Black). Other finishes available in steel: Patina and Brass."
   - "Standard Sizes: 30", 32", 34", 36""
   - "Non-Standard Sizes: +$375 (24", 26", 28", 38", 40", 42", and all *other custom sizes)  *extended lead times by 10 - 12 weeks."
   - "20 min. Fire Rating: +$230 (includes self-closing hinges)."
   - "7'0" System: +$275/box"
   - "8'0" System: +$375/box"
   - The "Black Anodized Sill: +$20/box" line is **absent** on this page.
4. **Anomalies:**
   - There are two conflicting "Hinges:" lines: Ball Bearing Steel standard with +$60 for heavy-duty, vs Heavy-Duty Stainless as the spec.
   - "Non-Standard Sizes: +$375 (... and all other custom sizes)" conflicts with p40, which prices "Custom-Size Steel Panels (lead time extended by 10 - 12 weeks)" at **$750** and limits the $375 non-standard panels to "(Flush Only)".
   - Paint deltas are +550/+730/+870 for both door and sidelite. These differ from the p44 paint list (Door panel one side $320 and so on); the table deltas likely include frame and brickmould paint.

## Page 39 - Transoms

1. **Value/label differences:** none.
   - RECTANGLES Frame: $175 / $405 / $485 / $545. SHAPES Frame: $385 / $695 / $850 / $940.
   - All glass per-sq.ft. charges match.
2. **Visual-only content:** none.
3. **Footnotes (verbatim):**
   - Rectangles:
     - "Minimum Glass Charge: 10 sq.ft."
     - "Glass Tempering: +$160 / glass unit"
     - "Casing Trim: not included"
     - The rows Glass with Grills, Clear Glass with SDLs and Obscure Glass with SDLs carry "(additional charges per box apply)".
   - Shapes:
     - "Minimum Glass Charge: Single Door 10 sq.ft. / Other configurations 15 sq.ft."
     - "Glass Tempering: +$320 / glass unit"
     - "Casing Trim: Colonial 3-1/2" included (curve top and sides)"
     - Only the two SDL rows carry "(additional charges per box apply)". The Shapes "Glass with Grills" row (+$225) does not, unlike the Rectangles version.
4. **Anomalies:** in Shapes, Sandblast/Obscure and Glass with Grills are both +$225/sq.ft. This is plausible.

## Page 40 - Extras & Options (Custom Sizing, Operating Sidelite, Sills, Jambs & Brickmould, Casing Trim, Screens)

1. **Value/label differences:** none.
2. **Visual-only content:**
   - **Red text:** "(NOT compatiable with the 7-5/8" jambs)" on both Outswing Sill rows. In the screen footnote, "ONLY with 6-5/8" and 7-1/4" Jambs, and assembled Regular 2" BM with no more than 1" reveal." is red.
   - "[NEW]" on "Composite 7-5/8 Jamb" is plain text with a bold NEW, not a graphic badge. "7-5/8" is bold.
   - "DOOR FRAME & SILL DEPTHS" is an underlined link to https://www.palmadoor.com/door-frame-depths.
3. **Footnotes and fine print (verbatim):**
   - "Cut-Down (per Door Panel or Sidelite Panel)"
   - "Non-Standard Panles 24", 26", 28", 38", 40", 42" Steel Slab (Flush Only)"
   - "Custom-Size Steel Panels (lead time extended by 10 - 12 weeks)"
   - "7' System - 84" Slab (per Door or Sidelite)"
   - "8' System - 95" Slab (per Door or Sidelite)"
   - "Hinged Sidelite Panel with Astragal (for standard panel sizes only)"
   - "(included with white doors)" / "(included with painted doors)" on the sills
   - "Composite 5-1/4 Jamb / box (available in smooth ONLY)"
   - "(available in smooth and woodgrain)" on 7-1/4 and 7-5/8
   - Casing note: "Poplar 3-1/2" Colonial Casing. / For Backband add 50%"
   - Screen notes: "*Compatible ONLY with 6-5/8" and 7-1/4" Jambs, and assembled Regular 2" BM with no more than 1" reveal." and "*For Double Door:  RETRACTABLE Screen cost x 2". The `*` attaches to the four RETRACTABLE screen rows.
4. **Anomalies:**
   - "Hight Performance Fixed Sill - Black Anodized / box (included with painted doors)" is still priced **$20**, which contradicts "included".
   - Casing "Double Door + 2 Sidelites" ($700) equals "Single Door + 2 Sidelites" ($700), while Double Door alone is $600. This looks copy-pasted.
   - An 84" Painted Brickmould is listed, but there is no 84" White row.
   - 7-1/4" jamb vs the SFB jamb list (see Global notes).
   - Typos, all in the image: "Panles", "Hight", "compatiable", "Andodized".

## Page 41 - Extras & Options (FERCO locks and handles, Other Multi-Point Handles, Smart Lock)

1. **Value/label differences:** none.
   - "Ferco Mortise Astragal Lock $470" and "Key Alike (same brand only) $80" are merged cells spanning both the Active and Dummy columns.
   - All Tedee prices are likewise merged across Active and Dummy. They are not Active-only.
2. **Visual-only content:** product photos with captions:
   - "Tedee-PRO Smart Lock": a silver and a black cylinder lock.
   - "Tedee Keypad": **one white and one black** keypad.
   - "Tedee WiFi Bridge": a white plug-in unit.
   - "Tedee Knobs": one black knob and one bronze/champagne-toned knob.
   - "Tedee Door Sensor": two white sensor pieces.
   - "Features and more: palmadoor.com/hardware/tedee-pro" is a link.
   - "Smart Homes Systems" is underlined but not linked.
   - "[NEW]" on the two Berlin rows is plain text, not a badge.
3. **Footnotes:** "*Tedee Smart Lock is only compatible with all FERCO handles, Miami handles  and all Pull Bars". The `*` attaches to "*Tedee-PRO Smart Lock".
4. **Anomalies:**
   - The keypad row says "(Black ONLY)", but the photo shows a white keypad too.
   - The knob row says "(Black and SN ONLY)"; the second knob photo looks bronze-toned, but I cannot be sure it is not satin nickel.
   - "$1400" has no thousands separator. This is cosmetic.

## Page 42 - Straight Pull Bars, "H" Type - pull bars on both sides

1. **Value/label differences.** The text layer interleaves **two complete price layers**. A position dump shows one run of text at x = 86 pt, which is not visible, and one at x = 106 pt, which is the visible layer. Only the x = 106 pt layer is visible in the render.
2. **Visible prices.** Rows are the finish, columns are Round / Square / Rectangle. Shape icons above the columns are a circle, a square and a wide rectangle.

**"with Multipoint Lock and T-Bar Handle"**

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

Side caption: "T-bar handle prevents lockouts - otherwise, a key is required to open the door." Photo: a grey door with a full-height pull bar and a lock/T-bar at mid-height on the edge.

**"with Multipoint Lock"**

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

Side caption: "A key is required to open the door."

3. **Hidden or leftover layer (NOT visible).** It is identical in all four pull-bar tables on p42 and p43, so it ignores the lock configuration. It appears to be an older, single price grid left behind the new table:

   | Length | Finish | Round | Square | Rectangle |
   |---|---|---|---|---|
   | 36" | Satin | $1,850 | $1,900 | $1,940 |
   | 36" | Black | $1,900 | $1,940 | $1,980 |
   | 36" | Gold | $2,110.00 | $2,150.00 | $2,240.00 |
   | 48" | Satin | $1,940 | $2,000 | $2,070 |
   | 48" | Black | $2,000 | $2,070 | $2,130 |
   | 48" | Gold | $2,240.00 | $2,300.00 | $2,410.00 |
   | 60" | Satin | $2,110 | $2,200 | $2,280 |
   | 60" | Black | $2,170 | $2,260 | $2,350 |
   | 60" | Gold | $2,430.00 | $2,520.00 | $2,650.00 |
   | 72" | Satin | $2,240 | $2,350 | $2,450 |
   | 72" | Black | $2,320 | $2,430 | $2,540 |
   | 72" | Gold | $2,600.00 | $2,710.00 | $2,860.00 |
   | 84" | Satin | $2,390 | $2,520 | $2,650 |
   | 84" | Black | $2,470 | $2,600 | $2,730 |
   | 84" | Gold | $2,770.00 | $2,900.00 | $3,070.00 |

   **Any price the quoting tool took from the $1,850... series is wrong.**
4. **Consistency check on the visible layer:** T-Bar = Multipoint + $360 in every one of the 45 cells.

## Page 43 - Straight Pull Bars, "H" Type (continued)

1. **Value/label differences:** the same two-layer problem as p42. The hidden x = 86 pt layer is the identical $1,850... grid shown above.
2. **Visible prices.**

**"with DUMMY handle for inactive panel"**

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

Side caption: "The dummy handle is used on the inactive panel of a double door." Photo: a door with a pull bar only.

**"with Roller Latches and Deadbolt Bore"**

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

Side caption: "Deadbolt prep only - deadbolt not included." Photo: a door with a pull bar, roller latches at the top and bottom of the edge, and bore holes.

3. **Consistency check on the visible layers:** relative to the Dummy grid, every cell is offset by a constant:
   - Roller Latch = Dummy + $540
   - Multipoint = Dummy + $1,405
   - Multipoint + T-Bar = Dummy + $1,765

   All four visible grids are internally consistent. The hidden grid does not follow any constant offset, which confirms it is a leftover.
4. **Anomalies:** only the hidden layer.
   - The Gold rows are highlighted pale yellow and printed with ".00"; Satin and Black have no cents. This is cosmetic.

## Page 44 - Extras & Options (Decorative Accents, Decorative Accessories, Paint, Glass Frame Options)

1. **Value/label differences:** none.
2. **Visual-only content.** **No photos or drawings appear on this page.** There are no image XObjects, only the table header bands. No accent is pictured on any slab, so nothing on this page shows:
   - which slab Uno, Vog, Oso or Era is mounted on (for example, whether Uno is on flush or Vog on the Vog panel)
   - whether accents are shown on one side or both
   - what the Vertical Accent or Reeded Wood look like

   Also:
   - The bold words in the table are the colour names: **Black**, **Black, Matte Gold** and **Matte Gold**.
   - "[NEW]" on "Vertical Accent Reeded Wood" is plain text, not a badge.
   - The accents listed are:
     - Vog 1, Vog 2 (Alunox/SS $650); Vog 2 Black $810
     - Oso 1, Oso 2 (Alunox/SS $650)
     - Uno 1, Uno 2, Uno 3 (Alunox/SS $650); "Uno 1, Uno 2, - Black, Matte Gold" $810; "Uno 3 - Black" $810
     - Era 1 (Alunox/SS $650); Era 1 Matte Gold $810
     - Vertical Accent for 7" x 64": Alunox/SS - Exterior Only $1,780; Black - Exterior Only $1,890
     - [NEW] Vertical Accent Reeded Wood $1,415
3. **Fine print:**
   - "(per side)" is on every Vog, Oso, Uno and Era row.
   - "- Exterior Only" is on both 7" x 64" Vertical Accent rows.
   - The Reeded Wood row has **no** size, side or exterior qualifier.
   - Paint list: Door panel One Side $320, 2 Sides same $420, 2 Sides different $500; Sidelite One Side $200, same $260, different $340; Glass frame One Side $70, 2 Sides same $120; Door Frame and Brickmould (per door or sidelite) $230; Trim supplied by customer (per pc, up to 8') $120; Custom Colour Match (colour chip required) $750.
   - Glass Frame Options: Contemporary PVC Smooth $80; Aluminum Colonial $260; Aluminum Urban Smooth $250; Aluminum Urban Textured $400.
4. **Anomalies:**
   - Oso has no Black or Gold option, and Vog 1 has no Black.
   - "Accesories" is misspelled.
   - The p44 paint adders do not equal the paint deltas built into the price tables (+620/+850/+1,030 for glass doors, +550/+730/+870 for solid).
     - The 1-side glass-door delta reconciles: $320 panel + $230 frame/BM + $70 glass frame = $620.
     - The 2-side deltas do not reconcile exactly.
   - There is no "Glass frame - 2 Sides (2 different colours)" line.

## Page 45 - Extras & Options (Glass Options, Triple Glazing Upcharge, Energy Star)

1. **Value/label differences.**
   - Glass Options match: Tempered Direct Glazed Sidelite or Rectangular Transom Glass $160; Tempered Shape Transom Glass $320; Laminated Glass $420.
   - Triple Glazing Upcharge matches all 13 rows. The header reads "Applicable ONLY for Novatech Silkscreen and V-Groove doorlites", with columns LowE 1x and LowE 2x.

     | Size | LowE 1x | LowE 2x |
     |---|---|---|
     | 07" x 64" | + $81 | + $96 |
     | 08" x 36" | + $78 | + $96 |
     | 08" x 48" | + $78 | + $96 |
     | 12" x 12" | + $78 | + $96 |
     | 20" x 64" | + $229 | + $285 |
     | 20" x 80" | + $288 | + $359 |
     | 22" x 09" | + $78 | + $96 |
     | 22" x 14" | + $78 | + $96 |
     | 22" x 17" | + $78 | + $96 |
     | 22" x 36" | + $143 | + $177 |
     | 22" x 48" | + $189 | + $236 |
     | 22" x 64" | + $254 | + $316 |
     | 22" x 80" | + $316 | + $393 |

   - Notes: there is no 22x12 row; "22" x 14"" presumably means 22x14-7/16; there are no 28x (42") rows.
2. **Visual-only content.**
   - A yellow curved arrow runs from the bottom-left of the Triple Glazing table down to a **yellow highlight box** around the two "1" Triple-glazed" rows of the Energy Star table.
   - The "Novatech" logo and the ENERGY STAR logo are raster images.
   - Four small raster door icons show 1/4, 1/2, 3/4 and full lite.
   - Cells are colour-coded: green = eligible, salmon = not eligible, grey = N/A.
3. **Energy Star table as it visually reads.**
   - Header text: "Energy Star Solutions" / "Entrance doors and door windows". An intro note says the Energy Star requirements became more restrictive from January 1st, 2020, and introduces the list of eligible Novatech products.
   - Columns:
     - **1/4 Lite, LQ (<=400 in2).** Dimensions: 8x36, 8x48, 12x12, 22x9, 22x12, 22x14-7/16, 22x17.
     - **1/2 Lite, LH (<=900 in2).** Dimensions: 7x64, 22x36, 8x36 (2x), 12x12 (3x or 4x), 22x9 (4x).
     - **3/4 Lite, LT (<=1100 in2).** Dimensions: 22x48, 22x12 (4x).
     - **Full lite (>1100 in2).** Dimensions: 20x64, 22x64, 22x17 (3x).

   | Glazing / unit | 1/4 Lite | 1/2 Lite | 3/4 Lite | Full lite |
   |---|---|---|---|---|
   | 1" Double-glazed - Low-E 1x (with or without grilles) | Eligible ✓ | Eligible in N300/600/700 doors and in N900 doors with extruded or molded frame ✓ | Not eligible ✗ | Not eligible ✗ |
   | **1" Triple-glazed - Low-E 1x (with or without grilles)** [yellow box] | Eligible ✓ | Eligible ✓ | Eligible in N300/600/700 doors and in N900 doors with extruded frame ✓ | Not eligible ✗ |
   | **1" Triple-glazed - Low-E 2x (with or without grilles)** [yellow box] | Eligible ✓ | Eligible ✓ | Eligible ✓ | Eligible in N300/600/700 doors with extruded or molded frame and in N900 doors with extruded frame ✓ |
   | 1" Stained glass - Low-E 1x | Eligible ✓ | Eligible ✓ | Eligible in N300/600/700 doors with extruded frame ✓ | N/A |
   | 1" Stained glass - Low-E 2x | N/A | N/A | N/A | Eligible in N300/600/700 doors with extruded frame ✓ |
   | Mini-Blinds | N/A | Not eligible ✗ | Not eligible ✗ | Not eligible ✗ |
   | Q470 Venting unit (with or without grilles) | N/A | Not eligible ✗ | N/A | N/A |
   | Q470+ Venting unit (with or without grilles) | N/A | Eligible in N300/600/700 doors ✓ | N/A | N/A |
   | Q550 Venting unit (with or without grilles) | N/A | Not eligible ✗ | Not eligible ✗ | Not eligible ✗ |
   | Q550+ Venting unit (with or without grilles) | N/A | Eligible in N300/600/700 doors ✓ | N/A | N/A |
   | Elevation Venting unit (with or without grilles) | N/A | Not eligible ✗ | Not eligible ✗ | Not eligible ✗ |
   | Elevation+ Venting unit (with or without grilles) | N/A | Eligible ✓ | N/A | N/A |

   - **Hidden text layer.** The embedded Energy Star graphic's text is present **three times**, overlapping, which causes the doubled-character garbage. It also contains **two rows that are NOT visible** on the rendered page:
     - "1-1/2'' Triple-glazed - Low-E 2x (with or without grilles)", with "Eligible with the Novatech High Performance door ✓" in all 4 columns
     - "1-1/2'' Stained glass - Low-E 1x", with "Eligible with the Novatech High Performance door ✓" in all 4 columns

     Any tool reading these rows from the text layer is reading content that is not shown on the page.
4. **Anomalies:**
   - Size naming differs between the two tables ("22" x 14"" vs 22x14-7/16).
   - The venting units priced on p34-36 use Q550/Elevation names; the Energy Star table distinguishes "Q550" vs "Q550+" and "Elevation" vs "Elevation+", but the price pages never use "+".
   - "Q470/Q470+" are listed while the price page says "Peak 470".

## Page 46 - Extras & Options (PARTS)

1. **Value/label differences:**
   - **"22x14-7/16 Colonial PVC Frame"** renders in the image as "22x14▯7/16". The hyphen is a missing-glyph box; this is visual only, and the text layer is correct. All prices match.
2. **Visual-only content:** the missing-glyph box above.
3. **Footnotes:** the column headers "Per set", "Per panel" and "Per set/pc". Fine print: "(Set of 3)" and "(Set of 2) - Satin Nickel and Patina" / "(Set of 2) - Matte Black".
4. **Anomalies:**
   - 22x36 Colonial PVC Frame ($161) equals 22x09 ($161) and is cheaper than 22x12 ($179) and 22x14-7/16 ($186). This is implausible for a frame four times larger and looks copy-pasted.
   - 8x48 ($179) equals 22x12 ($179).
   - Steel panel prices are consistent with the p38 upcharges (Flush $550 through Era/Tao $840).

## Page 47 - Standard Paint Colours

1. **Value/label differences:** none. 25 swatches match the text.
   - 5C1 Chesapeake Grey, 5C6 Marine Dusk, 5P2 Rockwell Blue, 5P3 Espresso, 5P5 Graphite
   - 5P6 Irion Ore, 5P9 Coastal Blue, 265 Antique Brown, 322 Red, 429 Ice White
   - 430 Rainwear White, 431 Bright White, 492 Cream, 501 Lambeth Beige, 502 Maize
   - 506 Windswept Smoke, 507 Tan, 508 Sandalwood, 509 Midnight Suft, 510 Canyon Clay
   - 513 Moonlit Moss, 514 Cashmere, 517 Sage, 522 Ivy Green, 523 Slate
2. **Visual-only content:** the colour swatches themselves.
3. **Footnotes:** none.
4. **Anomalies:** the typos "Irion Ore" and "Midnight Suft" are printed that way.

## Page 48 - Standard Paint Colours

1. **Value/label differences:** none. 25 swatches:
   - 525 Black, 532 Almond, 533 Antique Ivory, 534 Pearl, 535 Wedgewood Blue
   - 536 Dover Gray, 537 Mist Blue, 538 Wicker Cafe, 539 Venetian Red, 540 Sandstone
   - 542 Old World Blue, 543 Harvest Wheat, 547 Sable, 554 Chestnut Brown, 556 Forest Green
   - 557 Dark Drift, 559 Pebble, 562 Commercial Brown, 567 Burgundy, 568 Nutmeg
   - 569 Saddle Brown, 570 Storm, 571 Brownstone, 580 Juniper Grove, NS - Espresso
2. **Visual-only content:** the swatches.
3. **Footnotes:** none.
4. **Anomalies:** "NS - Espresso" and "5P3 Espresso" (p47) are two different codes with the same name.

## Page 49 - Standard Paint Colours

1. **Value/label differences:** none. There is a single swatch, "Standard (Polytex) White".
2. **Visual-only content:** one swatch; the rest of the page is blank.
3. **Footnotes:** none.
4. **Anomalies:** none. No differences.
