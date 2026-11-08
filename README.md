# QuakeScope 3D

An interactive Earth observatory built with React, React Three Fiber, r3f-globe, Three.js, Zustand, TanStack Query, Tailwind, and Go/chi. Real provider data only; no runtime fixtures.

## Run locally

Requires Go 1.24+ and Node 22.12+.

```sh
cd server
go run ./cmd/server
```

In another terminal:

```sh
cd web
npm ci
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to `127.0.0.1:8081`. The backend defaults to that address; override with `LISTEN_ADDR` and update the Vite proxy if needed. Initial synchronization takes a few seconds. No environment file is required.

## Verify and build

```sh
cd server
go test -race ./...
go vet ./...
go build ./cmd/server
```

```sh
cd web
npm test
npm run typecheck
npm run build
```

Serve `web/dist` through a static web server and reverse proxy `/api` to Go for deployment. Vite development proxy is not a production server.

## Architecture and data

The single Go process runs one polling goroutine per provider every four minutes. Adapters normalize bounded HTTP responses; a mutex protects atomic provider snapshots. If any feed in a provider poll fails, that provider retains its previous successful snapshot and reports the error. Restarting clears memory. HTTP client timeouts, request cancellation, response size limits, and graceful shutdown are included.

- `GET /api/v1/earthquakes?source=usgs&timeRange=24h&minMagnitude=2.5&limit=1000` returns events, matching totals, truncation, filters, and provider freshness.
- `GET /api/v1/sources/status` returns provider sync timestamps, stale state, and errors.
- `GET /api/v1/health` reports process health (not upstream availability).

Filtering uses occurrence timestamps in UTC. Invalid filters return 400. Results are newest first, capped at 1000. Summaries describe displayed records. Source status becomes stale on failure or after ten minutes without success.

[USGS GeoJSON feeds](https://earthquake.usgs.gov/earthquakes/feed/v1.0/) supply magnitude 2.5 day and week records. Coordinates are longitude, latitude, depth. USGS event IDs are preserved. The tsunami flag retains its USGS meaning and is not presented as a warning.

[BMKG open data](https://data.bmkg.go.id/gempabumi/) supplies `autogempa.json`, `gempaterkini.json`, and `gempadirasakan.json`. Coordinates are latitude, longitude; ISO DateTime values normalize to UTC. BMKG provides latest, M5+, and felt categories with limited recent records, not exhaustive 24-hour or seven-day coverage. Polling uses three requests per four minutes, below its documented 60/minute limit. BMKG timestamps provide the within-provider event identity because these feeds lack a stable event ID; simultaneous distinct events cannot be distinguished. Original felt and potential-tsunami text is preserved. No cross-provider deduplication is attempted.

Frontend query state is separate from Zustand interaction state. The R3F scene remains mounted when filters change. Orbit controls support mouse/touch, idle rotation, reset, and spherical camera fly-to paths. Surface markers use magnitude for radius and depth for color: amber below 70 km, coral from 70 to below 300 km, violet at 300 km or deeper. The DOM event list provides keyboard selection. The detail panel can collapse through its summary, including on mobile.

## Attribution

Earth imagery: NASA Visible Earth / Blue Marble, distributed as the equirectangular `2_no_clouds_4k.jpg` from [webgl-earth](https://github.com/turban/webgl-earth/tree/master/images). The image is bundled locally (about 1.3 MB); NASA imagery usage guidance: https://www.nasa.gov/nasa-brand-center/images-and-media/. No NASA affiliation is implied. Earthquake information: USGS and BMKG (Badan Meteorologi, Klimatologi, dan Geofisika).

Data may be delayed or revised. This application is not an official earthquake early-warning system.

## Verification limits and follow-up

Automated checks cover coordinate axes, marker encodings, interaction store updates, parsers, UTC normalization, malformed records, filtering, deduplication, upstream errors, and stale-cache preservation. Live API synchronization was checked for both providers. Browser rendering, touch gestures, and actual GPU frame rate could not be checked because no browser was available in the implementation session. Test those on desktop and mobile before release.

The globe dependency creates a large JavaScript bundle; measured build output warns about chunk size. Next work: browser interaction tests, device profiling and marker batching if needed, plus a smaller globe dependency bundle. No lint configuration is included; TypeScript and `go vet` provide static checks.

## CI/CD

See [pipeline and production setup](deploy/README.md) for unit/integration stages, build artifacts, production-only deployment, tag-only releases, and required production secrets.
