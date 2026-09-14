# Análisis Cualitativo Documental — Dirección de Políticas del SERFOR

**v.2 · SERFOR — Oficina de Tecnologías de la Información**

Aplicación web que evalúa documentos institucionales (informes técnicos, TDR,
proyectos normativos) contra una matriz de criterios ponderados, y los contrasta
con el catálogo normativo de la entidad.

La interfaz se publica con el nombre **DocuCalidad**.

## Origen

Esta versión reproduce el front y el back del prototipo publicado en
`evaluador-cualitativo-documental.serfor-oti-7899.chatgpt.site`, reconstruidos
como código fuente propio y auditable. El detalle de qué se copió tal cual, qué
se completó y qué falta está en
[`docs/comparacion-con-el-original.md`](docs/comparacion-con-el-original.md).

## Cómo levantarlo

Requiere **Node 22.5 o superior** (usa el SQLite integrado de Node, `node:sqlite`;
no hay dependencias nativas que compilar).

```bash
npm install
npm run dev
```

La aplicación queda en <http://localhost:3000>. La base SQLite se crea sola en
`data/docucalidad.db` con la matriz de criterios por omisión ya cargada.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm start` | Sirve la compilación de producción |
| `npm run typecheck` | Verificación de tipos sin emitir |

## Módulos

| Sección | Estado |
|---|---|
| **Resumen** | Panel de indicadores, calidad por dimensión y bandeja de hallazgos. Los valores son de demostración (ver `src/lib/demo.ts`). |
| **Documentos** | Repositorio documental persistido. Registro y listado operativos. |
| **Evaluaciones** | Ejecución de evaluaciones y administración de matrices de criterios. Operativo. |
| **Catálogo normativo** | Catálogo persistido, con carga de las 10 referencias prioritarias del inventario interno. |
| **Usuarios y roles** | Marcador; sin implementación. |
| **Configuración** | Marcador; sin implementación. |

## API

Todas las rutas responden JSON.

| Método y ruta | Descripción |
|---|---|
| `GET /api/documents` | Lista el repositorio documental. |
| `POST /api/documents` | Registra un documento. Cuerpo: `{ title, document_type }`. |
| `GET /api/evaluations` | Documentos evaluables y matrices con sus criterios. |
| `POST /api/evaluations` | Ejecuta una evaluación. Cuerpo: `{ document_id, template_id }`. |
| `POST /api/evaluations/templates` | Crea una matriz. Cuerpo: `{ name, document_type, criteria[] }`. Rechaza con 422 si las ponderaciones no suman 100. |
| `GET /api/catalog` | Normas del catálogo. |
| `POST /api/catalog` | Incorpora las referencias prioritarias del inventario interno. |

### Cálculo del puntaje

`POST /api/evaluations` **no ejecuta todavía un análisis del contenido del
documento**. Calcula un puntaje ponderado determinista a partir del
identificador del documento y de los pesos de la matriz, de modo que el flujo
completo (ejecutar → actualizar estado → reflejar en el repositorio) sea
reproducible y verificable. El umbral de estados es:

| Puntaje | Severidad | Estado |
|---|---|---|
| ≥ 85 | Bajo | Conforme |
| 75 – 84 | Medio | En revisión |
| < 75 | Alto | Observado |

Sustituir `computeScore` en `src/app/api/evaluations/route.ts` por el motor real
es el siguiente paso; el resto del flujo no necesita cambios.

## Estructura

```
src/
  app/
    api/
      documents/route.ts              GET, POST
      evaluations/route.ts            GET, POST (ejecutar evaluación)
      evaluations/templates/route.ts  POST (crear matriz)
      catalog/route.ts                GET, POST
    layout.tsx  globals.css  page.tsx
  components/                         Vistas y modales
  lib/
    db.ts       Conexión y esquema SQLite
    sqlite.ts   Ayudas tipadas y transacciones
    seed.ts     Carga inicial idempotente
    rubric.ts   Rúbrica base y normas prioritarias
    demo.ts     Datos de demostración del panel de resumen
    types.ts    Tipos compartidos
    sections.ts Secciones del espacio de trabajo
```

## Base de datos

SQLite, archivo único. La ruta se configura con `SACD_DB_PATH` (ver
`.env.example`). El esquema se crea al primer arranque e incluye `documents`,
`templates`, `criteria`, `evaluations`, `findings` y `norms`.

El directorio `data/` está excluido del control de versiones.

## Pendientes conocidos

- Motor de análisis real (extracción de texto, verificación de citas, detección
  de duplicidad). Hoy el puntaje es determinista, no analítico.
- El archivo cargado en «Incorporar documento» no se almacena: solo se toma su
  nombre como título. Falta almacenamiento de binarios y extracción de texto.
- Autenticación y autorización. La sesión de la barra lateral es fija.
- Los módulos «Usuarios y roles» y «Configuración» son marcadores.
- El panel de resumen usa datos de demostración, no consultas a la base.
