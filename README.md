# aria-mcp-trafik-dk

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that exposes current Danish road traffic events and roadworks to AI assistants. Built for [ARIA](https://github.com/kimhjort/aria) and shareable with the community.

**Fully keyless** — the data source is a public GCS-hosted JSON feed served by Vejdirektoratet as the backend for [trafikkort.vejdirektoratet.dk](https://trafikkort.vejdirektoratet.dk) (trafikinfo.dk).

Complements `aria-mcp-drivetime-dk`: that server computes drive time; this one tells you whether the road is clear.

## Data Source

| Source | What | Attribution |
|---|---|---|
| [Vejdirektoratet](https://www.vejdirektoratet.dk) / [trafikinfo.dk](https://trafikkort.vejdirektoratet.dk) | Current traffic events, roadblocks, queues, roadworks, critical announcements | Danish Road Directorate — free public traffic data |

**NAP reference:** [https://nap.vd.dk](https://nap.vd.dk) (National Access Point for road data, Denmark)

### Endpoint details

The app at `trafikkort.vejdirektoratet.dk` is backed by two public GCS-hosted JSON feeds (discovered by reading the app's JavaScript bundle):

| File | URL | What |
|---|---|---|
| `big-screen-events.json` | `https://storage.googleapis.com/trafikkort-data/geojson/big-screen-events.json` | All current incidents, accidents, roadblocks, queues, closures, weather-related events (~3 min cadence) |
| `critical-announcements.json` | `https://storage.googleapis.com/trafikkort-data/geojson/critical-announcements.json` | Major planned roadworks and critical traffic announcements |

Both are plain JSON (GeoJSON-derived), no authentication required, no API key.

### Data format

`big-screen-events.json` is an **array of GeoJSON FeatureCollections**, one per event (each collection has exactly one feature). Each feature carries:

```json
{
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [lon, lat] },
  "properties": {
    "featureId": "...",
    "layerId": "layer_id_19H1",
    "title": "Kør forsigtigt",
    "header": "Kør forsigtigt - E45 fra Randers mod Aalborg ...",
    "description": "<p>HTML description</p>",
    "TrafficMan2_Type": "org.vd.trafficmap.datexii.v32.datamodel.GeneralInstructionOrMessageToRoadUsers",
    "beginPeriod": "13-06-2026 kl. 00:12",
    "endPeriod": "13-06-2026 kl. 02:00",
    "kommune": "Vejdirektoratet",
    "suspended": "false",
    "future": "false",
    "visible": "true"
  }
}
```

The outer FeatureCollection also carries `layerName` which classifies the event:

| `layerName` | Meaning |
|---|---|
| `current-other-traffic-announcements.point` | General incidents, accidents, obstructions |
| `current-roadblocks.point` | Road/lane closures |
| `current-queue.point` | Traffic queues |
| `current-blocking-events.point` | Public events with road closures |
| `current-slippery-road.point` | Slippery road / water on road |
| `current-strong-wind-traffic-announcements.point` | Strong wind warnings |
| `current-blocking-roadwork.point` / `current-roadwork.point` | Active roadworks (when present) |

`TrafficMan2_Type` is a DATEX II v3.2 class path (e.g. `...Accident`, `...AbnormalTraffic`, `...MaintenanceWorks`).

`critical-announcements.json` is a single FeatureCollection with properties: `featureId`, `title`, `description` (HTML), `category`, `validFrom` (ISO datetime).

### Fragility notes

- The GCS bucket (`trafikkort-data`) is public but not officially documented. It has been stable since at least 2020 (the mobile SDKs reference the same domain). URL changes are possible with app updates.
- The subdirectory `geojson/25832/` (EPSG:25832 projected coordinates) is **not** publicly accessible — only the `geojson/` root files are open.
- Events arrive as individual FeatureCollections (one per event), so the array length in `big-screen-events.json` equals the event count (typically 100–300).
- `description` contains HTML; this server strips it before returning.
- `beginPeriod` / `endPeriod` are Danish-formatted date strings (e.g. `"13-06-2026 kl. 00:12"`), not ISO — returned as-is.
- `suspended: "true"` means the event is stored but currently inactive (e.g. cleared accident). This server includes suspended events but marks the flag.

## Install & Run

```bash
npx aria-mcp-trafik-dk
```

Or install globally:

```bash
npm install -g aria-mcp-trafik-dk
aria-mcp-trafik-dk
```

Requires Node.js 20 or later.

## Tools

### `traffic_events`

Fetch current Danish road traffic events.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `area` | string | No | Free-text region/road filter, e.g. `"E45"`, `"Horsens"`, `"Fyn"` |
| `type` | string | No | `"all"` (default) \| `"incident"` \| `"roadwork"` \| `"queue"` |

**Returns:** Array of traffic events:

```json
[
  {
    "type": "Traffic message",
    "road": "E45 fra Randers mod Aalborg",
    "location": "Kør forsigtigt - E45 fra Randers mod Aalborg mellem <35> Hobro V og <34> Hobro N",
    "description": "E45 fra Randers mod Aalborg mellem <35> Hobro V og <34> Hobro N Havareret køretøj, Pas på I højre spor, vejhjælp er på vej",
    "from": "13-06-2026 kl. 00:12",
    "severity": "warning",
    "suspended": false,
    "coordinates": [9.733868, 56.66633]
  }
]
```

---

### `roadworks`

Fetch planned and ongoing roadworks.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `area` | string | No | Free-text region/road filter |

**Returns:** Mixed array of `TrafficEvent` objects (from live roadwork layers) and `CriticalAnnouncement` objects (from `critical-announcements.json`):

```json
[
  {
    "id": "9349df74-15e8-4ffc-93e7-e3e236720da9",
    "title": "E45 Østjyske Motorvej spærres ved Horsens",
    "description": "I forbindelse med bronedrivning spærres E45 Østjyske Motorvej ...",
    "category": "Trafikal forsidemelding (trafikkort)",
    "validFrom": "2026-06-12T10:56:00.410Z"
  }
]
```

---

### `events_near`

Find traffic events within a radius of a geographic point.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `lat` | number | Yes | Latitude (WGS84) |
| `lon` | number | Yes | Longitude (WGS84) |
| `radiusKm` | number | No | Radius in km (default 25, max 200) |

**Returns:** Array of traffic events, each with an added `distanceKm` field, sorted by distance ascending.

```json
[
  {
    "type": "Road/lane closure",
    "road": "E45 Østjyske Motorvej",
    "location": "...",
    "description": "...",
    "severity": "blocking",
    "suspended": false,
    "coordinates": [9.85, 55.86],
    "distanceKm": 2.3
  }
]
```

## Environment Variables

| Variable | Description |
|---|---|
| `VD_GCS_BASE` | Override the GCS base URL (for testing or caching proxies). Default: `https://storage.googleapis.com/trafikkort-data/geojson` |

## ARIA MCP Config

Add to your ARIA credentials / MCP config:

```json
{
  "command": "npx",
  "args": ["-y", "aria-mcp-trafik-dk"],
  "env": {}
}
```

No environment variables are required. Pair with `aria-mcp-drivetime-dk` for a complete pre-drive check:

```json
[
  { "command": "npx", "args": ["-y", "aria-mcp-drivetime-dk"] },
  { "command": "npx", "args": ["-y", "aria-mcp-trafik-dk"] }
]
```

## Development

```bash
git clone https://github.com/kimhjort/aria-mcp-trafik-dk
cd aria-mcp-trafik-dk
npm install
npm run build
npm test
```

## License

MIT — see [LICENSE](LICENSE).

Traffic data is public information from Vejdirektoratet (Danish Road Directorate). Attribution to Vejdirektoratet / trafikinfo.dk is appreciated when redistributing.
