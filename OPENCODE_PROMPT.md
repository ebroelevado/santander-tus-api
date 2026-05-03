# TASK: Build Transit API Wrapper Backend

Build a complete Node.js + Express + TypeScript backend for the Transit API Wrapper. This is a REST API that wraps the TUS Santander public transit data.

## PROJECT LOCATION
/home/graditos/transit-api-wrapper

## DATA FILES (already in /data/)
- data/stops.min.json — fallback stops with GPS (format: {"41":[41,lat,lng,"name"]})
- data/colors.json — line colors (format: {"1":[255,0,0],"LC":[23,46,255]})
- data/cards.json — fare cards (7 types)
- data/schedules.json — scheduled times per line+direction+dayType (L/S/F)
- data/schedules.json format: {"horarios_hardcoded":{"1-1":{"L":["07:00","07:15",...],"S":[...],"F":[...]}}}

## EXTERNAL APIs TO CONSUME
1. Open Data Santander: GET https://datos.santander.es/api/rest/datasets/paradas_bus.json (462 stops with GPS)
2. Legacy API: POST https://transitserver.miguelripoll23.deno.net/api/v1/estimations/get-compact (real-time arrivals)
3. Legacy API: POST https://transitserver.miguelripoll23.deno.net/api/v1/routes/get-compact (route by stop+line)

## INS4G CONFIGURATION
INS4G MCP is configured in opencode.json. Use the InsForge MCP tools to create database tables and seed data.

## ARCHITECTURE

src/
  index.ts           — Express app entry point (port 3000)
  config.ts          — URLs, constants
  sources/
    openData.ts      — Fetches/stops from Open Data Santander API
    legacyApi.ts     — Proxies to Legacy API (arrivals, routes)
    lineIndex.ts     — Line index builder (discovers lines from legacy API)
    lineIndex.json   — Cached line index
  routes/
    health.ts        — GET /api/v1/health
    lines.ts         — GET /lines, /lines/:line, /lines/:line/route
    stops.ts         — GET /stops, /stops/:stop
    arrivals.ts      — GET /stops/:stop/arrivals, /next, /next/:line, /arrivals/:line, /lines/:line/next-at/:stop
    map.ts           — GET /map/stops, /map/lines
    trip.ts          — GET /trip, /stops/:stop/connections
    batch.ts         — POST /batch/arrivals, /batch/stops, /batch/lines
    compare.ts       — POST /compare/lines, GET /lines/:A/intersect/:B
    time.ts          — GET /now, /stops/:stop/arrivals/absolute
    fares.ts         — GET /fares, /fares/:id, /fares/compare, /fares/calculator
    schedules.ts     — GET /schedule/lines/:line, /schedule/lines/:line/next, /schedule/stops/:stop
    alerts.ts        — GET /alerts, /lines/:line/status
    discover.ts      — GET /discover, HEAD /discover
    dx.ts            — OPTIONS /, OPTIONS /stops/:stop
  utils/
    haversine.ts     — Distance between two GPS coordinates
    lineMapping.ts   — Public ↔ normalized ↔ schedule line ID mapping

## LINE ID MAPPING (CRITICAL)
Different systems use different IDs for the same line:
- Public name (what users see): "1", "2", "LC", "N1", "6C1", "7C1", "24C1"
- Legacy API uses: "1", "2", "LC", "N1", "6C1", "7C1", "24C1" (same as public)
- Schedules use: "1", "2", "C", "101", "61", "71", "241"
- Normalized IDs: 1→1, 2→2, LC→100, N1→101, 6C1→61, 7C1→71, 24C1→241

Mapping table:
  "1": { public:"1", schedule:"1" },
  "2": { public:"2", schedule:"2" },
  "LC": { public:"LC", schedule:"C" },
  "N1": { public:"N1", schedule:"101" },
  "N2": { public:"N2", schedule:"102" },
  "N3": { public:"N3", schedule:"103" },
  "6C1": { public:"6C1", schedule:"61" },
  "6C2": { public:"6C2", schedule:"62" },
  "7C1": { public:"7C1", schedule:"71" },
  "7C2": { public:"7C2", schedule:"72" },
  "24C1": { public:"24C1", schedule:"241" },
  "24C2": { public:"24C2", schedule:"242" },
  "C": { public:"LC", schedule:"C" }

## SCHEDULE DATA FORMAT
schedules.json has key format: "{scheduleId}-{direction}" 
Examples: "1-1" = line 1 dir 1, "C-2" = LC dir 2, "101-1" = N1 dir 1
Day types: "L" = laborables, "S" = sábado, "F" = festivo

## API ENDPOINTS TO IMPLEMENT

### GET /api/v1/health
Status of all data sources.

### GET /api/v1/lines
List all lines. Source: lineIndex.json (cached) or built from legacy API.

### GET /api/v1/lines/:line
Detail of one line.

### GET /api/v1/lines/:line/route
Full route with stops and GPS. Calls legacy API routes/get-compact ×2.

### GET /api/v1/stops
Search stops by name (?q=plaza). Source: Open Data Santander.

### GET /api/v1/stops/:stop
Stop detail with lines and nearby stops.

### GET /api/v1/stops/:stop/arrivals
Real-time arrivals. Calls legacy API POST /estimations/get-compact.

### GET /api/v1/stops/:stop/next
Only next bus. Minimal response.

### GET /api/v1/stops/:stop/next/:line
Next bus of specific line.

### GET /api/v1/stops/:stop/arrivals/:line
Arrivals filtered by line.

### GET /api/v1/lines/:line/next-at/:stop
Inverse lookup: when does this line pass this stop?

### GET /api/v1/stops/:stop/etd
Estimated departure time (absolute).

### GET /api/v1/map/stops
All 462 stops in compact format [id,lat,lng,name].

### GET /api/v1/map/lines/:line
Route as GeoJSON FeatureCollection.

### GET /api/v1/map/lines
All lines as GeoJSON.

### GET /api/v1/trip?from=X&to=Y
Trip planner between two stops. Finds direct routes and transfers.

### GET /api/v1/stops/:stop/connections
Stops reachable from this stop without transfer.

### POST /api/v1/batch/arrivals
Body: {stops:[41,171], lines:["LC"]}. Parallel calls to legacy API.

### POST /api/v1/batch/stops
Body: {stops:[41,171]}. Returns stop info.

### POST /api/v1/batch/lines
Body: {lines:["LC","1"]}. Returns line info.

### POST /api/v1/compare/lines
Body: {lines:["LC","1"]}. Side-by-side comparison.

### GET /api/v1/lines/:A/intersect/:B
Common stops between two lines.

### GET /api/v1/now
Server time.

### GET /api/v1/stops/:stop/arrivals/absolute
Arrivals with absolute ETA.

### GET /api/v1/fares
List all fare cards. Source: data/cards.json.

### GET /api/v1/fares/:id
Detail of one fare card.

### GET /api/v1/fares/compare
Compare all fares side by side.

### GET /api/v1/fares/calculator?trips=40&age=16
Calculate cheapest option for X trips/month.

### GET /api/v1/schedule/lines/:line
Scheduled times for a line. Source: data/schedules.json. Params: ?day=L|S|F&direction=1|2.

### GET /api/v1/schedule/lines/:line/next
Next scheduled departure. Params: ?day=L|S|F&direction=1|2.

### GET /api/v1/schedule/stops/:stop
Schedules of all lines at this stop.

### GET /api/v1/alerts
Active alerts (static for now, returns empty).

### GET /api/v1/lines/:line/status
Line status (active, frequency, next arrivals).

### GET /api/v1/discover
Everything a client needs at startup.

### HEAD /api/v1/discover
Headers only, no body.

### OPTIONS /api/v1
Discoverable endpoints.

### OPTIONS /api/v1/stops/:stop
Discoverable actions for this stop.

## RESPONSE CONVENTIONS
- All responses JSON
- Never return undefined fields — use null
- Array fields always present (empty array if none)
- Error format: {error:"code", message:"desc"}
- Timestamps in ISO 8601
- Source field in responses: "open_data", "legacy_api", "static"

## WORKFLOW
1. First check the data files, PLAN.md, opencode.json
2. Create INS4G database tables using the MCP tools
3. Seed the data using MCP tools
4. Write all TypeScript source files
5. Build and test
6. Report results
