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
2. **Set scale** — tool *Set scale*, click two points on a known length, type feet-inches (`12-0` or `10' 6"`).
3. **Outline** — draw a polygon for the **new** deck (not rectangle-only, no holes). Double-click or Enter to close. After placing, the app returns to **Select**. Click anywhere inside an object’s bounds (yellow highlight). Overlapping objects open a picker (smallest first). Drag or **Delete** / Backspace. **Esc** returns to Select. Undo covers move and delete.
4. **Ledger** — toolbar or left **Ledger** tool. Two clicks or click-drag along the house. This creates a ledger object (size, band/rim, flashing, fasteners), not only a house line. You do not need click-to-convert. Optional: convert a house-wall line. Fill needs outline **+ ledger**.
4b. **Stairs** — toolbar or left **Stairs** (reused / existing). Click once to place. Type rise and width. Then Select / drag / Delete like other objects. Optional: click-to-convert existing stairs from the photo.
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

## What Fill will not do

- Create stairs or diagonal beams (you may place diagonal beams yourself)
- Invent spans, snow, frost, footings, SKUs, or clearance gaps
- Use manufacturer catalogs
- Default to flush beams (drop beams only: joists on **top** of the beam)

## 2024 IRC in v1

Verified cells live in `src/irc/tables.ts` (R507.6, R507.6 cantilever, R507.7, R507.4 4x4 and 6x6/8x8, R507.9.1.3). Live load is **40 psf** (Table R301.5). Dead load 10 psf is baked into the R507 tables. There is **no site snow number**.

**Table R507.5(1)** Southern pine beam cells are **not** in the verified set. Fill still generates drop beams and flags the table: interpolation only for zero joist cantilever; no extrapolation; 2021 Table R507.5(5) does not exist in 2024. Enter the beam size.

**Table R507.4 4x6** cells are not in the verified set — the UI flags them instead of inventing intermediates.

Species **label** default is `Southern Yellow Pine No. 2 Prime` (Home Depot). **Table lookup** is Southern pine No. 2. There is no Prime table.

2x dimension lumber is laid out at standard US dressed sizes (`1.5 × 5.5 / 7.25 / 9.25 / 11.25`). Other products: type actual size.

Stairs v1: if width/rise are set — 36 in clear (R318.7.1); max riser 7-3/4 in, 3/8 in variation (R318.7.5.1). No run, stringer count, or handrail requirement. 2024 stairs are **R318.7** (not R311.7); guards are **R321** (not R312).

Cut list waste is **net only**. Hangers and fasteners are 1:1 layout counts with **your** product names. Area/linear accessories use **your** coverage (sf/roll, count/box). No SKU catalog.

Post holes are **XY only**. No frost. No footing sizing.

## Project file

JSON (`*.deckplanner.json`) including the photo as a data URL. Everything stays on disk you choose. Undo is in-session only.
