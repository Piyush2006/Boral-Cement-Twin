# CLAUDE.md — Berrima Cement Works Digital Twin

## 1. Objective

Build an **independent Berrima Cement Works Digital Twin application**.

This is **not** a redesign of the existing Inventory Management System and must
not be treated as a replacement for it.

The Digital Twin is a separate application whose purpose is to create a visually
convincing, interactive digital representation of the **Berrima Cement Works
site**, with:

- real satellite/site context
- a plant map
- major plant areas and process equipment
- raw-material stockpiles / piles
- cement silos
- material-handling paths
- inventory and operational status overlays
- clickable physical assets
- QR-code based physical stock capture
- connection to the existing inventory system when integration is available

The key demo concept is:

> **"This is the physical Berrima plant represented digitally. I can navigate the
> plant, select a physical asset, see its operational/inventory state, scan a QR
> code, record what is physically present, and have that information reflected in
> the digital twin."**

Do NOT build another generic dashboard that happens to contain inventory KPIs.

---

## 2. Product Concept

The application has two complementary visual modes.

### Mode A — Satellite / Site Map

A real satellite view of Berrima Cement Works is the geographic foundation.

The user can:

- zoom and pan around the complete plant
- see the site boundary / operating area
- see plant areas
- see stockpile / pile locations
- see silos
- see major process areas
- see roads and internal movement areas
- select physical assets
- see asset labels
- switch between operational overlays

The satellite map is the **geographic truth layer**.

### Mode B — Digital Twin / 3D Plant View

A stylized but spatially faithful 3D representation of the plant.

The 3D view should visually communicate:

```text
Raw Material / Quarry
        ↓
Raw Material Handling
        ↓
Crusher
        ↓
Raw Mill
        ↓
Kiln
        ↓
Clinker / Storage
        ↓
Cement Mills
        ↓
Cement Silos
        ↓
Dispatch / Loading
```

Only show equipment/areas that can be supported by reliable Berrima information.

Do NOT invent plant assets simply because they are common in cement plants.

Where exact geometry is unavailable:

- use a clearly approximate representation
- label it as approximate internally
- do not claim that an unverified structure is the actual Berrima asset
- preserve geographic positioning from the satellite/site reference

---

## 3. Relationship Between Satellite View and 3D Twin

These are **two views of the same plant**, not two unrelated screens.

The user should be able to:

1. Select a pile on the satellite map.
2. Open its asset card.
3. Switch to the 3D twin.
4. Automatically move the camera to the corresponding physical area.
5. Select the same asset in 3D.
6. See the same asset ID, material, stock, status and operational information.

Likewise:

```text
Satellite Asset
      ↓
Digital Twin Asset
      ↓
Asset ID
      ↓
Inventory / Operational Data
```

Every mapped physical asset should have a stable internal `assetId`.

Example:

```text
PILE-RM-001
SILO-CEM-001
SILO-CEM-002
SILO-CEM-003
KILN-06
CRUSHER-01
RAW-MILL-01
CEMENT-MILL-01
```

Do not expose IDs as facts unless the ID has actually been configured/verified.

---

## 4. Berrima Site Reference

The application represents:

**Boral Cement Works Berrima**
Taylor Ave, New Berrima, NSW, Australia.

Use the official Boral location page as the first factual reference for the site:

https://www.boral.com.au/locations/boral-cement-works-berrima

The Boral site information states that the Berrima Works operates one kiln,
**Kiln No. 6**, and that limestone is delivered by rail from the Marulan South
Limestone Mine before being blended and processed.

Use this information as context, but do not infer exact locations of individual
machines from this description alone.

The official Berrima environmental report can also be used as a plant/site
reference:

https://www.boral.com.au/sites/default/files/2024-08/Berrima%20Cement%20AEMR%202020%20-%202021.pdf

---

## 5. Satellite Map — Where To Get It

### Preferred approach for the live application

Use a licensed mapping provider rather than downloading/scraping satellite tiles.

#### Option A — Google Maps Platform

Use the **Google Maps JavaScript API** with the satellite map type.

Official documentation:

https://developers.google.com/maps/documentation/javascript/overview

Satellite map type:

https://developers.google.com/maps/documentation/javascript/maptypes

Google's documentation explicitly supports a `satellite` map type for
photorealistic aerial imagery.

The application should use:

```text
Google Maps JavaScript API
mapTypeId = satellite
```

with a properly restricted API key stored in an environment variable.

Example:

```text
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
```

Never hard-code the API key in source code.

Google Maps Platform requires the relevant attribution and has restrictions on
caching, accessing tiles outside the supported APIs, and modifying/copying Google
map content. Follow the current Google Maps Platform terms.

Reference:

https://developers.google.com/maps/documentation/javascript/policies

FAQ:

https://developers.google.com/maps/faq

### IMPORTANT

Do NOT:

- scrape Google Maps tiles
- download Google satellite tiles manually
- stitch Google satellite tiles into a new map
- remove Google attribution
- redraw Google's map/building geometry as a replacement dataset

The satellite imagery should remain the licensed map layer.

---

## 6. Alternative Satellite Source

If Google Maps licensing/API access is not appropriate for the deployment,
support an alternative licensed basemap provider such as **Esri ArcGIS World
Imagery**, subject to its licensing and attribution requirements.

Esri documentation:

https://developers.arcgis.com/documentation/mapping-and-location-services/mapping/basemaps/introduction-basemap-styles-service/

Esri attribution is required when using its mapping content.

Do not mix Google imagery and another provider's imagery without understanding
the respective licenses.

---

## 7. Map Coordinates / Initial Camera

The initial map camera should open on the Berrima Cement Works site.

Do not hard-code an inaccurate center point based on a generic Berrima town
coordinate.

Use the Berrima Cement Works location from a reliable geocoding/site source and
allow the site center to be configured in:

```text
src/config/site.ts
```

Example conceptual configuration:

```ts
export const BERRIMA_SITE = {
  name: "Berrima Cement Works",
  address: "Taylor Ave, New Berrima NSW, Australia",
  center: {
    lat: 0, // replace with verified coordinate
    lng: 0, // replace with verified coordinate
  },
  defaultZoom: 16,
};
```

Do not invent coordinates. Populate them from the verified site location.

---

## 8. Do NOT Use Satellite Imagery as the 3D Model

The satellite image is the geographic reference layer.

It is NOT the 3D model.

The 3D plant model should be created from:

1. available plant/site plans
2. engineering drawings supplied by the client
3. CAD / BIM / GIS data if available
4. drone/photogrammetry data if supplied
5. verified site photographs
6. satellite imagery for geographic placement and visual reference
7. publicly available factual Berrima documentation

If no detailed CAD/BIM model is available, create a **stylized digital twin**
using Three.js rather than pretending that generic 3D objects are exact
engineering geometry.

---

## 9. Recommended Technology

Use:

- Next.js
- React
- TypeScript
- Three.js
- React Three Fiber
- Drei
- Google Maps JavaScript API OR another properly licensed basemap provider
- Tailwind CSS
- Recharts where charts are needed
- QR scanner library for browser/mobile scanning

Three.js is preferred for the interactive 3D plant scene.

Recommended structure:

```text
app/
components/
  map/
  twin/
  assets/
  qr/
  inventory/
  overlays/
lib/
  map/
  twin/
  assets/
  inventory/
  qr/
config/
  site.ts
public/
  models/
  textures/
```

Keep the 3D scene modular.

---

## 10. Physical Asset Model

The Digital Twin should treat the plant as a collection of physical assets.

Example categories:

```text
SITE
PROCESS_AREA
STOCKPILE
SILO
CRUSHER
MILL
KILN
CONVEYOR
TRANSFER_POINT
LOADING_AREA
UTILITY
BUILDING
ROAD
```

Each asset should support:

```ts
type TwinAsset = {
  assetId: string;
  name: string;
  type: string;
  latitude?: number;
  longitude?: number;

  // 3D position
  position?: {
    x: number;
    y: number;
    z: number;
  };

  materialId?: string;
  inventoryLocationId?: string;

  status?: string;

  verified: boolean;
  source?: string;
};
```

The `verified` field is important.

A modelled object must not be presented as fact if its physical
identity/location has not been verified.

---

## 11. Raw Material Piles

Raw-material piles are a major part of the Digital Twin.

The map should show piles as physical stock locations.

Each pile can display:

```text
Pile ID
Material
Estimated / recorded quantity
Stock status
Last physical verification
Last inventory update
QR code
```

Example UI:

```text
PILE-RM-001

Material
Limestone

Physical Stock
18,450 MT

Last Verified
10 Sep 2026

Status
Available

[Scan QR]
[View Inventory]
```

Do not invent pile IDs or quantities.

Pile IDs and physical locations should come from client/site data or be created
explicitly as application configuration.

---

## 12. Cement Silos

The Digital Twin should visually distinguish cement silos from raw-material
piles.

For the current requested Berrima concept, support the known configured
cement-silo objects:

```text
Cement Silo 1
Cement Silo 2
Cement Silo 3
```

Do not automatically add additional cement silos without verified site
information.

Silos should display:

- silo name
- material
- stock level
- capacity
- fill percentage
- available capacity
- inventory status

The silo visualization should be a **physical vessel**, not a generic inventory
card.

---

## 13. Plant Equipment

Where verified information exists, represent major plant equipment as physical
objects.

Examples may include:

- crusher
- raw mill
- kiln
- cement mill
- conveyors
- storage/transfer equipment
- dispatch/loading equipment
- utilities

The Berrima site reference identifies **Kiln No. 6**.

Do not create fake equipment names such as "Kiln 1" or "Kiln 2".

If an asset's exact physical location is unknown, do not place it arbitrarily on
the map.

Instead:

```text
Location: To be verified
```

or leave it out of the geographic scene until verified.

---

## 14. Digital Twin Visual Language

The visual style should feel like an industrial digital twin, not an ERP
dashboard.

Use:

- realistic satellite base
- clean 3D plant geometry
- subtle terrain
- physical structures
- equipment labels
- glowing/outlined selectable assets
- status overlays
- material-flow paths
- inventory level visualization
- minimal floating UI

Avoid:

- giant KPI cards covering the plant
- excessive white dashboard panels
- generic business charts as the primary visual
- fake "AI" elements
- random 3D factories
- unrelated cement-plant stock imagery
- decorative equipment that has no relationship to Berrima

The **plant itself must be the hero**.

---

## 15. Main Screen

The default screen should show:

```text
┌───────────────────────────────────────────────────────────────┐
│ BERRIMA CEMENT WORKS DIGITAL TWIN                             │
│ Search asset     View: Satellite | Digital Twin | Hybrid      │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│                                                               │
│                  PLANT / SATELLITE / 3D VIEW                  │
│                                                               │
│       Pile       Crusher       Mills        Kiln              │
│          \          |            |           |                │
│           \         |            |           |                │
│            ────────────── MATERIAL FLOW ───────────           │
│                                                               │
│                                    Cement Silos               │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│ Selected Asset: PILE-RM-001                                   │
│ Material | Stock | Status | Last Verified | QR                │
└───────────────────────────────────────────────────────────────┘
```

The visual hierarchy must remain plant-first.

---

## 16. Satellite ↔ 3D Toggle

Provide:

```text
SATELLITE
3D TWIN
HYBRID
```

### Satellite

Shows real aerial imagery with asset overlays.

### 3D Twin

Shows the plant model.

### Hybrid

Shows satellite imagery underneath/around the 3D model where technically
appropriate.

The selected asset must remain selected when changing views.

---

## 17. Asset Selection

Clicking a physical asset should:

1. highlight the asset
2. show its asset name/ID
3. show relevant inventory information
4. show its location
5. provide actions
6. optionally fly the camera to the asset

Example:

```text
Cement Silo 2

Asset ID
SILO-CEM-002

Material
OPC 43

Book Stock
2,850 MT

Capacity
5,000 MT

Fill
57%

Inventory Status
Healthy

[Open Inventory]
[Scan QR]
```

The inventory values must come from the connected inventory data source when
integration exists.

---

## 18. QR Code Workflow

This is one of the key differentiators of the Digital Twin.

A user should be able to physically stand near a pile/silo/asset and scan a QR
code.

Workflow:

```text
SCAN QR
   ↓
IDENTIFY PHYSICAL ASSET
   ↓
SHOW CURRENT BOOK STOCK
   ↓
USER ENTERS PHYSICAL COUNT
   ↓
CALCULATE VARIANCE
   ↓
CONFIRM
   ↓
UPDATE INVENTORY / RECONCILIATION SYSTEM
   ↓
DIGITAL TWIN REFRESHES
```

Example:

```text
QR → PILE-RM-001

Book Stock
18,450 MT

Physical Count
18,210 MT

Variance
-240 MT

[Submit Count]
```

Do not directly overwrite inventory quantities.

Use the existing inventory reconciliation/adjustment workflow if this Digital
Twin is connected to the existing IMS.

---

## 19. Inventory Integration

This application is independent, but it should be **integration-ready**.

Do not create a second source of truth for inventory.

Preferred architecture:

```text
                 DIGITAL TWIN
                      |
       ┌──────────────┼──────────────┐
       |              |              |
   Map Assets      3D Assets       QR Scan
       |              |              |
       └──────────────┼──────────────┘
                      |
                 INTEGRATION API
                      |
             EXISTING IMS / ERP
                      |
              Inventory Ledger
```

The Digital Twin may maintain:

- spatial asset data
- 3D geometry
- camera positions
- visual configuration
- asset mapping

But inventory quantity/status should come from the authoritative inventory
system once connected.

---

## 20. No Fake Inventory Data

During development, seed data may be used for demonstration.

However:

- clearly mark demo data internally
- never mix demo values with production values
- never present invented Berrima stock as actual stock
- do not fabricate pile quantities
- do not fabricate machine status
- do not fabricate asset IDs as if supplied by Berrima

Use:

```text
Demo / Simulated
```

when real integration is unavailable.

---

## 21. Functional Blocks Must Talk to Each Other

The client specifically wants:

> "functional blocks talking to each other"

Therefore the application should visibly demonstrate connections.

```text
                 ┌───────────────┐
                 │ SATELLITE MAP │
                 └───────┬───────┘
                         |
                         v
                 ┌───────────────┐
                 │ PHYSICAL ASSET│
                 │   SELECTION   │
                 └───────┬───────┘
                         |
              ┌──────────┴──────────┐
              v                     v
       ┌─────────────┐       ┌─────────────┐
       │ 3D DIGITAL  │       │ INVENTORY   │
       │    TWIN     │       │   STATUS    │
       └──────┬──────┘       └──────┬──────┘
              |                     |
              └──────────┬──────────┘
                         v
                   ┌─────────────┐
                   │  QR / COUNT │
                   └──────┬──────┘
                          v
                   ┌─────────────┐
                   │ INVENTORY   │
                   │ RECONCILE   │
                   └─────────────┘
```

A user action in one block should visibly affect the appropriate connected
block.

---

## 22. Example Demo Journey

The application should be designed around this demo:

### Step 1
Open Berrima. The user immediately sees the plant on satellite imagery.

### Step 2
Click a raw-material pile. The pile highlights.

### Step 3
Open the asset. The system shows:

```text
Pile ID
Material
Book Stock
Physical Verification
Status
```

### Step 4
Switch to 3D. The camera flies to the corresponding physical area.

### Step 5
Scan the pile QR code. The asset is identified automatically.

### Step 6
Enter physical quantity. The system calculates variance.

### Step 7
Submit. The inventory/reconciliation workflow records the change.

### Step 8
Return to the Digital Twin. The pile's displayed stock now reflects the updated
authoritative inventory state.

This is what makes the product a **Digital Twin**, rather than merely an
inventory dashboard.

---

## 23. Site Map Layers

Provide toggleable layers:

```text
Satellite
Plant Areas
Raw Material Piles
Cement Silos
Process Equipment
Conveyors / Material Flow
Roads
Inventory Status
QR Assets
```

Do not show every layer simultaneously by default.

The default should be visually clean.

---

## 24. Asset Status

Status should be communicated using:

- color
- icon
- text

Never rely on color alone.

Example:

```text
Operational
Warning
Critical
Offline
Verification Required
```

For inventory:

```text
Healthy
Critical
```

Do not introduce a "Low" category if the connected inventory system does not
have one.

---

## 25. Material Flow Visualization

Where process relationships are verified, show subtle animated material-flow
paths.

```text
Raw Material
     ↓
Crusher
     ↓
Raw Mill
     ↓
Kiln 6
     ↓
Clinker
     ↓
Cement Mill
     ↓
Cement Silo
     ↓
Dispatch
```

The arrows/flow should be secondary to the physical plant.

Do not imply a process relationship that has not been verified.

---

## 26. 3D Camera Behavior

Use cinematic but practical navigation.

Interactions:

- orbit
- pan
- zoom
- click asset
- fly-to asset
- reset plant view
- top-down view
- operator view

Asset selection should animate smoothly.

Avoid excessive camera animation that makes the application feel like a game.

---

## 27. Performance

The plant may contain many objects.

Use:

- instancing
- low-poly geometry where appropriate
- lazy loading
- compressed textures
- GLTF/GLB
- level of detail
- frustum culling
- progressive loading

Do not load massive unnecessary assets on initial page load.

---

## 28. Data Architecture

Keep these concepts separate:

```text
Physical Asset
      ↓
Twin Asset
      ↓
Inventory Location
      ↓
Material
      ↓
Inventory Balance
```

Example:

```text
SILO-CEM-002
       |
       └── inventoryLocationId
                 |
                 └── Material: OPC 43
                              |
                              └── Current Balance
```

Never identify an inventory record solely by display name.

Use stable IDs.

---

## 29. Source-of-Truth Rules

### Geographic location
1. verified client/site GIS/CAD data
2. verified plant/site plan
3. official site documentation
4. satellite imagery as geographic reference

### Equipment identity
1. client engineering/site data
2. official Berrima documentation
3. verified photographs/site survey

### Inventory
1. authoritative inventory/IMS API

### Satellite imagery
1. licensed map provider such as Google Maps Platform or Esri

Never silently replace one source with another.

---

## 30. Important Accuracy Rule

The Digital Twin should be **visually impressive but factually honest**.

Do not say:

> "This is the crusher"

just because a structure looks like a crusher.

Instead, verify the asset first.

Use labels such as:

```text
Crusher — Verified
Crusher — Approximate location
Process Area — To be verified
```

This rule is especially important for:

- stockpiles
- crushers
- mills
- conveyors
- kilns
- silos
- buildings
- transfer points

---

## 31. Map Attribution

If Google Maps Platform is used, preserve the required Google/data-provider
attribution in the map UI.

If Esri is used, preserve the required Esri/data attribution.

Do not remove or hide attribution.

Do not create a custom "satellite map" by copying third-party imagery into
application assets.

---

## 32. Security

Keep API keys server/config protected where applicable.

For Google Maps:

```text
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
```

Use API-key restrictions appropriate for the deployed domain.

Never commit secrets.

QR scanning must not allow arbitrary users to update inventory without
authentication/authorization.

---

## 33. Suggested Application Navigation

```text
Digital Twin
├── Plant Overview
├── Satellite View
├── 3D Twin
├── Hybrid View
├── Assets
│   ├── Piles
│   ├── Silos
│   ├── Equipment
│   └── Plant Areas
├── Inventory Integration
├── QR Scanner
└── Activity / Verification History
```

Keep the navigation focused on the Digital Twin.

Do not turn this into a generic ERP.

---

## 34. Acceptance Criteria

- [ ] Berrima Cement Works opens as the default site.
- [ ] Satellite imagery provides the geographic foundation.
- [ ] User can pan/zoom the full plant.
- [ ] User can toggle Satellite / 3D / Hybrid.
- [ ] 3D twin is spatially aligned with the site rather than being a generic cement factory.
- [ ] Physical assets have stable IDs.
- [ ] Raw-material piles can be represented and selected.
- [ ] Cement Silo 1, 2 and 3 can be represented and selected.
- [ ] Verified major process equipment can be represented.
- [ ] Kiln No. 6 is represented only where its physical location/geometry is verified.
- [ ] Selecting an asset works in both map and 3D views.
- [ ] The same asset is recognized across both views.
- [ ] Inventory information can be associated with an asset.
- [ ] QR scanning identifies the associated physical asset.
- [ ] Physical count can be entered.
- [ ] Variance can be calculated.
- [ ] Inventory update uses the authoritative inventory/reconciliation workflow when connected.
- [ ] No second inventory source of truth is created.
- [ ] No fake Berrima stock quantities are presented as real.
- [ ] Satellite/map attribution is preserved.
- [ ] The interface feels like an industrial digital twin, not an inventory dashboard.

---

## 35. Most Important Instruction to Claude

Do NOT build a collection of dashboard cards with a 3D picture behind them.

Build a **spatially connected digital representation of Berrima Cement Works**.

The core relationship is:

```text
REAL BERRIMA SITE
      ↓
SATELLITE MAP
      ↓
PHYSICAL ASSETS
      ↓
3D DIGITAL TWIN
      ↓
ASSET / QR INTERACTION
      ↓
INVENTORY / OPERATIONAL DATA
      ↓
UPDATED DIGITAL REPRESENTATION
```

The user should be able to look at the screen and immediately understand:

> **"I am looking at the actual Berrima plant, where the physical assets are,
> what each asset represents, and how the digital information is connected to
> those physical assets."**

That is the product.

---

# Build decisions for this repository

Agreed with the client, 2026-09-09. These resolve open choices in the spec above.

1. **Basemap: Esri ArcGIS World Imagery**, live tiles, no API key required.
   Attribution preserved (§31). The map layer is behind a provider abstraction
   (`src/lib/map/providers.ts`) so Google Maps Platform can be added later
   without touching the twin (§5, §6).
2. **Never bundle imagery.** Tiles are always fetched live from the licensed
   provider. No downloading, stitching, or committing of third-party tiles into
   `public/` or anywhere else (§5, §31).
3. **Site centre: -34.5099, 150.3365** — Berrima Cement Works, not Berrima
   township (§7). Configured in `src/config/site.ts`.
4. **Nothing is `verified`.** No survey-grade or client coordinates exist yet.
   Every asset position is derived from satellite imagery and ships as
   `verified: false` with `positionSource: "IMAGERY"`, surfaced in the UI as
   *Approximate location* (§30).
5. **Cement Silos 1–3 are demo objects** (§12), positioned approximately. Their
   existence as three configured silos is application configuration, not a
   Boral-supplied fact.
6. **Inventory is `Demo / Simulated`** until the Integration API is connected
   (§19, §20). Every quantity carries that provenance flag in the data and is
   labelled as such in the UI. There is no second source of truth.
7. **Priority for v1:** the spatial relationship and the twin experience over
   claimed positional accuracy. Build the plant as a connected system following
   the real layout visible in the imagery — not unrelated 3D objects on a map.
