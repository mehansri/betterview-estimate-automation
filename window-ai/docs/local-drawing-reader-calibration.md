# Local drawing reader (Ollama) — calibration, 2026-10-16

First test of `DRAWINGS_PROVIDER=ollama` (`services/drawing_extraction.py`) on a real
permit-drawing set. **Verdict: not usable as built.** On this PC every page took
~15 minutes and produced no correct rows. The model *can* read the numbers, but
only from a high-resolution crop and with a plain-text answer format — see
[What would work](#what-would-work).

## Setup

| | |
|---|---|
| PC | i7-13620H, 16 GB RAM, no NVIDIA GPU — Ollama runs fully on CPU (`size_vram: 0`) |
| Models | `qwen2.5vl:7b` (Q4_K_M, 8.3B, 6.0 GB), `qwen2.5:7b` (text, not exercised here) |
| Module settings | defaults: `OLLAMA_PAGE_PX=1568`, `num_ctx 8192`, `num_predict 4096`, `OLLAMA_TIMEOUT=900`, `temperature 0`, JSON-schema `format` |
| Test set | `Stamp.pdf` — 71 Onaway Rd, **Mississauga** (custom 2-storey, Contempo Studio, permit BP 9NEW 25-8034). 29 pages, 36×24" sheets, 53.4 MB. Not a Brampton tract home — none was available yet. |
| Reference | Sheet A10 *Window & Door Schedules*: 38 window marks (32 wall windows WB1–5, WF1–11, WS1–16 + 6 skylights SK1–6) and doors DB1, DF1, DF2, DS1 (DG1 garage excluded). Transcribed by hand (Claude reading the sheet at 200 dpi) and cross-checked against the per-elevation W/H labels on the same sheet. There is no Anthropic key on this PC, so no server-side Claude run, and there is no measured job for this house. |

Harness: `extract_openings` called from `window-ai/.venv` with `_ollama_request` wrapped to
record Ollama's own token counts and durations. Tiling was done in the harness (render at
2× and cut 2×2 with 10 % overlap), not in the module. Scripts are kept outside the repo
in the session notes folder (`run_local_reader.py`, `probe.py`, `score.py`).

## The full set is refused before reading

`The drawing set is larger than 30 MB; split it or upload the elevations only.` It would
also exceed `OLLAMA_MAX_PAGES=12` (29 pages). Only A6–A10 (elevations + schedule,
pages 11–15) matter; everything below used those pages extracted on their own.

## Timing (CPU)

| Step | Measured |
|---|---|
| Cold model load | 15 s |
| Prefill (reading the image) | ~20 tokens/s. A 1568×1046 page = 2,461 tokens → **~100 s**. 2400 px page = 4,445 tokens → 248 s. 1800×1500 crop = 3,862 tokens → 208 s. Ollama does not downscale; tokens ≈ pixels / 784. |
| Generation | **~4.5–5 tokens/s.** The module's per-window JSON object costs ~100 tokens, so **~20 s per opening**. A 38-window schedule cannot fit in `num_predict 4096` at all. |
| Per page, as built | 850–1,300 s, every page ended at the token or context cap |

## Results

Scored against the A10 schedule (32 wall windows; size "right" = both dimensions within 1").

| Run | Time | Windows right | Missed | Junk / dup rows | What the app shows |
|---|---|---|---|---|---|
| A10 schedule sheet, 1568 px (default) | 902 s → **timeout** | 0 | all | — | "took longer than 900 s. Upload fewer pages…" — job fails |
| same, no timeout | 911 s | 0 | all | the same invented row ("Kitchen 30×48", tag "FRONT (WEST) ELEVATION") repeated until 4,096 tokens | "could not read any of the 1 page(s): the answer was cut off" |
| A6 front elevation, 1568 px | 852 s | 0 | all | "FRONT (WEST) ELEVATION, size not legible" repeated | same error |
| A10, `OLLAMA_PAGE_PX=2400` | 1,300 s | 0 | all | repetition loop filled the 8,192 context | same error |
| A10, 2×2 tiles (4 calls) | **3,303 s** | **0 / 32** | 0 (all marks listed) | 27 junk windows, 12 junk doors; 2 of 4 tiles cut off | 84 rows, none with a correct size |
| Schedule table cropped at 200 dpi, module schema | 891 s | 11 / 32 (+6/6 skylights) | 0 | 0, but cut off before doors → module discards it | "cut off" error |
| **Schedule crop, plain-text prompt** (`MARK \| W \| H`) | **160 s** | **32 / 32 (+6/6 skylights)** | 0 | 0 | n/a (not the module's format) |
| A10 whole page, plain-text prompt | 355 s | ~0 (columns shifted: sill height read as width) | — | loop invented SK7–SK33 | n/a |
| Front elevation panel crop at 200 dpi, plain-text prompt | 252 s | 11 / 13 front windows + DF1 | 0 | 0 | n/a |

### Failure modes seen

1. **Repetition loops on whole sheets.** At 1568 px and 2400 px the model latches onto the
   sheet title ("FRONT (WEST) ELEVATION") as a tag and repeats one row until the cap.
   This happened on every whole-page call and on 2 of 4 tiles. Since the cap is hit,
   `_ollama_json` raises `_UnreadableAnswer` and the page contributes nothing.
2. **Feet-inch conversion inside the schema answer.** With the JSON schema the model must
   convert `10' - 6"` to inches itself; it fails on anything ≥ 10 ft (10'-6" → 75 or 60,
   11'-0" → 84 or 72, 12'-0" → 108). In tiles it also wrote raw feet as inches (13×6, 18×10).
   Transcribing the text verbatim had no such errors.
3. **Small text.** At 1568 px a 36×24 sheet is ~44 dpi; schedule text is ~6 px tall and
   columns slip (sill height read as width). At 200 dpi the same table was read perfectly.
4. **Invented fields.** Every schema row got an elevation/location it could not know
   ("front", "Kitchen", "Theatre"), all marked `confidence: high`.
5. **Copying a neighbour.** WS3 got WS2's size (schema run); WS5 got WB5's size and
   WB5's height came out as its 3'-0" sill (elevation crop).

## Is higher `OLLAMA_PAGE_PX` or tiling worth the CPU time?

**No, not with the current prompt and schema.**
- 2400 px: 2.5× the prefill and more context used; the same loop, nothing read.
- 2×2 tiles: 3.6× the time of one page (55 min), every size wrong, 39 junk rows.

Resolution *does* matter (the 200 dpi crop was read perfectly), but only paired with the
plain-text answer format. A full 36×24 sheet at 200 dpi is 7200×4800 px ≈ 12 tiles of
~1800×1500, ≈ 3.5–4 min each ≈ 45 min per sheet — too slow to run on whole sets.

## What would work

Not implemented — recommendations for the next change to `drawing_extraction.py`:

1. **Two-stage read.** Ask the vision model only for `MARK | Width | Height` lines as printed
   (≈ 18 tokens/row instead of ≈ 100), then parse feet-inches and metric in Python and build
   the schema rows there. This alone turned 11/32 into 32/32 on the schedule crop and cut
   generation from 761 s to ~150 s.
2. **Read a crop, not the sheet.** Let the salesperson draw a box around the window
   schedule (or pick the schedule page and crop server-side), rendered at ~200 dpi with
   the long side ≤ ~1800 px. One schedule ≈ 3–5 min on this CPU. Elevation panels
   cropped the same way work too (12/14 marks right) at ~4 min each.
3. **Guard the loop.** Lower `num_predict` for the compact format (~1,200), drop rows that
   repeat an earlier row verbatim, and treat a sheet title as a tag as a failed read.
4. **Don't let one slow page kill the job.** A timeout raises `DrawingExtractionError`,
   which `_ollama_drawings` doesn't catch per page, so the whole job fails; its message
   ("Upload fewer pages") is misleading when there was one page. Catch it per page like
   `_UnreadableAnswer`, and keep `OLLAMA_TIMEOUT` above the realistic ~15 min.
5. **Elevation and room** should come from the panel title the crop was taken from, not
   from the model.
6. **Big PDFs.** Real permit sets exceed 30 MB / 12 pages. Page selection (thumbnails, pick
   A-sheets) before upload would avoid asking salespeople to split PDFs by hand.

Until then, use the Claude provider for drawings; keep Ollama for typed notes
(`qwen2.5:7b`, not measured here).

## Still to test

- A Brampton tract-home set (builder schedule + elevations), where schedules are smaller
  and often use size codes (`3048`).
- A measured job to compare against, instead of the schedule only.
- A Claude read of the same pages once an `ANTHROPIC_API_KEY` is available here.
- The two-stage format on a whole set, end to end through the review screen.
