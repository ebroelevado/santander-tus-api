# Transit API Wrapper — Especificación Técnica Completa v3.0

**Autor:** Peramato & Hermes  
**Fecha:** Mayo 2025  
**Propósito:** Backend unificado para datos del Transporte Urbano de Santander (TUS)

---

## Índice

1. [Arquitectura General](#1-arquitectura-general)
2. [Fuentes de Datos](#2-fuentes-de-datos)
3. [Sistema de IDs de Línea](#3-sistema-de-ids-de-línea)
4. [Modelo de Datos](#4-modelo-de-datos)
5. [Especificación de Endpoints](#5-especificación-de-endpoints)
6. [Diagramas de Flujo Interno](#6-diagramas-de-flujo-interno)
7. [Manejo de Errores](#7-manejo-de-errores)
8. [Plan de Implementación](#8-plan-de-implementación)

---

## 1. Arquitectura General

### 1.1 Diagrama de Capas

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENTE (App / Web / CLI)                     │
│               fetch("/api/v1/stops/41/arrivals")                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    TRANSIT API WRAPPER (Node.js + Express)           │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Router   │  │ Cache    │  │ Utils    │  │ INS4G Client     │   │
│  │ (30 rutas)│  │ (en       │  │ (havers. │  │ (BaaS: DB, Auth) │   │
│  │          │  │  memoria) │  │  lineMap)│  │                  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    ORQUESTADOR DE FUENTES                      │  │
│  │  Decide qué fuente usar para cada petición según el tipo      │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌─────────────────┐ ┌─────────────────┐ ┌──────────────────────┐
│ OPEN DATA        │ │ LEGACY API      │ │ DATOS ESTÁTICOS      │
│ SANTANDER        │ │ TUS             │ │ (Locales, en /data/) │
├─────────────────┤ ├─────────────────┤ ├──────────────────────┤
│ Fuente oficial   │ │ Tiempo real     │ │ stops.min.json       │
│ 462 paradas GPS  │ │ Estimaciones    │ │ colors.json          │
│ Nombres, sentido │ │ Rutas de línea  │ │ cards.json           │
│ Direcciones      │ │ (2 llamadas     │ │ schedules.json       │
│                  │ │  por dirección) │ │ lineIndex (generado) │
└─────────────────┘ └─────────────────┘ └──────────────────────┘
```

### 1.2 Estrategia de Resolución por Tipo de Dato

| Tipo de Dato | Fuente Primaria | Fuente Secundaria | Cache |
|:---|---:|---:|---:|
| Paradas (nombre, GPS) | Open Data (462) | stops.min.json (~350) | 1 hora |
| Líneas (catálogo) | lineIndex (generado) | — | 24 horas |
| Rutas de línea | Legacy API (×2 llamadas) | lineIndex (copia) | 1 minuto |
| Estimaciones (real) | Legacy API | — | 15 segundos |
| Horarios programados | schedules.json | — | Estático |
| Tarifas/Abonos | cards.json | — | Estático |
| Colores de línea | colors.json | — | Estático |
| Alertas | Static (vacío) | — | — |

### 1.3 Tecnologías

| Componente | Tecnología | Versión |
|:---|---:|---:|
| Runtime | Node.js | ≥18 |
| Framework HTTP | Express | 4.x |
| Lenguaje | TypeScript | 5.x |
| BaaS / DB | INS4G | Via MCP |
| Cache en memoria | Map<K,V> nativo | — |
| Cliente HTTP | node-fetch | 2.x |

---

## 2. Fuentes de Datos

### 2.1 Open Data Santander

**URL:** `https://datos.santander.es/api/rest/datasets/paradas_bus.json`

**Método:** GET  
**Total paradas:** 462  
**Frecuencia de sincronización:** Cada 1 hora (o al arrancar)

**Endpoint de consulta:**
```
GET https://datos.santander.es/api/rest/datasets/paradas_bus.json
```

**Formato de respuesta:**
```json
{
  "summary": { "items": 462 },
  "resources": [
    {
      "ayto:numero": "41",
      "ayto:parada": "Plaza Ayuntamiento",
      "wgs84_pos:lat": 43.461656,
      "wgs84_pos:long": -3.810178,
      "ayto:sentido": "Pctcan",
      "vivo:address1": "Plaza del Ayuntamiento",
      "dc:identifier": "200",
      "ayto:coordX_ETRS89": 434510.91,
      "ayto:coordY_ETRS89": 4815241.76,
      "dc:modified": "2026-05-03T09:31:58Z"
    }
  ]
}
```

**Campos relevantes:**

| Campo API | Mapeo interno | Tipo | Ejemplo |
|:---|---:|---:|---:|
| `ayto:numero` | `stopId` | string → number | `"41"` |
| `ayto:parada` | `name` | string | `"Plaza Ayuntamiento"` |
| `wgs84_pos:lat` | `lat` | number | `43.461656` |
| `wgs84_pos:long` | `lng` | number | `-3.810178` |
| `ayto:sentido` | `sentido` | string | `"Pctcan"` |
| `vivo:address1` | `address` | string | `"Plaza del Ayuntamiento"` |
| `dc:identifier` | `internalId` | string | `"200"` |

**Uso en la API:** Es la fuente principal para nombres de parada y coordenadas GPS. Se carga completa en memoria al arrancar.

### 2.2 Legacy API (transitserver.miguelripoll23.deno.net)

**URL base:** `https://transitserver.miguelripoll23.deno.net`

#### Endpoint: Estimaciones

```
POST /api/v1/estimations/get-compact
Content-Type: application/json

Body: { "stopId": 41, "lineLabel": "LC" }

Response 200:
[
  [ ["LC", "INT. AVDA. VALDECILLA", 8, 22] ],
  ["1", "2", "LC", "N1"]
]
```

**Formato de respuesta compacto:**
- Primer elemento: array de líneas activas, cada una como `[label, destination, nextMinutes, followingMinutes]`
- Segundo elemento: cuando hay lineLabel → upcoming stops; sin lineLabel → allLineLabels de la parada

#### Endpoint: Rutas

```
POST /api/v1/routes/get-compact
Content-Type: application/json

Body: { "stopId": 41, "lineLabel": "LC" }

Response 200:
[
  [516, "INTERCAMBIADOR SARDINERO", ["LC","3","4","E31","E1"]],
  [171, "ALCALDE VEGA LAMERA 1", ["LC","24C1","E31"]],
  [41, "PLAZA AYUNTAMIENTO", ["1","2","11","LC","N1"]]
]
```

**Formato de respuesta:**
- Cada elemento: `[stopId, stopName, lines[]]`
- El stopId de entrada determina la dirección:
  - stopId al inicio de la línea → dirección A
  - stopId al final de la línea → dirección B

**Importante:** Si stopId no existe, devuelve `[]` (array vacío, no error).

#### Flujo para obtener ambas direcciones de una línea:
1. Llamada 1: `{stopId: inicioConocido, lineLabel: "1"}` → dirección A
2. Llamada 2: `{stopId: finalDirA, lineLabel: "1"}` → dirección B

### 2.3 stops.min.json (Fallback)

**Archivo:** `data/stops.min.json`  
**Origen:** Repositorio GitHub tus-santander (MiguelRipoll23)  
**Total paradas:** ~350  
**Propósito:** Fallback para paradas que no aparecen en Open Data Santander

**Formato:**
```json
{
  "41": [41, 43.461656, -3.810178, "Plaza Ayuntamiento"],
  "545": [545, 43.4839, -3.7967, "JOSE MARIA GONZALEZ TREVILLA 14"]
}
```

**Nota:** Paradas como la 545 existen en stops.min.json pero NO en Open Data. Por eso se usa como fallback.

### 2.4 colors.json

**Archivo:** `data/colors.json`  
**Origen:** LineConstants.ts del repositorio tus-santander  
**Propósito:** Colores RGB para cada línea

**Formato:**
```json
{
  "1": [255, 0, 0],
  "LC": [23, 46, 255],
  "N1": [173, 173, 173],
  "default": [0, 122, 255]
}
```

### 2.5 cards.json

**Archivo:** `data/cards.json`  
**Origen:** Proporcionado por el usuario  
**Total tarjetas:** 7

**Formato:**
```json
{
  "tarjetas_tus": [
    {
      "id": "estandar",
      "tipo": "Tarjeta estándar recargable",
      "descripcion": "Tarjeta monedero para cualquier usuario...",
      "modelo_gestion": "payAsYouGo",
      "coste_viaje_2025": 0.40,
      "color": "blue",
      "features": [
        {"titulo": "Coste del Viaje (2025)", "detalle": "0,33 € (1er semestre)..."}
      ]
    }
  ]
}
```

**Modelos de gestión (modelo_gestion):**
| Valor | Significado | Ejemplo |
|:---|---:|---:|
| `payAsYouGo` | Pago por viaje | Tarjeta estándar |
| `subscription` | Abono periódico | Carné Joven, Discapacidad |
| `freePass` | Pase gratuito | Familia Numerosa, Mayor |

### 2.6 schedules.json

**Archivo:** `data/schedules.json`  
**Origen:** Proporcionado por el usuario (colega con datos hardcodeados)  
**Total entradas:** 37 (línea+dirección)

**Formato:**
```json
{
  "horarios_hardcoded": {
    "1-1": {
      "L": ["07:00", "07:15", "07:32", ...],
      "S": ["07:24", "07:50", ...],
      "F": ["07:24", "07:50", ...]
    },
    "1-2": {
      "L": ["07:51", "08:06", ...]
    },
    "C-1": {
      "L": ["07:08", "07:23", ...],
      "S": ["07:23", ...],
      "F": ["07:23", ...]
    }
  }
}
```

**Formato de clave:** `"{scheduleId}-{direction}"`
- `scheduleId`: ID según el mapeo de schedules (ver sección 3)
- `direction`: 1 o 2
- Day types: `L`=Laborables, `S`=Sábado, `F`=Festivo

### 2.7 lineIndex (Cache Generado)

**No es un archivo estático.** Se genera automáticamente al arrancar el wrapper.

**Algoritmo de generación:**
1. Llamar a `POST /api/v1/estimations/get-compact {stopId: 41}` para obtener `allLineLabels`
2. Para cada línea descubierta:
   a. Llamar a rutas desde parada inicio y parada final para obtener ambas direcciones
   b. Enriquecer cada parada con coordenadas GPS
3. Almacenar en memoria (y opcionalmente persistir como JSON)

**Formato generado:**
```json
{
  "LC": {
    "id": "LC",
    "scheduleId": "C",
    "color": "#172EFF",
    "destinations": ["SARDINERO", "INT. AVDA. VALDECILLA"],
    "directions": {
      "1": { "stops": [516, 511, 171, 76, 39, 40, 41, 43, 512] },
      "2": { "stops": [512, 43, 41, 40, 39, 76, 171, 511, 516] }
    }
  }
}
```

---

## 3. Sistema de IDs de Línea

### 3.1 Mapa Completo de IDs

Cada línea tiene 3 representaciones distintas según el sistema:

| Línea (público) | ID Legacy API | ID Schedule | Normalizada |
|:---|---:|---:|---:|
| 1 | `"1"` | `"1"` | `1` |
| 2 | `"2"` | `"2"` | `2` |
| 3 | `"3"` | `"3"` | `3` |
| 4 | `"4"` | `"4"` | `4` |
| 11 | `"11"` | `"11"` | `11` |
| 12 | `"12"` | `"12"` | `12` |
| 13 | `"13"` | `"13"` | `13` |
| 14 | `"14"` | `"14"` | `14` |
| 15 | `"15"` | `"15"` | `15` |
| 16 | `"16"` | `"16"` | `16` |
| 17 | `"17"` | `"17"` | `17` |
| 18 | `"18"` | `"18"` | `18` |
| LC | `"LC"` | `"C"` | `100` |
| N1 | `"N1"` | `"101"` | `101` |
| N2 | `"N2"` | `"102"` | `102` |
| N3 | `"N3"` | `"103"` | `103` |
| 6C1 | `"6C1"` | `"61"` | `61` |
| 6C2 | `"6C2"` | `"62"` | `62` |
| 7C1 | `"7C1"` | `"71"` | `71` |
| 7C2 | `"7C2"` | `"72"` | `72` |
| 24C1 | `"24C1"` | `"241"` | `241` |
| 24C2 | `"24C2"` | `"242"` | `242` |
| E1 | `"E1"` | *sin horario* | `41` |
| E31 | `"E31"` | *sin horario* | `31` |

### 3.2 Tabla de Lookup en Código

```typescript
// En src/utils/lineMapping.ts

interface LineMapping {
  publicId: string;     // Lo que ve el usuario: "LC", "1", "N1"
  legacyId: string;     // Lo que usa la Legacy API
  scheduleId: string;   // Lo que usa schedules.json ("C" para LC)
  normalized: number;   // ID numérica única
}

const LINE_MAP: Record<string, LineMapping> = {
  "1":   { publicId: "1",   legacyId: "1",   scheduleId: "1",   normalized: 1 },
  "LC":  { publicId: "LC",  legacyId: "LC",  scheduleId: "C",   normalized: 100 },
  "N1":  { publicId: "N1",  legacyId: "N1",  scheduleId: "101", normalized: 101 },
  // ... todas las líneas
};

function toScheduleId(publicId: string): string {
  return LINE_MAP[publicId]?.scheduleId ?? publicId;
}
function toLegacyId(publicId: string): string {
  return LINE_MAP[publicId]?.legacyId ?? publicId;
}
```

### 3.3 Correspondencia con schedules.json

La clave en schedules.json se construye como: `"{scheduleId}-{direction}"`

Ejemplos de búsqueda:
- `GET /api/v1/schedule/lines/LC?direction=1&day=L`
  → lookup: LC → scheduleId="C"
  → clave: "C-1"
  → day: "L"
  → devuelve: ["07:08", "07:23", "07:38", ...]

- `GET /api/v1/schedule/lines/N1?direction=2&day=F`
  → lookup: N1 → scheduleId="101"
  → clave: "101-2"
  → day: "F"
  → devuelve: ["23:30", "00:30", "01:30", ...]

---

## 4. Modelo de Datos

### 4.1 Stop (Parada)

| Campo | Tipo | Fuente | ¿Siempre presente? | Descripción |
|:---|---:|---:|---:|---:|
| `stopId` | number | Open Data / stops.json | ✅ | ID único de la parada |
| `name` | string | Open Data | ✅ | Nombre oficial |
| `lat` | number | Open Data | ✅ | Latitud GPS (WGS84) |
| `lng` | number | Open Data | ✅ | Longitud GPS (WGS84) |
| `address` | string | Open Data | ❌ | Dirección postal |
| `sentido` | string | Open Data | ❌ | Dirección de la parada |
| `lines` | string[] | lineIndex (cruce) | ✅ | Líneas que pasan |
| `source` | string | Interno | ✅ | `"open_data"` o `"stops_min"` |

### 4.2 Line (Línea)

| Campo | Tipo | Fuente | ¿Siempre presente? |
|:---|---:|---:|---:|
| `id` | string | lineIndex | ✅ |
| `name` | string | Generado | ✅ |
| `color` | string | colors.json | ✅ |
| `text_color` | string | colors.json | ✅ |
| `destinations` | string[] | lineIndex | ✅ |
| `stops` | number | lineIndex | ✅ |
| `has_schedule` | boolean | schedules.json | ✅ |

### 4.3 Arrival (Estimación/Llegada)

| Campo | Tipo | ¿Siempre presente? | Descripción |
|:---|---:|---:|---:|
| `line` | string | ✅ | ID de línea |
| `destination` | string | ✅ | Destino del bus |
| `color` | string | ✅ | Color hex |
| `minutes` | number|null | ✅ | Minutos hasta próxima llegada |
| `next` | number|null | ✅ | Minutos hasta la siguiente |
| `active` | boolean | ✅ | `false` si línea sin servicio |

### 4.4 ScheduledTime (Horario)

| Campo | Tipo | ¿Siempre presente? |
|:---|---:|---:|
| `time` | string (HH:mm) | ✅ |
| `line` | string | ✅ |
| `direction` | string (1/2) | ✅ |
| `day_type` | string (L/S/F) | ✅ |

### 4.5 Fare (Tarjeta/Abono)

| Campo | Tipo | ¿Siempre presente? |
|:---|---:|---:|
| `id` | string | ✅ |
| `name` | string | ✅ |
| `type` | string | ✅ |
| `management_model` | string | ✅ |
| `price` | number|null | ✅ |
| `color` | string | ✅ |
| `features` | Feature[] | ✅ |

### 4.6 Error

| Campo | Tipo | ¿Siempre presente? |
|:---|---:|---:|
| `error` | string | ✅ |
| `message` | string | ✅ |
| `source` | string | ✅ |
| `timestamp` | string (ISO 8601) | ✅ |

---

## 5. Especificación de Endpoints

### 5.1 CORE (7 endpoints)

---

#### GET /api/v1/health

**Propósito:** Health check del wrapper + todas las fuentes.

**Entrada:** Ninguna

**Flujo interno:**
1. Verificar que Open Data Santander respondió en el último minuto
2. Verificar que la Legacy API responde (`GET /health`, espera 204)
3. Verificar que el cache de líneas está cargado
4. Verificar que los archivos estáticos existen

**Salida 200:**
```json
{
  "status": "ok",
  "timestamp": "2025-05-03T12:00:00Z",
  "uptime_seconds": 3600,
  "sources": {
    "open_data": {
      "status": "ok",
      "stops_cached": 462,
      "last_update": "2026-05-03T09:31:58Z",
      "age_seconds": 120
    },
    "legacy_api": {
      "status": "ok",
      "latency_ms": 45,
      "last_check": "2025-05-03T12:00:00Z"
    }
  },
  "cache": {
    "stops": { "loaded": true, "count": 462, "source": "open_data" },
    "lines": { "loaded": true, "count": 25 },
    "lines_age_seconds": 120
  },
  "version": "3.0.0"
}
```

**Casos de error:**
| Código | Condición |
|:---|---:|
| 503 | Legacy API no responde |
| 503 | Open Data no responde |

---

#### GET /api/v1/lines

**Propósito:** Catálogo completo de líneas. Primer endpoint que llama cualquier app.

**Entrada:** Ninguna

**Flujo interno:**
1. Si lineIndex no existe → generarlo:
   a. `POST /api/v1/estimations/get-compact {stopId: 41}` → obtener allLineLabels
   b. Para cada línea: `POST /api/v1/routes/get-compact` × 2 (inicio y final)
   c. Enriquecer con colores de colors.json
   d. Enriquecer con horarios de schedules.json
2. Devolver lista ordenada

**Salida 200:**
```json
{
  "lines": [
    {
      "id": "1",
      "name": "Línea 1",
      "color": "#FF0000",
      "text_color": "white",
      "destinations": ["ADARZO", "VALDENOJA"],
      "stops": 74,
      "has_schedule": true,
      "active": true
    },
    {
      "id": "LC",
      "name": "Línea LC",
      "color": "#172EFF",
      "text_color": "white",
      "destinations": ["INT. AVDA. VALDECILLA", "SARDINERO"],
      "stops": 18,
      "has_schedule": true,
      "active": true
    }
  ],
  "total": 25,
  "updated": "2025-05-03T12:00:00Z"
}
```

**Caché:** 24 horas

---

#### GET /api/v1/lines/:line

**Propósito:** Detalle de una línea específica.

**Entrada:** `:line` → ID público de la línea (ej: "LC", "1", "N1")

**Flujo interno:**
1. Buscar `:line` en lineIndex
2. Si no existe → 404
3. Cruzar con colors.json para color
4. Cruzar con schedules.json para saber si tiene horarios

**Salida 200:**
```json
{
  "id": "LC",
  "name": "Línea LC",
  "color": "#172EFF",
  "text_color": "white",
  "schedule_id": "C",
  "destinations": {
    "1": "INT. AVDA. VALDECILLA",
    "2": "SARDINERO"
  },
  "stats": {
    "stops_total": 18,
    "stops_direction_1": 9,
    "stops_direction_2": 9
  },
  "has_schedule": true,
  "active": true
}
```

**Salida 404:**
```json
{ "error": "line_not_found", "message": "La línea '99' no existe" }
```

---

#### GET /api/v1/lines/:line/route

**Propósito:** Ruta completa de una línea con coordenadas GPS.

**Parámetros opcionales:** `?direction=1|2|all` (default: all)

**Flujo interno:**
1. Obtener stopIds de lineIndex para la línea
2. Si no hay cache → generar llamando a Legacy API:
   - `POST /api/v1/routes/get-compact {stopId: inicio, lineLabel}`
   - `POST /api/v1/routes/get-compact {stopId: final, lineLabel}`
3. Para cada parada, buscar coordenadas en:
   - Open Data Santander (primario)
   - stops.min.json (fallback)
4. Devolver paradas ordenadas con GPS

**Salida 200:**
```json
{
  "line": "1",
  "color": "#FF0000",
  "directions": [
    {
      "id": "1",
      "destination": "GLORIETA DE ADARZO",
      "stops": [
        {
          "stopId": 545,
          "name": "JOSE MARIA GONZALEZ TREVILLA 14",
          "lat": 43.4839,
          "lng": -3.7967,
          "sentido": "A.Odriozola",
          "lines": ["1", "13"],
          "source": "stops_min"
        }
      ]
    }
  ]
}
```

---

#### GET /api/v1/stops

**Propósito:** Buscar paradas por nombre.

**Parámetros opcionales:** `?q=plaza&limit=10&offset=0`
- Si no hay `q`: devuelve todas las paradas (paginado)
- Si hay `q`: búsqueda case-insensitive en nombre

**Flujo interno:**
1. Si hay `q`: filtrar paradas de Open Data cuyo nombre contenga `q` (case-insensitive)
2. Si no hay `q`: devolver paginado
3. Para cada resultado, cruzar con lineIndex para obtener líneas

**Salida 200:**
```json
{
  "results": [
    {
      "stopId": 41,
      "name": "Plaza Ayuntamiento",
      "lat": 43.4617,
      "lng": -3.8102,
      "address": "Plaza del Ayuntamiento",
      "sentido": "Pctcan",
      "lines": ["1", "2", "11", "LC", "N1"],
      "source": "open_data"
    }
  ],
  "total": 12,
  "query": "plaza",
  "source": "open_data"
}
```

---

#### GET /api/v1/stops/:stop

**Propósito:** Detalle completo de una parada.

**Entrada:** `:stop` → stopId numérico

**Flujo interno:**
1. Buscar stopId en Open Data Santander
2. Si no está → buscar en stops.min.json
3. Si no está en ninguna → 404
4. Cruzar con lineIndex para líneas que pasan
5. Calcular paradas cercanas (haversine, radio 300m)

**Salida 200:**
```json
{
  "stopId": 41,
  "name": "Plaza Ayuntamiento",
  "lat": 43.4617,
  "lng": -3.8102,
  "address": "Plaza del Ayuntamiento",
  "sentido": "Pctcan",
  "source": "open_data",
  "lines": [
    { "id": "1", "color": "#FF0000", "destinations": ["ADARZO", "VALDENOJA"] },
    { "id": "LC", "color": "#172EFF", "destinations": ["SARDINERO", "INT. AVDA. VALDECILLA"] }
  ],
  "nearby": [
    { "stopId": 40, "name": "Correos 2", "meters": 210 },
    { "stopId": 42, "name": "Jesús de Monasterio 12", "meters": 185 }
  ]
}
```

**404:**
```json
{ "error": "stop_not_found", "message": "La parada 999 no existe" }
```

---

#### GET /api/v1/stops/:stop/arrivals

**Propósito:** Llegadas en tiempo real.

**Parámetros opcionales:** `?line=LC&refresh=true`

**Flujo interno:**
1. Obtener datos de la parada (Open Data)
2. Llamar a Legacy API: `POST /api/v1/estimations/get-compact {stopId}`
3. Si `line` está presente, filtrar por esa línea
4. Enriquecer cada línea con:
   - color desde colors.json
   - upcomingStops con coordenadas desde Open Data/stops.min.json

**Caché:** 15 segundos (TTL en memoria)

**Salida 200 (con line=LC):**
```json
{
  "stop": { "stopId": 41, "name": "Plaza Ayuntamiento", "lat": 43.4617, "lng": -3.8102 },
  "updated": "2025-05-03T12:00:00Z",
  "arrivals": [
    {
      "line": "LC",
      "destination": "INT. AVDA. VALDECILLA",
      "color": "#172EFF",
      "minutes": 8,
      "next": 22,
      "active": true,
      "stops": [
        { "name": "SAN FERNANDO 22", "stopId": 43, "lat": 43.4604, "lng": -3.8199 }
      ]
    }
  ],
  "all_lines": ["1", "2", "11", "LC", "N1"]
}
```

---

### 5.2 LIGHTWEIGHT (5 endpoints)

---

#### GET /api/v1/stops/:stop/next

**Propósito:** Solo el próximo bus. Respuesta mínima.

**Flujo interno:** Igual que arrivals pero solo devuelve el primer elemento.

**Salida 200:**
```json
{ "line": "LC", "destination": "INT. AVDA. VALDECILLA", "minutes": 8, "color": "#172EFF" }
```

**Cuando no hay buses:**
```json
{ "line": null, "destination": null, "minutes": null, "color": null }
```

---

#### GET /api/v1/stops/:stop/next/:line

**Propósito:** Próximo de una línea concreta.

**Ejemplo:** `GET /api/v1/stops/41/next/LC`

**Flujo interno:**
1. Llamar a Legacy API con lineLabel
2. Devolver solo los datos de esa línea

**Salida 200:**
```json
{ "line": "LC", "destination": "INT. AVDA. VALDECILLA", "minutes": 8, "next": 22, "color": "#172EFF", "active": true }
```

---

#### GET /api/v1/stops/:stop/arrivals/:line

**Propósito:** Llegadas de una línea concreta.

**Ejemplo:** `GET /api/v1/stops/41/arrivals/LC`

**Salida 200:**
```json
{
  "line": "LC",
  "destination": "INT. AVDA. VALDECILLA",
  "color": "#172EFF",
  "minutes": 8,
  "next": 22,
  "active": true
}
```

---

#### GET /api/v1/lines/:line/next-at/:stop

**Propósito:** Búsqueda inversa: "tengo la línea, ¿cuándo llega a mi parada?"

**Ejemplo:** `GET /api/v1/lines/LC/next-at/41`

**Flujo interno:** Idéntico a `/stops/:stop/next/:line` pero con parámetros invertidos.

**Salida 200:**
```json
{
  "line": "LC",
  "stop": 41,
  "stop_name": "Plaza Ayuntamiento",
  "destination": "INT. AVDA. VALDECILLA",
  "minutes": 8,
  "next": 22,
  "active": true
}
```

---

#### GET /api/v1/stops/:stop/etd

**Propósito:** Hora exacta estimada de salida (no "en X minutos").

**Flujo interno:**
1. Obtener `arrivals`
2. Para cada llegada, calcular: `server_time + minutes` → ISO 8601
3. Devolver con `etd` y `etd_local`

**Salida 200:**
```json
{
  "stop": 41,
  "server_time": "2025-05-03T12:05:00Z",
  "arrivals": [
    {
      "line": "LC",
      "destination": "INT. AVDA. VALDECILLA",
      "color": "#172EFF",
      "minutes": 8,
      "etd": "2025-05-03T12:13:00Z",
      "etd_local": "14:13"
    }
  ]
}
```

---

### 5.3 MAP (3 endpoints)

---

#### GET /api/v1/map/stops

**Propósito:** Todas las paradas en formato compacto para pintar en mapa.

**Salida 200:**
```json
{
  "stops": [
    [41, 43.4617, -3.8102, "Plaza Ayuntamiento"],
    [42, 43.4618, -3.8128, "Jesús de Monasterio 12"]
  ],
  "total": 462,
  "source": "open_data"
}
```

**Caché sugerida en cliente:** `Cache-Control: public, max-age=3600`

---

#### GET /api/v1/map/lines/:line

**Propósito:** Ruta de una línea en GeoJSON.

**Salida 200:**
```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "properties": {
      "line": "LC",
      "direction": "1",
      "destination": "INT. AVDA. VALDECILLA",
      "color": "#172EFF"
    },
    "geometry": {
      "type": "LineString",
      "coordinates": [
        [-3.7914, 43.4777],
        [-3.8102, 43.4617],
        [-3.8317, 43.4568]
      ]
    }
  }]
}
```

---

#### GET /api/v1/map/lines

**Propósito:** Todas las líneas en GeoJSON.

**Salida 200:** FeatureCollection con todas las líneas.

---

### 5.4 TRIP (2 endpoints)

---

#### GET /api/v1/trip

**Propósito:** Planificar viaje entre dos paradas.

**Parámetros requeridos:** `?from=41&to=512`

**Algoritmo interno:**
1. Obtener todas las líneas que pasan por `from`
2. Para cada línea, obtener su ruta
3. Si alguna para en `to` → viaje directo
4. Si no, buscar intersecciones:
   a. Para cada línea de `from`, ver qué paradas tiene en común con líneas de `to`
   b. Sugerir transbordo en la parada común

**Salida 200:**
```json
{
  "from": { "stopId": 41, "name": "Plaza Ayuntamiento" },
  "to": { "stopId": 512, "name": "Intercambiador Avda. Valdecilla" },
  "options": [
    {
      "type": "direct",
      "duration_min": 15,
      "line": "LC",
      "color": "#172EFF",
      "stops": 3,
      "direction": "INT. AVDA. VALDECILLA"
    }
  ]
}
```

---

#### GET /api/v1/stops/:stop/connections

**Propósito:** Paradas alcanzables sin transbordo.

**Flujo interno:** Para cada línea que pasa por `:stop`, devolver las siguientes paradas en la ruta.

---

### 5.5 BATCH (3 endpoints)

---

#### POST /api/v1/batch/arrivals

**Propósito:** Llegadas de varias paradas en una llamada.

**Entrada:**
```json
{ "stops": [41, 171, 516], "lines": ["LC", "1"] }
```

**Flujo interno:**
1. Llamar a Legacy API en paralelo para cada parada (máx 5 concurrentes)
2. Timeout por parada: 5s
3. Las que fallen aparecen en `errors`

**Salida 200:**
```json
{
  "results": [
    { "stop": 41, "name": "Plaza Ayuntamiento", "arrivals": [{"line": "LC", "minutes": 8}] }
  ],
  "errors": [],
  "elapsed_ms": 320
}
```

---

#### POST /api/v1/batch/stops

**Propósito:** Información de varias paradas.

**Entrada:** `{ "stops": [41, 171, 516] }`

**Flujo interno:** Búsqueda local en Open Data + stops.min.json. Instantáneo.

---

#### POST /api/v1/batch/lines

**Propósito:** Información de varias líneas.

**Entrada:** `{ "lines": ["LC", "1", "N1"] }`

**Flujo interno:** Búsqueda local en lineIndex. Instantáneo.

---

### 5.6 COMPARE (2 endpoints)

---

#### POST /api/v1/compare/lines

**Propósito:** Comparar líneas lado a lado.

**Entrada:** `{ "lines": ["LC", "1"] }`

**Salida 200:**
```json
{
  "lines": [
    { "id": "LC", "stops": 18, "common_stops_with": { "1": 5 } },
    { "id": "1", "stops": 74, "common_stops_with": { "LC": 5 } }
  ],
  "common_stops": [39, 40, 41, 42, 43]
}
```

---

#### GET /api/v1/lines/:lineA/intersect/:lineB

**Propósito:** Paradas donde coinciden dos líneas.

**Ejemplo:** `GET /api/v1/lines/LC/intersect/1`

**Flujo interno:** Intersección de arrays de stopIds de ambas líneas.

---

### 5.7 TIME (2 endpoints)

---

#### GET /api/v1/now

**Propósito:** Hora actual del servidor.

**Salida 200:**
```json
{
  "server_time": "2025-05-03T12:05:00Z",
  "timezone": "Europe/Madrid",
  "local_time": "2025-05-03T14:05:00+02:00"
}
```

---

#### GET /api/v1/stops/:stop/arrivals/absolute

**Propósito:** Llegadas con hora exacta.

**Flujo interno:** Suma server_time + minutes para cada llegada.

---

### 5.8 FARES (4 endpoints)

---

#### GET /api/v1/fares

**Propósito:** Listar todas las tarjetas/abonos.

**Fuente:** data/cards.json

**Salida 200:**
```json
{
  "fares": [
    {
      "id": "estandar",
      "name": "Tarjeta estándar recargable",
      "type": "payAsYouGo",
      "price_per_trip": 0.40,
      "color": "blue",
      "features": [
        { "title": "Coste del Viaje (2025)", "detail": "0,33 € (1er semestre) y 0,40 € (2º semestre)" },
        { "title": "Recargas", "detail": "Recarga mínima de 6 €" }
      ]
    }
  ],
  "total": 7
}
```

---

#### GET /api/v1/fares/:id

**Propósito:** Detalle de una tarjeta.

**Ejemplo:** `GET /api/v1/fares/jovenTrimestral`

---

#### GET /api/v1/fares/compare

**Propósito:** Comparativa de todas las tarjetas.

**Salida 200:** Array plano con todas las tarjetas y campos normalizados.

---

#### GET /api/v1/fares/calculator

**Propósito:** Calcular opción más barata según uso.

**Parámetros:** `?trips=40&age=16`

**Algoritmo interno:**
1. Si `trips` < 0 → error
2. Calcular coste de payAsYouGo: `trips * 0.40`
3. Si `age` ≤ 25: incluir jovenTrimestral (`25.50€ / (trimestre/mes)`)
4. Devolver opciones ordenadas por precio

**Salida 200:**
```json
{
  "trips_per_month": 40,
  "age": 30,
  "options": [
    { "id": "estandar", "name": "Tarjeta estándar", "monthly_cost": 16.00 },
    { "id": "jovenTrimestral", "name": "Carné Trimestral Joven", "monthly_cost": 8.50, "eligible": false, "reason": "Edad máxima: 25 años" }
  ],
  "cheapest": { "id": "estandar", "monthly_cost": 16.00 }
}
```

---

### 5.9 SCHEDULES (3 endpoints)

---

#### GET /api/v1/schedule/lines/:line

**Propósito:** Horarios programados de una línea.

**Parámetros:** `?day=L|S|F&direction=1|2`

**Flujo interno:**
1. `:line` → mapear a scheduleId
2. Construir clave: `"{scheduleId}-{direction}"`
3. Buscar en schedules.json
4. Devolver array de horas

**Salida 200:**
```json
{
  "line": "LC",
  "direction": "1",
  "day": "L",
  "day_name": "Laborables",
  "times": ["07:08", "07:23", "07:38", "07:53", "08:08", ...],
  "total": 62,
  "first": "07:08",
  "last": "22:23",
  "frequency_min": 15,
  "source": "static"
}
```

---

#### GET /api/v1/schedule/lines/:line/next

**Propósito:** Próximo horario programado.

**Flujo interno:**
1. Obtener horarios del día actual (L/S/F según fecha)
2. Calcular día de la semana:
   - Si es finde → domingo = F, sábado = S
   - Si es laborable → L
3. Encontrar la próxima hora ≥ hora actual
4. Si no hay más servicios hoy → "service_ended"

**Salida 200:**
```json
{
  "line": "LC",
  "direction": "1",
  "day": "L",
  "now": "12:05",
  "next": { "time": "12:08", "minutes_from_now": 3 },
  "status": "active"
}
```

**Si no hay más servicios:**
```json
{ "status": "service_ended", "message": "No hay más servicios programados para hoy" }
```

---

#### GET /api/v1/schedule/stops/:stop

**Propósito:** Horarios de todas las líneas en una parada.

**Flujo interno:**
1. Obtener líneas que pasan por `:stop`
2. Para cada línea, obtener sus horarios
3. Devolver agregados

---

### 5.10 ALERTS (2 endpoints)

---

#### GET /api/v1/alerts

**Propósito:** Alertas activas del servicio.

**Salida 200:** `{ "alerts": [], "total": 0, "source": "static" }`

*(Preparado para futura integración con scraping de incidencias)*

---

#### GET /api/v1/lines/:line/status

**Propósito:** Estado operativo de una línea.

**Flujo interno:**
1. Obtener información de la línea
2. LLamar a estimaciones para la línea
3. Cruzar con horarios programados

**Salida 200:**
```json
{
  "line": "LC",
  "active": true,
  "frequency_min": 15,
  "has_alerts": false,
  "alerts": [],
  "last_known_bus_minutes_ago": 3,
  "schedule": {
    "status": "active",
    "next_scheduled": "12:08",
    "service_hours": { "first": "07:08", "last": "22:23" }
  }
}
```

---

### 5.11 DISCOVERY (2 endpoints)

---

#### GET /api/v1/discover

**Propósito:** Todo lo que una app necesita al arrancar.

**Salida 200:**
```json
{
  "app": { "name": "Transit API Wrapper", "version": "3.0.0" },
  "lines": { "total": 25, "url": "/api/v1/lines" },
  "stops": {
    "total": 462,
    "search_url": "/api/v1/stops?q={query}",
    "nearby_url": "/api/v1/stops/nearby?lat={lat}&lng={lng}"
  },
  "fares": { "total": 7, "url": "/api/v1/fares" },
  "endpoints": { "total": 37 },
  "status": { "legacy_api": "ok", "open_data": "ok" }
}
```

#### HEAD /api/v1/discover

**Propósito:** Solo cabeceras.

**Cabeceras de respuesta:**
```
X-API-Version: 3.0.0
X-Cache-Stops: 462
X-Cache-Lines: 25
X-Legacy-Status: ok
X-OpenData-Status: ok
```

---

### 5.12 DX (2 endpoints)

#### OPTIONS /api/v1

**Propósito:** Descubrimiento de endpoints.
```
Allow: GET, POST, HEAD, OPTIONS
Link: </api/v1/lines>; rel="lines"
Link: </api/v1/stops>; rel="stops"
Link: </api/v1/discover>; rel="discover"
Link: </api/v1/fares>; rel="fares"
Link: </api/v1/trip>; rel="trip-planner"
```

#### OPTIONS /api/v1/stops/:stop
```
Allow: GET, OPTIONS
Link: </api/v1/stops/41>; rel="self"
Link: </api/v1/stops/41/arrivals>; rel="arrivals"
Link: </api/v1/stops/41/next>; rel="next-bus"
Link: </api/v1/stops/41/etd>; rel="etd"
```

---

## 6. Diagramas de Flujo Interno

### 6.1 Flujo de Llegadas en Tiempo Real

```
GET /api/v1/stops/41/arrivals
           │
           ▼
    ┌──────────────┐
    │ Buscar parada │─── Open Data OK ──→ nombre, lat, lng, sentido
    │ en Open Data  │
    └──────┬───────┘
           │ (no encontrada)
           ▼
    ┌──────────────┐
    │ Buscar en     │─── OK ──→ nombre, lat, lng (fallback)
    │ stops.min.json│
    └──────┬───────┘
           │ (no encontrada)
           ▼
        404 stop_not_found
           │
           ▼ (parada encontrada)
    ┌──────────────────────────────┐
    │ Llamar a Legacy API          │
    │ POST /estimations/get-compact│
    │ Body: {stopId: 41}           │
    └──────────┬───────────────────┘
               │
               ▼
    ┌──────────────────────────────┐
    │ Parsear respuesta compacta    │
    │ [ [line, dest, next, follow], │
    │   allLineLabels ]             │
    └──────────┬───────────────────┘
               │
               ▼
    ┌──────────────────────────────┐
    │ Enriquecer cada línea:       │
    │ - color desde colors.json    │
    │ - upcomingStops GPS desde    │
    │   Open Data / stops.min.json │
    └──────────┬───────────────────┘
               │
               ▼
        200 OK (respuesta JSON)
```

### 6.2 Flujo de Obtención de Líneas (lineIndex)

```
Arranque del wrapper
        │
        ▼
┌───────────────────────────────┐
│ ¿lineIndex.json existe en     │
│ memoria?                      │
└───────────┬───────────────────┘
            │
       (no) ▼
┌───────────────────────────────┐
│ Llamar a Legacy API:          │
│ POST /estimations/get-compact │
│ Body: {stopId: 41}            │
└───────────┬───────────────────┘
            │
            ▼ (allLineLabels obtenido)
┌───────────────────────────────┐
│ Para cada línea en             │
│ allLineLabels:                 │
└───────────┬───────────────────┘
            │
            ▼
┌───────────────────────────────┐
│ POST /routes/get-compact      │
│ {stopId: inicio, lineLabel}   │
│ → dirección 1                 │
└───────────┬───────────────────┘
            │
            ▼
┌───────────────────────────────┐
│ POST /routes/get-compact      │
│ {stopId: final, lineLabel}    │
│ → dirección 2                 │
└───────────┬───────────────────┘
            │
            ▼
┌───────────────────────────────┐
│ Enriquecer con:               │
│ - colors.json (colores)       │
│ - schedules.json (horarios)   │
│ - Open Data (coordenadas)     │
└───────────┬───────────────────┘
            │
            ▼
┌───────────────────────────────┐
│ Guardar en memoria (lineIndex)│
│ y persistir a disco           │
└───────────────────────────────┘
```

### 6.3 Flujo de Planificación de Viaje

```
GET /api/v1/trip?from=41&to=512
        │
        ▼
┌───────────────────────────────┐
│ Obtener líneas que pasan      │
│ por from=41 y to=512          │
│ (desde lineIndex)             │
└───────────┬───────────────────┘
            │
            ▼
┌───────────────────────────────┐
│ ¿Hay línea que pase por ambas?│
│ Sí → viaje directo            │
│ No → buscar intersecciones    │
└───────────┬───────────────────┘
            │
       (sí) ▼              (no) ▼
┌──────────────┐   ┌──────────────────┐
│ Devolver     │   │ Para cada línea   │
│ opción       │   │ de from, buscar   │
│ directa      │   │ intersección con  │
└──────────────┘   │ líneas de to      │
                   └────────┬─────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │ Devolver opciones │
                   │ con transbordo    │
                   └──────────────────┘
```

---

## 7. Manejo de Errores

### 7.1 Formato Unificado

```json
{
  "error": "error_code",
  "message": "Descripción del error",
  "source": "open_data | legacy_api | static | cache",
  "timestamp": "2025-05-03T12:00:00Z"
}
```

### 7.2 Tabla de Códigos de Error

| HTTP | error_code | Causa | Source típico |
|:---|---:|---:|---:|
| 400 | `invalid_params` | Parámetros faltantes o inválidos | — |
| 400 | `invalid_trip_params` | Faltan `from` o `to` | — |
| 404 | `stop_not_found` | El stopId no existe | open_data / stops_min |
| 404 | `line_not_found` | La línea no existe | cache |
| 404 | `fare_not_found` | La tarjeta no existe | static |
| 404 | `schedule_not_found` | La línea no tiene horarios | static |
| 503 | `legacy_unavailable` | Legacy API no responde | legacy_api |
| 503 | `open_data_unavailable` | Open Data no responde | open_data |
| 503 | `lines_not_indexed` | lineIndex no generado aún | cache |
| 500 | `internal_error` | Error inesperado | — |

### 7.3 Reglas de Null Safety

- **Ningún campo es `undefined`.** Si no hay valor, es `null`.
- Los arrays siempre están presentes (vacíos si no hay resultados).
- `minutes` puede ser `null` si no hay datos de esa línea.
- `active: false` indica que la línea existe pero no tiene servicio activo ahora.

---

## 8. Plan de Implementación

### Fase 1: Scaffolding (30 min)
- Crear estructura de directorios `src/routes/`, `src/sources/`, `src/utils/`
- Configurar Express con middleware (CORS, JSON parser, error handler)
- Implementar `config.ts` con todas las URLs y constantes

### Fase 2: Carga de Datos (1 hora)
- Implementar `openData.ts`: fetch + parse de 462 paradas
- Implementar `legacyApi.ts`: cliente para estimaciones y rutas
- Cargar datos estáticos: colors.json, cards.json, schedules.json, stops.min.json
- Implementar `lineIndex.ts`: generación de catálogo de líneas

### Fase 3: Endpoints CORE (1 hora)
- health.ts, lines.ts, stops.ts, arrivals.ts

### Fase 4: Endpoints Especializados (1.5 horas)
- lightweight.ts (next, next/:line, etd)
- map.ts (GeoJSON)
- trip.ts (planificador)
- batch.ts (multillamada paralela)
- compare.ts (comparación)
- time.ts (etd absoluto)

### Fase 5: Endpoints de Datos Estáticos (1 hora)
- fares.ts (cards.json)
- schedules.ts (schedules.json)
- alerts.ts (vacío)

### Fase 6: Discovery y DX (30 min)
- discover.ts
- dx.ts (OPTIONS)
- Middleware de errores global

### Fase 7: Tests y Documentación (30 min)
- Tests básicos de cada endpoint
- Swagger/OpenAPI
- README

**Tiempo total estimado:** ~6 horas
