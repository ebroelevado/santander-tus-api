# TASK: Complete Transit API Wrapper — Remaining Route Files + Server Entry Point

Working directory: /home/graditos/transit-api-wrapper

## FILES ALREADY CREATED (DO NOT MODIFY)
- src/types.ts — All TypeScript types (Stop, Arrival, LineInfo, ApiError)
- src/config.ts — URLs, constants, cache TTLs
- src/utils/haversine.ts — GPS distance calculation  
- src/utils/lineMapping.ts — Line ID mapping (public↔legacy↔schedule)
- src/sources/openData.ts — Open Data Santander client (getStops, getStopById, searchStops)
- src/sources/legacyApi.ts — Legacy TUS API client (getArrivals, getRoute, getHealth)
- src/sources/lineIndex.ts — Line catalog builder (buildLineIndex, getLines, getLine, getLinesForStop, getLineStops)
- src/routes/health.ts — GET /api/v1/health
- src/routes/discover.ts — GET|HEAD /api/v1/discover
- src/routes/lines.ts — GET /lines, /lines/:line, /lines/:line/route, /lines/:A/intersect/:B
- src/routes/stops.ts — GET /stops, /stops/:stop
- src/routes/batch.ts — POST /batch/arrivals, /batch/stops, /batch/lines
- src/routes/fares.ts — GET /fares, /fares/:id, /fares/compare, /fares/calculator
- src/routes/map.ts — GET /map/stops, /map/lines/:line, /map/lines
- src/routes/schedules.ts — GET /schedule/lines/:line, /schedule/lines/:line/next, /schedule/stops/:stop
- src/routes/trip.ts — GET /trip, /stops/:stop/connections

## FILES TO CREATE (6 files)

### 1. src/routes/arrivals.ts

Express Router with 5 endpoints:

**GET /api/v1/stops/:stop/arrivals** (?line=X&refresh=true optional)
- Call legacyApi.getArrivals(stopId, lineLabel)
- Parse compact format: [[[label, destination, next, following]], allLineLabels] or [[[label, dest, next, following]], upcomingStops[]]
- Enrich each arrival with color from colors.json (import colorsRaw from '../../data/colors.json')
- If line param present: return upcoming stops with GPS coords (from openData.getStopById or stops.min.json fallback)
- Response: { stop: {stopId, name, lat, lng}, updated: ISO, arrivals: [{line, destination, color, minutes, next, active, stops: [{stopId, name, lat, lng}]}], all_lines: string[] }

**GET /api/v1/stops/:stop/next**
- Simplified: just first arrival or all null. Response: { line, destination, minutes, color } (all null if no buses)

**GET /api/v1/stops/:stop/next/:line**
- Single line arrival. Response: { line, destination, minutes, next, color, active }

**GET /api/v1/stops/:stop/arrivals/:line**
- Same as next/:line

**GET /api/v1/lines/:line/next-at/:stop**
- Inverse lookup. Response: { line, stop: number, stop_name: string, destination, minutes, next, active }

COLORS: colors.json format is {"1":[255,0,0], "LC":[23,46,255], "default":[0,122,255]}. Convert RGB array to hex: `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`

LEGACY API RESPONSE FORMAT for arrivals with lineLabel:
- First element: [[[label, destination, nextMinutes, followingMinutes]]] (active arrivals)
- Second element: [stopId, stopId, ...] (upcoming stops)

LEGACY API RESPONSE FORMAT for arrivals WITHOUT lineLabel:
- First element: [[[label, destination, nextMinutes, followingMinutes], ...]] (all active lines)
- Second element: [lineLabel, lineLabel, ...] (allLineLabels)

### 2. src/routes/compare.ts

**POST /api/v1/compare/lines**
- Body: { lines: ["LC", "1"] }
- For each line pair, compute common_stops (intersection of stop ID arrays from both directions)
- Response: { lines: [{id, stops, common_stops_with: {otherId: count}}], common_stops: [stopId, ...] }

### 3. src/routes/time.ts

**GET /api/v1/now**
- Response: { server_time: ISO, timezone: "Europe/Madrid", local_time: ISO with +02:00 }

**GET /api/v1/stops/:stop/etd**
- Get arrivals, compute etd = server_time + minutes (ms). Format as ISO 8601.
- Response: { stop: number, server_time, arrivals: [{line, destination, color, minutes, etd: ISO, etd_local: "HH:mm"}] }

**GET /api/v1/stops/:stop/arrivals/absolute**
- Same as etd endpoint

### 4. src/routes/alerts.ts

**GET /api/v1/alerts**
- Response: { alerts: [], total: 0, source: "static" }

**GET /api/v1/lines/:line/status**
- Get line info from lineIndex
- Try to get arrivals to check activity
- Get schedule info (first/last from schedules.json)
- Response: { line, active: boolean, frequency_min: number, has_alerts: false, alerts: [], last_known_bus_minutes_ago: number|null, schedule: { status, next_scheduled, service_hours: {first, last} } }

### 5. src/routes/dx.ts

**OPTIONS /api/v1**
- Headers: Allow: GET, POST, HEAD, OPTIONS
- Link headers for discoverable endpoints: /lines, /stops, /discover, /fares, /trip

**OPTIONS /api/v1/stops/:stop**
- Headers: Allow: GET, OPTIONS
- Link headers: self, arrivals, next-bus, etd

### 6. src/index.ts — MAIN SERVER

Import express, cors, all route modules. Mount them:
```
app.use('/api/v1', healthRouter);       // GET /health
app.use('/api/v1', discoverRouter);     // GET|HEAD /discover
app.use('/api/v1', linesRouter);        // GET /lines, /lines/:line, /lines/:line/route
app.use('/api/v1', stopsRouter);        // GET /stops, /stops/:stop
app.use('/api/v1', arrivalsRouter);     // GET /stops/:stop/arrivals, /next, etc.
app.use('/api/v1/map', mapRouter);
app.use('/api/v1', tripRouter);
app.use('/api/v1/batch', batchRouter);
app.use('/api/v1/compare', compareRouter);
app.use('/api/v1', timeRouter);
app.use('/api/v1/fares', faresRouter);
app.use('/api/v1/schedule', schedulesRouter);
app.use('/api/v1', alertsRouter);
app.use('/api/v1', dxRouter);
```

Global error handler:
```typescript
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error', message: err.message, source: 'internal', timestamp: new Date().toISOString() });
});
```

On startup: call buildLineIndex() then listen on PORT (3000). Log version.

After creating all 6 files, run: npm run build

## IMPORTANT DATA FORMATS

schedules.json: { "horarios_hardcoded": { "C-1": { "L": ["07:08",...], "S": [...], "F": [...] } } }
Key format: "{scheduleId}-{direction}". Schedule IDs: C=LC, 101=N1, 61=6C1, 71=7C1, 241=24C1, numbers stay same.

cards.json: { "tarjetas_tus": [{ id, tipo, descripcion, modelo_gestion, coste_viaje_2025, color, features: [{titulo, detalle, icono}] }] }

colors.json: { "1":[255,0,0], "LC":[23,46,255], "default":[0,122,255] }

stops.min.json: { "41": [41, 43.461656, -3.810178, "Plaza Ayuntamiento"] }

## CONVENTIONS
- All fields present, never undefined (use null)
- Arrays always present (empty if none)
- Timestamps ISO 8601
- Source field: "open_data", "legacy_api", "static", "stops_min"
