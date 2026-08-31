# Deck Planner v1

Local-only Chrome web app for planning a **post-hole deck ledgered to a house** (Sevierville / Sevier County, TN) against **2024 IRC** facts that ship in this repo.

No accounts. No cloud backend. No Vercel. No GitHub Actions secrets. Save and open a project file in the browser.

The existing floating deck in an overhead photo is **backdrop only** — it is not an object.

## Run locally in Chrome

Requires Node.js 20+ (22 is fine).

```bash
npm install
npm run dev
```

Open the printed local URL (typically `http://localhost:5173`) in **Chrome**.

A drawing-only stand-in photo is at `public/sample-overhead.svg` (load it with **Photo**). It includes a marked 12'-0" sidewalk for scale. The brown rectangle is an existing floating deck — backdrop only; do not convert it.

To type-check and run unit tests:

```bash
npm test
npm run build
```

`npm run preview` serves the production build locally. Still no deploy.

## Success path

1. **Photo** — load one overhead image. The floating deck stays in the picture; do not convert it.
2. **Set scale** — tool *Set scale*, click two points on a known length, type feet-inches (`12-0`, `4` or `4'` = 4 feet / 48 in; `4"` = 4 inches).
3. **Outline** — draw a polygon for the **new** deck (not rectangle-only, no holes). Double-click or Enter to close. After placing, the app returns to **Select**. Click anywhere inside an object’s bounds (yellow highlight). Overlapping objects open a picker (smallest first). Drag or **Delete** / Backspace. **Esc** returns to Select. Undo covers move and delete.
4. **Ledger** — toolbar or left **Ledger** tool. Two clicks or click-drag along the house. This creates a ledger object (size, band/rim, flashing, fasteners), not only a house line. You do not need click-to-convert. Optional: convert a house-wall line. Fill needs outline **+ ledger**.
4b. **Draw box** — toolbar or left **Draw box**. Click-drag a rectangle (or two clicks). Then move, resize (corners), and rotate (extra knob). Set **Type** on the right: stairs or board. Stair width can default from the box when scale is set; rise is typed. One stair object type. No Existing / Reused / click-to-place stairs / Existing stairs (photo) / Board in photo convert buttons.
5. **Decking** — type product name, gap, and max joist spacing. Set joist and decking directions **before Fill**.
6. **Heights** — type deck, grade, door sill, stair rise. Grade is one height; the site is treated as flat. No door object.
7. **Fill** — places first posts and beams (you do not place them first), then joists, boards, blocking, rim, plus:
   - R321 guards on required open edges when typed deck − grade is **> 30 in** (36 in guard height; site flat)
   - R507.9.2 lateral-load devices (type the product; ledger bolts do not count)
   - R507.9.1.5 ledger flashing (type the product; do not invent one)
8. **No-dig** — polygons and points with a typed buffer. Fill **shifts** posts along the beam; it does not omit them.
9. **Undo** after edits. **Save** writes back to the same file after Open or a first Save (Chrome File System Access). **Save As** always picks a new name. **Ctrl/Cmd+S** / **Shift+S**. Filename and dirty `*` show in the toolbar. No account / cloud.
10. **Export** Letter PDF (plan + cut list + elevation) or PNG plan / cut list / elevation.

Snap increment starts **off**. You turn it on and set the increment.

**Ortho snap** starts **on** (toolbar / status **Ortho** toggle, separate from increment snap). While on, placing or moving objects constrains to the ledger axis and its perpendicular (world X/Y if there is no ledger). Breakers snap perpendicular to the ledger; the ledger itself stays axis-aligned. Turn Ortho off to place or move a diagonal beam. Arrow keys nudge the selection 1 in (Shift+arrow uses the increment, default 6 in). After you pick from the overlap picker, the next drag on that stack moves the selected object instead of reopening the picker. User-drawn drop beams lock an end onto a post they hit (post footprint or 1.5 in); collinear coplanar beams merge into one member (posts stay).

## Locked tools (Anthony leftover-button pass)

**Generic box, then Type:** stairs (one type); board in photo. No dedicated Existing Stairs / Reused / convert-existing-stairs / Board in photo buttons.

**Keep as they are:** Pan; Select; Set scale (two clicks + typed length); Measure (two clicks, does not change scale); Set origin (click; status bar live XY); New deck outline (polygon); Ledger (click or drag line along house); House wall (line convert); Post (click XY); Beam drop (two-click line, diagonals allowed when placed); Joist (two-click line); Breaker board (seam, then doubled joists vs blocking); Blocking (two-click); Rim (two-click); Guard (place tool; Fill still adds required R321 guards); No-dig zone (polygon); No-dig point (click + typed buffer).

Also: wheel zoom only over the work area; Save / Save As; bounds select + overlap picker. Cut-list row click selects those members. Typed waste % (empty = net only) on lumber/decking; hangers stay 1:1. No invented IRC spans.

Fill clips posts, beams, joists, and boards to the **outline polygon** (every inside run; it does not fill the bounding box or bridge voids / water). First drop-beam line is **~10 ft from the ledger** (parallel to it when `beamFillAngleDeg` is null — perpendicular to joists). Fill then **iterates**: add or shift orthogonal drop beams (diagonal only when an orthogonal chord cannot cover a joist) until every joist bay and cantilever is inside Table R507.6 for the joist size it will use, and every post-to-post run is ≤8 ft. If 2x8 @ 16 in works at ~10 ft, joists are 2x8. Posts are **6x6** with ground-contact treatment (4x4 only if you type a short height from Table R507.4); every beam has posts at both ends and ≤8 ft o.c. Rim is **not** a load-bearing beam. User-placed diagonals are kept; Fill supplies the rest. Missing Table R507.5(1) **size** cells are flagged; members are still placed (2-ply 2x8 is a label only). Span/cantilever/post-spacing leftover flags are not a substitute for moving members. No-dig shifts intermediate posts along the beam **inside** the outline (end posts stay on the ends and flag if they hit no-dig). A house-band no-dig does not skip the 10 ft line. Trex / decking boards **split at every breaker seam**. Cut list reports every post XY, beam/joist lengths, and decking **square footage of the outlined polygon minus gaps** plus piece lengths.

## What Fill will not do

- Create stairs
- Invent spans, snow, frost, footings, SKUs, or clearance gaps
- Invent Table R507.5(1) beam cells
- Use manufacturer catalogs
- Default to flush beams (drop beams only: joists on **top** of the beam)
- Treat rim as a beam or skip the 10 ft post line because of a ~2 ft house-band no-dig

## 2024 IRC in v1

Verified cells live in `src/irc/tables.ts` (R507.6, R507.6 cantilever, R507.7, R507.4 4x4 and 6x6/8x8, R507.9.1.3). Live load is **40 psf** (Table R301.5). Dead load 10 psf is baked into the R507 tables. There is **no site snow number**.

**Table R507.5(1)** Southern pine beam cells are **not** in the verified set. Fill still generates drop beams and flags the table: interpolation only for zero joist cantilever; no extrapolation; 2021 Table R507.5(5) does not exist in 2024. Enter the beam size.

**Table R507.4 4x6** cells are not in the verified set — the UI flags them instead of inventing intermediates.

Species **label** default is `Southern Yellow Pine No. 2 Prime` (Home Depot). **Table lookup** is Southern pine No. 2. There is no Prime table.

2x dimension lumber is laid out at standard US dressed sizes (`1.5 × 5.5 / 7.25 / 9.25 / 11.25`). Other products: type actual size.

Stairs v1: if width/rise are set — 36 in clear (R318.7.1); max riser 7-3/4 in, 3/8 in variation (R318.7.5.1). No run, stringer count, or handrail requirement. 2024 stairs are **R318.7** (not R311.7); guards are **R321** (not R312).

Cut list waste is **net only** until you type a waste percent (empty or 0 = net). That percent applies to dimension lumber and decking area/board lineal; hangers and counted hardware stay 1:1. Area/linear accessories use **your** coverage (sf/roll, count/box). No SKU catalog.

Post holes are **XY only**. No frost. No footing sizing.

## Project file

JSON (`*.deckplanner.json`) including the photo as a data URL. Everything stays on disk you choose. Undo is in-session only.

**Save** (Ctrl/Cmd+S) writes back to the same file after Open or a first Save (Chrome File System Access — the file handle is kept in the session). If the project has never been saved, Save acts like **Save As**. **Save As** (Ctrl/Cmd+Shift+S) always opens a picker. The toolbar shows the filename and a dirty `*`. No account or cloud.
