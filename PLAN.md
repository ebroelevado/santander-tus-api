# PLAN: Transit API Wrapper with INS4G

## Architecture
- Node.js + Express + TypeScript server
- INS4G BaaS for database (stops, lines, schedules, fares)
- In-memory cache for real-time data (estimations from Legacy API)
- Open Data Santander (462 stops) + Legacy API (real-time) + Static data

## Data Sources
1. **Open Data Santander** - 462 stops with GPS (fetch at startup from datos.santander.es)
2. **Legacy API** - transitserver.miguelripoll23.deno.net (real-time arrivals, routes)
3. **Static files** in /data/: stops.min.json (fallback), colors.json, cards.json, schedules.json

## INS4G Tables to Create
- `stops`: stopId, name, lat, lng, address, sentido, identifier (from open data)
- `lines`: lineId (normalized), publicName, color, textColor, destinations
- `route_stops`: lineId, direction, stopOrder, stopId  
- `schedules`: lineId, direction, dayType (L/S/F), times[]
- `fares`: cardId, type, price, features, color

## Express Server Routes (30 endpoints)
All routes defined in transit-api-wrapper-v3.md

## Line ID Mapping
Public → Normalized → Schedule
1→1→1, 2→2→2, ... 18→18→18
LC→100→C, N1→101→101, N2→102→102, N3→103→103
E1→41 (no schedule), E31→31 (no schedule)
5C1→51, 6C1→61→61, 7C1→71→71, 24C1→241→241, etc.

## Implementation Steps
1. Install deps (npm install)
2. Create INS4G tables using MCP tools
3. Write data loader (seed stops, lines, schedules from static files + open data)
4. Write Express server with all routes
5. Test
