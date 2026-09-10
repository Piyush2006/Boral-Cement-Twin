# Berrima Cement Works — Digital Twin

An independent digital twin of the Boral Cement Works at Berrima, NSW. Live
satellite imagery is the geographic foundation; plant assets are drawn on it at
their real coordinates; a 3D model and a hybrid view show the same plant from the
same data; and a QR workflow captures physical stock counts and pushes the
variance to reconciliation.

The governing specification is [CLAUDE.md](CLAUDE.md).

```bash
npm install
npm test
npm run build && npm start     # http://localhost:3999
```

`npm run dev` is for local work only. Behind an HTTPS reverse proxy the dev
server's HMR socket cannot connect, which stalls the client chunks and leaves the
page blank — serve the production build there.

---

## The three views

| View | What it is |
| --- | --- |
| **Satellite** | Live Esri World Imagery with asset footprints, labels and indicative material flow. The geographic truth layer. |
| **3D Twin** | A stylised plant model in local ENU metres, orbit/pan/zoom, with reset / top-down / operator camera presets. |
| **Hybrid** | 3D volumes extruded upward from their true ground footprints on the live imagery. |

Selection is shared: pick an asset in any view and it stays selected — and
focused — in the other two. Selection is always by `assetId`, never by name.

## One coordinate system

```
              WGS84 lat/lng  (canonical — on every asset)
                      |
      ┌───────────────┴───────────────┐
      v                               v
Leaflet EPSG:3857              local ENU metres
(Satellite + Hybrid)           (3D Twin, Three.js)
```

`src/lib/map/projection.ts` is the only bridge. 3D world units *are* metres, east
is +X and north is −Z. There is no normalised coordinate space, so the two views
cannot drift apart.

Hybrid registration is exact because each volume's base is placed at
`map.latLngToContainerPoint(...)` on every map move — it trades perspective
realism for never sliding off the plant.

## What is and is not verified

**Nothing in this build is verified.** There is no survey, CAD or GIS data from
the client yet, so every asset ships `verified: false`, and the UI says
*Approximate location* on every card (§30).

| Provenance | Meaning |
| --- | --- |
| `IDENTIFIED` | The structure is unambiguous in imagery — the 86 m rotary kiln shell, the domed clinker store, the circular blending store, the quarry benches. |
| `DOCUMENTED` | Named in the client's annotated site plan or by Boral, but not separately identifiable from above. Placed in the correct process position. |
| `DEMO_OBJECT` | Exists as application configuration for the demo — Cement Silos 1–3, and the pile IDs. |

**Layout and identity** come from the client's annotated satellite view.
**Coordinates** were read off Esri World Imagery (z16–z18, 0.49–1.97 m/px) by
matching each annotated area to the structure visible there.

Known open item: which mill building is No. 6 and which is No. 7 cannot be
determined from imagery. Both cards say so.

To make an asset authoritative, set its `position` from survey data in
`src/lib/assets/registry.ts` and change `positionSource` to `SURVEY` or
`PLANT_LAYOUT`, and `verified` to `true`.

## Inventory is Demo / Simulated

Boral has supplied no stock figures. Every quantity in this build is seeded demo
data, stamped `provenance: "DEMO"` and rendered behind a persistent
**Demo / Simulated** chip. It cannot be mistaken for Berrima stock.

`src/lib/inventory/provider.ts` is the **Integration API** — the single seam to a
real IMS/ERP, and the only place inventory is read or written:

```ts
import { setInventoryProvider } from "@/lib/inventory/provider"

setInventoryProvider({
  id: "ims",
  label: "IMS",
  list: () => ims.getBalances(),
  get: (loc) => ims.getBalance(loc),
  submitCount: (s) => ims.raiseStockAdjustment(s),  // never an overwrite
  adjustments: () => ims.getAdjustments(),
  canSubmitCount: () => ims.session.can("inventory.count"),
})
```

The twin owns spatial data only. It creates no second source of truth, and
contains no inventory arithmetic beyond the variance a count produces.

## QR verification workflow

```
Scan tag  →  identify asset  →  show book stock  →  enter physical count
   →  variance  →  submit  →  ADJUSTMENT raised  →  twin refreshes
```

Tags encode `berrima-twin:asset:<assetId>` and nothing else — a tag cannot carry
a quantity, so it cannot be forged into a stock movement. Anything unrecognised
is rejected rather than coerced into a match. Where there is no camera, the asset
ID can be keyed in. Submission is gated by `canSubmitCount()` (§32).

Counts raise an adjustment for the reconciliation workflow. They never overwrite
the book quantity.

## Basemap

Esri ArcGIS World Imagery, fetched live, no API key. Attribution is part of the
provider definition so it cannot be rendered without its credit.

Verified for this site: z18 is the deepest level with real coverage at Berrima
(z19 returns a placeholder), so `maxNativeZoom` is pinned to 18 and Leaflet
over-zooms above it.

**No imagery is ever bundled.** Tiles are not downloaded, stitched or committed
into the application (§5, §31).

To switch to Google Maps Platform later, set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
`src/lib/map/providers.ts` already declares the provider and picks it up
automatically; it is deliberately not a tile template, because pulling Google
tiles directly would breach their terms.

## Layout

```
src/config/site.ts             site centre, zoom, bounds
src/lib/map/                   projection.ts (the coordinate bridge), providers.ts
src/lib/assets/                types.ts, registry.ts (the plant), selectors.ts
src/lib/twin/                  palette.ts (legend colours), labeling.ts (declutter)
src/lib/inventory/             types.ts, provider.ts (Integration API), demo-source.ts
src/lib/qr/                    payload.ts
src/components/map/            MapView — Leaflet + Esri
src/components/twin/           TwinCanvas, AssetMesh, CameraToolbar — R3F + drei
src/components/overlays/       HybridOverlay — 3D volumes on the live map
src/components/assets/         AssetCard
src/components/qr/             QrScanner — scan, count, variance, submit
src/components/shell/          AppShell, twin-store, ViewSwitcher, SearchBar, LayerPanel
```

## Tests

`npm test` — 46 tests:

- **projection** — round-trips, north-up orientation in both views, real metre
  distances, malformed coordinates rejected, centre is the works not the township.
- **registry** — unique ids, all positions inside the site, **nothing marked
  verified**, exactly one kiln and two cement mills, silos are demo objects, no
  stock figures in spatial config, quarry cannot hold inventory, and the flow
  graph actually connects quarry → crusher → raw mill → kiln → mills → dispatch.
- **inventory & QR** — every demo record stamped `DEMO`, no `LOW` status anywhere,
  variance maths in both directions, counts raise adjustments rather than
  overwrites, and QR payloads round-trip while junk is rejected.

## Status vocabulary

Assets: `Operational · Warning · Critical · Offline · Verification Required`.
Inventory: `Healthy · Critical` only — there is deliberately no `Low` (§24).
Every status is carried by colour **and** glyph **and** text.
