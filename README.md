# 🚌 Transit API Wrapper — TUS Santander

API REST unificada para el Transporte Urbano de Santander (TUS). Envuelve múltiples fuentes de datos — Open Data, API en tiempo real y datos estáticos — en **37 endpoints** limpios y coherentes.

## 🏗️ Arquitectura

```
Cliente (app / web / CLI)
        │
        ▼
┌──────────────────────────────┐
│   Transit API Wrapper         │
│   Node.js + Express + TS     │
│                              │
│  ┌────────┐  ┌────────────┐  │
│  │ Routes │  │ Cache (mem)│  │
│  │ 37 EP  │  │ Map<K,V>   │  │
│  └────────┘  └────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │   Orquestador fuentes   │  │
│  └────────────────────────┘  │
└──────────┬───────────────────┘
           │
    ┌──────┼──────┐
    ▼      ▼      ▼
┌──────┐ ┌─────┐ ┌────────┐
│Open  │ │Legacy│ │Estática│
│Data  │ │API   │ │(JSON)  │
│462   │ │Real- │ │Horarios│
│parada│ │time  │ │Tarifas │
└──────┘ └─────┘ └────────┘
```

## 📡 Fuentes de datos

| Fuente | Qué aporta | URL |
|--------|-----------|-----|
| **Open Data Santander** | 462 paradas con GPS, nombres, direcciones | `datos.santander.es` |
| **Legacy API TUS** | Estimaciones en tiempo real, rutas | `transitserver.miguelripoll23.deno.net` |
| **stops.min.json** | ~350 paradas de respaldo | Archivo local |
| **schedules.json** | Horarios programados (~3200) | Archivo local |
| **colors.json** | Colores RGB por línea | Archivo local |
| **cards.json** | 7 tarjetas/abonos TUS | Archivo local |

## 🔌 Endpoints (37)

### CORE
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/health` | Estado de todas las fuentes |
| `GET` | `/api/v1/lines` | Catálogo completo de líneas |
| `GET` | `/api/v1/lines/:line` | Detalle de una línea |
| `GET` | `/api/v1/lines/:line/route` | Ruta con coordenadas GPS |
| `GET` | `/api/v1/stops` | Buscar paradas (`?q=plaza`) |
| `GET` | `/api/v1/stops/:stop` | Detalle de parada + cercanas |
| `GET` | `/api/v1/stops/:stop/arrivals` | Llegadas en tiempo real |

### LIGEROS
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/stops/:stop/next` | Solo el próximo bus |
| `GET` | `/api/v1/stops/:stop/next/:line` | Próximo bus de línea X |
| `GET` | `/api/v1/stops/:stop/arrivals/:line` | Llegadas filtradas por línea |
| `GET` | `/api/v1/lines/:line/next-at/:stop` | ¿Cuándo pasa la línea X? |
| `GET` | `/api/v1/stops/:stop/etd` | Hora estimada de salida |

### MAPA
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/map/stops` | 462 paradas formato compacto |
| `GET` | `/api/v1/map/lines/:line` | Ruta en GeoJSON |
| `GET` | `/api/v1/map/lines` | Todas las líneas en GeoJSON |

### PLANIFICADOR
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/trip?from=X&to=Y` | Planificar viaje (directo/transbordo) |
| `GET` | `/api/v1/stops/:stop/connections` | Paradas alcanzables sin transbordo |

### BATCH
| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/v1/batch/arrivals` | Llegadas de varias paradas |
| `POST` | `/api/v1/batch/stops` | Info de varias paradas |
| `POST` | `/api/v1/batch/lines` | Info de varias líneas |

### COMPARACIÓN
| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/v1/compare/lines` | Comparar líneas lado a lado |
| `GET` | `/api/v1/lines/:A/intersect/:B` | Paradas comunes entre 2 líneas |

### TIEMPO
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/now` | Hora del servidor |
| `GET` | `/api/v1/stops/:stop/arrivals/absolute` | Llegadas con hora exacta |

### TARIFAS
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/fares` | Listar 7 tarjetas/abonos |
| `GET` | `/api/v1/fares/:id` | Detalle de una tarjeta |
| `GET` | `/api/v1/fares/compare` | Comparativa de tarifas |
| `GET` | `/api/v1/fares/calculator` | Calculadora (`?trips=40&age=16`) |

### HORARIOS
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/schedule/lines/:line` | Horarios (`?day=L&direction=1`) |
| `GET` | `/api/v1/schedule/lines/:line/next` | Próximo horario programado |
| `GET` | `/api/v1/schedule/stops/:stop` | Horarios de todas las líneas en parada |

### ALERTAS
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/alerts` | Alertas activas |
| `GET` | `/api/v1/lines/:line/status` | Estado operativo de línea |

### DISCOVERY + DX
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/discover` | Todo lo que una app necesita al arrancar |
| `HEAD` | `/api/v1/discover` | Solo cabeceras |
| `OPTIONS` | `/api/v1` | Endpoints disponibles |
| `OPTIONS` | `/api/v1/stops/:stop` | Acciones sobre esta parada |

## 🆔 Sistema de IDs de línea

Las líneas tienen 3 IDs distintas según el sistema:

| Línea | Legacy API | Schedules | Normalizada |
|-------|-----------|-----------|-------------|
| 1-18  | "1"-"18"  | "1"-"18"  | 1-18 |
| LC    | "LC"      | **"C"**   | 100 |
| N1    | "N1"      | **"101"** | 101 |
| 6C1   | "6C1"     | **"61"**  | 61 |
| 7C1   | "7C1"     | **"71"**  | 71 |
| 24C1  | "24C1"    | **"241"** | 241 |

El wrapper traduce automáticamente entre sistemas.

## 📦 Instalación

```bash
git clone https://github.com/ebroelevado/transit-api-wrapper.git
cd transit-api-wrapper
npm install
```

## 🚀 Uso

```bash
# Desarrollo (hot reload)
npm run dev

# Producción
npm run build
npm start
```

El servidor escucha en `http://localhost:3000`.

## 📋 Ejemplos

```bash
# Health check
curl http://localhost:3000/api/v1/health

# Buscar paradas
curl "http://localhost:3000/api/v1/stops?q=plaza"

# Llegadas en Plaza Ayuntamiento (stop 41)
curl http://localhost:3000/api/v1/stops/41/arrivals

# Próximo bus de la LC
curl http://localhost:3000/api/v1/stops/41/next/LC

# Horarios de la LC dirección 1 en laborables
curl "http://localhost:3000/api/v1/schedule/lines/LC?day=L&direction=1"

# Planificar viaje
curl "http://localhost:3000/api/v1/trip?from=41&to=512"

# Tarifas
curl http://localhost:3000/api/v1/fares

# Calculadora de tarifas (40 viajes/mes, 30 años)
curl "http://localhost:3000/api/v1/fares/calculator?trips=40&age=30"

# Todas las paradas para mapa
curl http://localhost:3000/api/v1/map/stops
```

## 🛠️ Stack

| Componente | Tecnología |
|-----------|-----------|
| Runtime | Node.js ≥18 |
| Framework | Express 4.x |
| Lenguaje | TypeScript 5.x |
| HTTP client | node-fetch 2.x |
| Cache | Map<K,V> en memoria |
| BaaS | INS4G (opcional) |

## 📁 Estructura

```
src/
├── index.ts              # Servidor Express (puerto 3000)
├── config.ts             # URLs, constantes, TTLs
├── types.ts              # Tipos (Stop, Arrival, LineInfo...)
├── sources/
│   ├── openData.ts       # Open Data Santander (462 paradas)
│   ├── legacyApi.ts      # Legacy API TUS (tiempo real)
│   └── lineIndex.ts      # Catálogo de líneas (generado)
├── routes/
│   ├── health.ts         # Health check
│   ├── discover.ts       # Discovery endpoint
│   ├── lines.ts          # Líneas
│   ├── stops.ts          # Paradas
│   ├── arrivals.ts       # Llegadas en tiempo real
│   ├── map.ts            # GeoJSON
│   ├── trip.ts           # Planificador de viajes
│   ├── batch.ts          # Llamadas múltiples
│   ├── compare.ts        # Comparación de líneas
│   ├── time.ts           # ETD / hora servidor
│   ├── fares.ts          # Tarifas y abonos
│   ├── schedules.ts      # Horarios programados
│   ├── alerts.ts         # Alertas de servicio
│   └── dx.ts             # OPTIONS / descubrimiento
└── utils/
    ├── haversine.ts      # Distancia GPS
    └── lineMapping.ts    # Mapeo de IDs de línea
```

## 🔒 Convenciones

- **Null safety:** nunca `undefined`, siempre `null`
- **Arrays:** siempre presentes (vacíos si no hay datos)
- **Timestamps:** ISO 8601
- **Source:** `open_data`, `legacy_api`, `static`, `stops_min`
- **Errores:** `{ error, message, source, timestamp }`
