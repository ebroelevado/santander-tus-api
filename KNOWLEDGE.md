# Transit API Wrapper — Knowledge Base

Todo lo descubierto durante la investigación de Mayo 2025.  
**Propósito:** Que ninguna sesión futura tenga que redescubrir lo mismo.

---

## 🔴 PECULIARIDADES CRÍTICAS

### 1. Legacy API (transitserver.miguelripoll23.deno.net)

**Formato de endpoints:** Todos son POST excepto GET /health y GET/POST /mcp.

**stopId en rutas determina la dirección:**
- `POST /api/v1/routes/get-compact {stopId: 41, lineLabel: "1"}` → dirección Valdenoja→Adarzo
- `POST /api/v1/routes/get-compact {stopId: 545, lineLabel: "1"}` → dirección Adarzo→Valdenoja
- Con stopId intermedio → solo las paradas restantes en esa dirección (no la ruta completa)

**⚠️ Si pides una ruta con un stopId que no existe en esa línea, la API NO da error.**
- Devuelve `[]` (array vacío), código 200, sin indicación de que algo falló.
- Ejemplo real: `{stopId: 999, lineLabel: "1"}` → `[]` en vez de 404

**⚠️ Si omites un campo obligatorio, expone stack traces internos:**
- `{stopId: 41}` (sin lineLabel) → error ZodDeno con el stack trace del servidor
- Mala práctica de seguridad, pero útil para debugging

**El endpoint MCP ES INÚTIL para la app de transporte:**
- GET y POST /api/v1/mcp devuelven 101 Switching Protocols (WebSocket)
- No hay documentación del protocolo
- Se IGNORA completamente en el wrapper

**Formato de compact endpoints:**
- `estimations/get-compact`: `[[[label, destination, next, following]], allLineLabels]`
- `routes/get-compact`: `[[stopId, stopName, [lines]], [stopId, stopName, [lines]], ...]`
- La app real (tus-santander) usa SIEMPRE los compactos, nunca los completos

**refresh flag en estimations:**
- `refresh: true` → no devuelve `allLineLabels` (reduce payload)
- `refresh: false` (default) → devuelve todo

**Caché en cliente:**
- Las estimaciones caducan en ~15 segundos
- Las rutas pueden cachearse por minutos

---

### 2. Open Data Santander (datos.santander.es)

**Endpoint de paradas:** `GET /datasets/paradas_bus.json`
- 462 paradas con coordenadas GPS oficiales
- `ayto:numero` → es el stopId (string, convertir a number)
- `ayto:parada` → nombre oficial
- `wgs84_pos:lat`, `wgs84_pos:long` → coordenadas WGS84
- `ayto:sentido` → dirección (66 valores únicos como "Pctcan", "Sardinero")
- `vivo:address1` → dirección postal

**⚠️ Algunos stopId de la Legacy API NO existen en Open Data:**
- stopId 545 (JOSE MARIA GONZALEZ TREVILLA 14) existe en Legacy pero no en Open Data
- Solución: fallback a stops.min.json (del repo GitHub)

**⚠️ Open Data tiene sus propios IDs internos (dc:identifier) que NO tienen relación con los stopId**

**Los horarios NO están disponibles en la API REST:**
- Los datasets `programacionTUS_horariosLineas.json` y `programaTUS_horariosTarjetas.json` devuelven 0 recursos
- Los portales de CKAN y datastore de datos.santander.es redirigen a 302 y no sirven datos
- Motivo probable: los horarios son de 2024 y el ayuntamiento no los ha actualizado
- **Solución:** Usar schedules.json hardcodeado (pasado por el usuario)

---

### 3. Sistema de IDs de Línea (EL MÁS COMPLEJO)

Cada línea tiene 3 IDs distintas según el sistema:

| Línea pública | Legacy API | Schedules JSON | Normalizada |
|:---|:---|:---|:---|
| 1 a 18 | 1 a 18 | 1 a 18 | 1 a 18 |
| LC | LC | **C** | 100 |
| N1 | N1 | **101** | 101 |
| N2 | N2 | **102** | 102 |
| N3 | N3 | **103** | 103 |
| 6C1 | 6C1 | **61** | 61 |
| 6C2 | 6C2 | **62** | 62 |
| 7C1 | 7C1 | **71** | 71 |
| 7C2 | 7C2 | **72** | 72 |
| 24C1 | 24C1 | **241** | 241 |
| 24C2 | 24C2 | **242** | 242 |
| E1 | E1 | *(sin horario)* | 41 |
| E31 | E31 | *(sin horario)* | 31 |

**Regla:** Para las líneas numéricas (1-18), todos los IDs son iguales.  
Para las líneas especiales (LC es C, N1 es 101, etc.), cada sistema tiene su propio ID.

**En el código, SIEMPRE:**
- El wrapper expone el ID público al cliente
- Internamente usa el ID de Legacy para llamar a la Legacy API
- Internamente usa el ID de Schedule para buscar en schedules.json

---

## 🟡 ARCHIVOS ESTÁTICOS

### schedules.json ("horarios_pera.json")

**Origen:** Amigo del usuario con datos hardcodeados  
**Ubicación:** `data/schedules.json`  
**Formato de clave:** `"{scheduleId}-{direction}"`
- Ejemplos: `"C-1"` (LC dir1), `"101-2"` (N1 dir2), `"1-1"` (Línea 1 dir1)

**Day types:** `"L"` = Laborables, `"S"` = Sábado, `"F"` = Festivo

**⚠️ Líneas sin horarios:** E1, E31, E2, E3, E4, E7, 5C1, 5C2, SE, 99 no aparecen

**⚠️ Líneas nocturnas solo tienen "F":** N1 (101), N2 (102), N3 (103)

**⚠️ Algunas líneas no tienen festivos:** 24C1 (241), 24C2 (242) → `"F": []`

**Total:** 37 entradas (línea+dirección) con ~3200 horarios en total

### stops.min.json

**Origen:** Repositorio GitHub de MiguelRipoll23 (tus-santander)  
**Ubicación:** `data/stops.min.json`  
**Formato:** `{"41": [41, lat, lng, "Plaza Ayuntamiento"]}`  
**Total paradas:** ~350  
**Uso:** FALLBACK cuando una parada no existe en Open Data

### colors.json

**Origen:** LineConstants.ts del repositorio tus-santander  
**Ubicación:** `data/colors.json`  
**Formato:** `{"1": [255,0,0], "LC": [23,46,255], "default": [0,122,255]}`  
**Colores especiales:** Las líneas 18 y 17 tienen texto negro (las demás blanco)

### cards.json

**Origen:** Proporcionado por el usuario  
**Ubicación:** `data/cards.json`  
**Formato:** Array de tarjetas con modelo_gestion (payAsYouGo, subscription, freePass)  
**Total:** 7 tarjetas: estándar, jovenTrimestral, discapacidad, familiaNumerosa, mayor, pequeTUS, juvenil

---

## 🔵 DESCUBRIMIENTOS DE TESTING

### Pruebas realizadas con curl

1. **Línea 1 desde Plaza Ayuntamiento (stopId 41):**
   - `POST /routes/get {stopId: 41, lineLabel: "1"}` → 39 paradas (dirección Valdenoja→Adarzo)
   - Recorrido: José Mª Glez Trevilla → Glorieta de Adarzo

2. **Línea 1 desde el otro extremo (stopId 545):**
   - `POST /routes/get {stopId: 545, lineLabel: "1"}` → 35 paradas (dirección Adarzo→Valdenoja)
   - Recorrido inverso

3. **Línea LC (central):**
   - `POST /routes/get {stopId: 41, lineLabel: "LC"}` → 9 paradas
   - Recorrido: Intercambiador Sardinero → Intercambiador Avda. Valdecilla

4. **stopId inexistente (999):**
   - `POST /routes/get {stopId: 999, lineLabel: "1"}` → `[]` (200 OK, sin error)

5. **LineLabel omitido:**
   - `POST /routes/get {stopId: 41}` → error ZodDeno

6. **Estimaciones sin refresh:**
   - `POST /estimations/get {stopId: 41}` → 9 líneas activas + 15 etiquetas

7. **Estimaciones con refresh=true:**
   - `POST /estimations/get {stopId: 41, refresh: true}` → 9 líneas activas, sin allLineLabels

---

## 🟢 APP REAL (tus-santander de MiguelRipoll23)

**Repositorio:** `https://github.com/MiguelRipoll23/tus-santander`  
**Rama principal:** `production`  
**543 commits, app React/TypeScript + Vite**

**Lo que aprendimos del código fuente:**

1. **Usa los endpoints compactos** (`/estimations/get-compact`, `/routes/get-compact`)
2. **Tiene stops.min.json** empaquetado con la app (fuente de coordenadas GPS)
3. **Google Maps** para autocompletar direcciones y calcular rutas
4. **API_HOST** configurable por .env: `VITE_APP_API_HOST` (default: `http://localhost:8000`)
5. **Colores de línea** hardcodeados en `LineConstants.ts`
6. **El mapeo de IDs normalizadas** viene de `SharedModels.swift` (la app iOS original)

---

## 🟣 INS4G

**Configuración:** MCP para OpenCode  
**Endpoint:** `http://158.179.210.240:7130` (VPS del usuario)  
**API Key:** `ik_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`  
**Instalado como MCP en:** `opencode.json`

**Uso previsto:** Base de datos PostgreSQL para el wrapper (stops, lines, schedules, fares)

---

## ⚪ CONVENCIONES DE LA API WRAPPER

### Naming (diferente de Legacy)
- `stop` no `stopId`
- `line` no `lineLabel`
- `arrivals` no `estimations`
- `minutes` no `next`
- `next` no `following`

### Null Safety
- **NUNCA `undefined`** → siempre `null`
- Arrays siempre presentes (vacíos si no hay datos)
- `minutes: null` significa "sin datos para esta línea"
- `active: false` significa "línea existe pero no está operativa"

### Fuentes (campo `source` en respuestas)
- `"open_data"` → Open Data Santander
- `"legacy_api"` → Legacy API (tiempo real)
- `"static"` → Archivos locales (schedules, cards, colors)
- `"stops_min"` → Fallback de stops.min.json
- `"cache"` → Datos cacheados

### Timestamps
- Siempre ISO 8601: `"2025-05-03T12:00:00Z"`
- Timezone del servidor: Europe/Madrid (UTC+2 en verano)

---

## 📁 ESTRUCTURA DEL PROYECTO

```
/home/graditos/transit-api-wrapper/
├── SPECIFICATION.md          ← Especificación completa (42KB)
├── opencode.json             ← Config de INS4G como MCP
├── package.json              ← Node.js + Express + TypeScript
├── tsconfig.json
├── data/
│   ├── stops.min.json        ← Fallback ~350 paradas
│   ├── colors.json           ← Colores RGB por línea
│   ├── cards.json            ← 7 tarjetas/abonos
│   └── schedules.json        ← Horarios hardcodeados
└── src/ (pendiente de crear)
    ├── index.ts              ← Entry point Express
    ├── config.ts             ← URLs y constantes
    ├── sources/
    │   ├── openData.ts       ← Cliente Open Data Santander
    │   ├── legacyApi.ts      ← Cliente Legacy API
    │   └── lineIndex.ts      ← Generador de catálogo
    ├── routes/               ← 30+ endpoints
    └── utils/
        ├── haversine.ts      ← Cálculo de distancias
        └── lineMapping.ts    ← Mapeo de IDs de línea
```

---

## 🚀 PARA EMPEZAR A CONSTRUIR

1. **Abrir sesión nueva con DeepSeek V4 Pro**
2. **Decirle a Hermes:** "Implementa el backend según `/home/graditos/transit-api-wrapper/SPECIFICATION.md` usando INS4G como backend"
3. **Alternativamente:** "Lanza OpenCode con el prompt de OPENCODE_PROMPT.md"

---

*Documento generado el 3 de Mayo de 2025. Actualizar con nuevos descubrimientos.*
