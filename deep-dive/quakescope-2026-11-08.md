# Deep Dive: QuakeScope 3D

**Generated**: 2026-11-08
**Mode**: compact · mid-level
**Primary files**: `server/cmd/server/main.go`, `server/internal/quake/quake.go`, `web/src/App.tsx`, `web/src/Scene.tsx`, `web/src/earthquake.ts`

## Overview

QuakeScope turns two differently shaped earthquake feeds into one event model and renders their epicenters on a textured Earth. Go handles upstream requests, normalization, filtering, and freshness; React handles controls, selection, and presentation. The architecture fits an MVP: one server process, one frontend, and no persistent infrastructure. The important distinction is between cached provider data, the user’s selected filters, and the camera’s continuously changing position. Those have different lifetimes and should remain independently controlled.

Data travels through:

```text
USGS / BMKG → Fetch → parser → Dedup → Cache.Update
                                        ↓
HTTP query → Cache.Read → Filter → JSON → TanStack Query
                                             ↓
                                    App → Scene → globe
                                     ↑         ↑
                                    Zustand selection / controls
```

## Key Components

### `server/cmd/server/main.go`

- `main`: starts provider polling, registers routes, and coordinates shutdown.
- Per-provider `poll` closure: fetches that provider’s feeds sequentially and publishes only after all succeed.
- Earthquake route: validates filters, reads the snapshot, filters and sorts events, then applies the result limit.
- `write`: sets JSON response headers and encodes the payload.

### `server/internal/quake/quake.go`

- `ParseUSGS`: swaps longitude-first coordinates into named fields and converts millisecond timestamps to UTC.
- `ParseBMKG`: handles object/array feed shapes, latitude-first coordinate strings, numeric strings, and UTC normalization.
- `Dedup`: validates numeric bounds, removes repeated IDs, and fills missing felt/tsunami text.
- `Cache.Update`: publishes a successful snapshot or records failure while preserving previous events.
- `Cache.Read`: copies cached events into a response slice and derives stale status from errors and elapsed time.
- `Filter`: filters occurrence timestamps, source, and magnitude, then sorts newest first.
- `Fetch`: bounds response size, applies context cancellation, checks HTTP status, and calls the selected parser.

### `web/src/App.tsx`

- `get`: fetches JSON and rejects unsuccessful HTTP responses.
- `App`: queries by filters, renders summaries and controls, and connects both DOM selection and markers to shared state.
- `SceneBoundary`: provides a DOM fallback if a rendering exception reaches the boundary.

### `web/src/Scene.tsx`

- `Camera`: interpolates orientation and distance toward a selected location, with user-interaction and idle-rotation controls.
- `Earth`: configures r3f-globe’s Earth surface and selectable earthquake points.
- `Halos`: draws translucent sphere instances around epicenters in one batch.
- `Scene`: owns the canvas, lights, stars, and camera controls.

### `web/src/earthquake.ts`

- `position`: converts latitude/longitude into Cartesian coordinates on a radius-100 sphere.
- `markerSize`: maps magnitude to a bounded visual radius; this is a display encoding, not a physical earthquake dimension.
- `depthColor`: applies the shared depth thresholds used by markers and the legend.

Other files: `store.ts` holds interaction state; `main.tsx` installs the query provider; `style.css` defines the floating HUD and mobile layout; `vite.config.ts` configures build plugins and the development API proxy; the test files exercise parsers, cache behavior, mappings, and store updates. README and package manifests document setup and dependencies. These can receive a separate deeper explanation on request.

## Concepts & Decisions

### Normalize once at the provider boundary

**What:** Both providers become the same `Event` structure before entering the cache.

**Why used here:** Coordinate order and numeric formats differ. Converting them once keeps provider-specific conditions out of the API and globe. The optional tsunami text also preserves different provider meanings without manufacturing a shared warning status.

### Publish complete snapshots under a lock

**What:** Each provider fetches outside the cache lock, then replaces its snapshot under a mutex. Readers use a read lock and receive a copied event slice.

**Why used here:** Requests can continue reading while network operations run. A failed poll does not erase the last good dataset. The trade-off is conservative availability: failure of one BMKG feed prevents publication of successes from its other feeds. Independently cached feed snapshots would improve partial availability but introduce more freshness state.

### Separate server state from interaction state

**What:** TanStack Query manages fetched responses; Zustand manages filters, selected events, rotation, and reset requests. React hooks and REST calls are used in their usual roles.

**Why used here:** Refetching data should not recreate the canvas or overwrite user interactions. However, `App` subscribes to the whole Zustand store, and selection stores the whole event object. This makes unrelated changes rerender App and lets selected details remain outdated after a provider revision. An ID-based selection resolved against current results would avoid that latter issue.

### Use frame updates for camera motion

**What:** `Camera` uses quaternion interpolation for direction and a separate interpolation for distance. Its exponential interpolation factor depends on frame time.

**Why used here:** A straight line between opposite camera positions could pass through Earth. Rotating the direction while preserving radius avoids that path. Updating Three.js values directly also avoids React state updates every frame. OrbitControls and the fly-to logic both modify the camera, so their combined behavior still needs browser verification.

### Batch decorative geometry

**What:** Halo instances share geometry and material but receive individual transforms and colors. They do not participate in picking; globe points handle selection.

**Why used here:** This reduces halo draw calls without requiring a custom picking system. The actual globe points remain individual meshes, so batching halos alone does not establish smooth performance at 1000 events.

## Findings worth understanding

1. **Filters and closing details reset the camera.** Every filter handler clears `selected`. The camera effect depends on `selected` and assigns Indonesia as its target when selection is null. Therefore changing a filter after selecting an earthquake, or closing its details, starts a home flight. This conflicts with the requested camera-preserving filter behavior. Selection clearing and explicit camera reset need distinct triggers.

2. **BMKG identity is lossy.** `ParseBMKG` identifies records solely by their UTC timestamp formatted to seconds. Two distinct earthquakes sharing a second become one record. This is documented, but it remains an identity assumption rather than a provider-issued ID. A same-provider identity strategy needs verified feed semantics before expanding it.

3. **USGS coordinate nulls can become valid-looking zeros.** The parser decodes coordinates into `[]float64`; Go’s JSON decoder leaves numeric elements at zero for JSON null. For example, a null longitude can pass the length and bounds checks as longitude zero. Validate raw coordinate presence and nulls before constructing an event. Existing tests do not cover this case.

4. **Deduplication keeps the first record’s measurements.** Repeated IDs fill missing felt/tsunami text but never compare `updatedAt`. Since the day feed is fetched before the week feed, its version wins even if the later response contains a more recent revision. Conflicting revisions need an explicit preference rule.

5. **An empty valid feed is treated as failure.** `Fetch` rejects any parsed result with zero valid events. That protects against broken payloads, but it cannot distinguish malformed records from a legitimate period with no events. Such a feed can leave old data marked stale indefinitely.

6. **Readable source and UI tests remain gaps.** Much of the frontend is compressed into very long lines, making state transitions and event handlers difficult to review. The store test checks state assignment, not DOM accessibility, filtering interactions, marker picking, camera movement, or mobile layout. The coordinate test checks mathematical axes, not alignment with the rendered texture.

## Evidence and limits

This pass inspected source, dependency integration points, and existing test assertions; it did not change application behavior or rerun tests. Earlier implementation checks reported successful Go race tests, vet/build, frontend tests/typecheck/build, and live provider synchronization. Those results do not establish browser rendering correctness or GPU performance. No external research was needed for this compact source explanation.

*Generated with AntiVibe. `/antivibe full` requests the extended walkthrough and learning resources.*
